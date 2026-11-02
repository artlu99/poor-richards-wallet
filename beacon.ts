import { bls12_381 } from "@noble/curves/bls12-381.js";
import { sha256 } from "@noble/hashes/sha256.js";
import { randomBytes, scryptSync } from "node:crypto";
import * as v from "valibot";

// https://docs.drand.love/developer/ — mainnet endpoints for the quicknet beacon.
const ENDPOINTS = [
  "https://api.drand.sh",
  "https://api2.drand.sh",
  "https://api3.drand.sh",
];

// Pinned quicknet chain parameters. The group key is the commitment for every
// signature check below; changing these lines would silently trust new keys.
const QUICKNET_GROUP_KEY_HEX =
  "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";
const QUICKNET_CHAIN_HASH =
  "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";

// scheme "bls-unchained-g1-rfc9380": signatures on G1 (48 bytes), pubkey on G2,
// message = sha256(round as big-endian u64), RFC 9380 hash-to-curve, basic DST.
// Verified empirically against live quicknet rounds; see beacon.test.ts.
const DST_G1 = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

// Do not draw rounds newer than this margin: they are certainly published on
// every mirror, and "latest" responses may lag or be cached.
const SAFETY_MARGIN = 5;

// How many historical signatures to mix. Eight draws over ~33M rounds gives a
// candidate space around 2^200 for an adversary who must enumerate them all.
const SCAFFOLD_DRAWS = 8;

const ROUND_INFO_SCHEMA = v.object({
  public_key: v.pipe(v.string(), v.hexadecimal()),
  period: v.number(),
  genesis_time: v.number(),
  chain_hash: v.pipe(v.string(), v.hexadecimal()),
  scheme: v.string(),
  beacon_id: v.string(),
});

const ROUND_SCHEMA = v.object({
  round: v.number(),
  signature: v.pipe(v.string(), v.hexadecimal()),
});

const DOMAIN = new TextEncoder().encode("poor-richards-wallet/hardened-key/v1");
const SCRYPT_PARAMS = { N: 2 ** 17, r: 8, p: 1, maxmem: 2 ** 28 } as const;

const groupKey = bls12_381.G2.ProjectivePoint.fromHex(QUICKNET_GROUP_KEY_HEX);
const g2Generator = bls12_381.G2.ProjectivePoint.BASE;

/** sha256(be_u64(round)) — the message quicknet signs for an unchained round. */
function roundMessage(round: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(round), false);
  return sha256(bytes);
}

/**
 * Check a quicknet signature against the pinned League of Entropy group key.
 * Genuine signatures pass; forgeries and replays from other chains fail.
 */
export function verifyQuicknetSignature(round: number, sigHex: string): boolean {
  try {
    const hashed = bls12_381.G1.hashToCurve(roundMessage(round), {
      DST: new TextEncoder().encode(DST_G1),
    });
    const sig = bls12_381.G1.ProjectivePoint.fromHex(sigHex);
    return bls12_381.fields.Fp12.eql(
      bls12_381.pairing(hashed, groupKey),
      bls12_381.pairing(sig, g2Generator),
    );
  } catch {
    return false;
  }
}

async function fetchJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

async function fetchRoundSignatureHex(
  endpoint: string,
  round: number,
): Promise<string> {
  const url =
    round > 0
      ? `${endpoint}/v2/beacons/quicknet/rounds/${round}`
      : `${endpoint}/v2/beacons/quicknet/rounds/latest`;
  const data = v.parse(ROUND_SCHEMA, await fetchJson(url));
  return data.signature.toLowerCase();
}

/** Latest published quicknet round number, from the first live endpoint. */
export async function fetchLatestRound(): Promise<number> {
  for (const endpoint of ENDPOINTS) {
    try {
      const url = `${endpoint}/v2/beacons/quicknet/rounds/latest`;
      const data = v.parse(ROUND_SCHEMA, await fetchJson(url));
      return data.round;
    } catch {
      // try the next mirror
    }
  }
  throw new Error("no drand mirror reachable");
}

/**
 * Fetch one round from two independent mirrors, require identical bytes, and
 * verify the signature against the pinned group key. A single malicious or
 * replaying mirror cannot slip chosen scaffolding past this.
 */
export async function fetchVerifiedSignature(round: number): Promise<Uint8Array> {
  const [primary, secondary] = ENDPOINTS;
  const results = await Promise.allSettled([
    fetchRoundSignatureHex(primary, round),
    fetchRoundSignatureHex(secondary, round),
  ]);
  const values = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
  if (values.length === 0) throw new Error(`round ${round}: all mirrors failed`);
  const [first, second] = values;
  if (second !== undefined && first !== second) {
    throw new Error(`round ${round}: mirrors disagree`);
  }
  if (!verifyQuicknetSignature(round, first)) {
    throw new Error(`round ${round}: signature failed group-key verification`);
  }
  return Buffer.from(first, "hex");
}

type RandomBytesFn = (count: number) => Uint8Array;

/**
 * Draw `count` distinct round numbers, uniform over every published round
 * (1 .. latestRound - SAFETY_MARGIN) via rejection sampling — no modulo bias.
 * The indices are the caller's secret: nothing records them.
 */
export function drawHistoricalIndices(
  latestRound: number,
  count: number = SCAFFOLD_DRAWS,
  random: RandomBytesFn = randomBytes,
): number[] {
  if (latestRound <= SAFETY_MARGIN + 1) throw new Error("chain too short");
  const upper = latestRound - SAFETY_MARGIN; // inclusive
  const range = BigInt(upper);
  const limit = 1n << 64n;
  const maxUsable = limit - (limit % range);
  const draw = (): number => {
    for (;;) {
      const buf = random(8);
      const x = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getBigUint64(0);
      if (x < maxUsable) return Number(x % range) + 1;
    }
  };
  const out = new Set<number>();
  while (out.size < count) out.add(draw());
  return [...out];
}

/**
 * The one-way mix. key1 must come from one CSPRNG and the signatures must have
 * been selected by a different one — that independence is what makes the
 * "any one source turns out weak" property hold.
 */
export function hardenKey(key1: Uint8Array, signatures: Uint8Array[]): Uint8Array {
  if (key1.length !== 32) throw new Error("key1 must be 32 bytes");
  if (signatures.length < 1) throw new Error("need at least one signature");
  const input = Buffer.concat([key1, ...signatures]);
  return scryptSync(input, DOMAIN, 32, SCRYPT_PARAMS);
}

/** Check a chain's info response matches the pinned quicknet parameters. */
export function verifyChainInfo(info: unknown): boolean {
  const parsed = v.safeParse(ROUND_INFO_SCHEMA, info);
  if (!parsed.success) return false;
  const out = parsed.output;
  return (
    out.chain_hash === QUICKNET_CHAIN_HASH &&
    out.public_key === QUICKNET_GROUP_KEY_HEX &&
    out.beacon_id === "quicknet" &&
    out.period === 3
  );
}

export { SCAFFOLD_DRAWS, SAFETY_MARGIN, QUICKNET_GROUP_KEY_HEX, QUICKNET_CHAIN_HASH };

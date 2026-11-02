import { expect, test } from "bun:test";
import {
  drawHistoricalIndices,
  fetchLatestRound,
  fetchVerifiedSignature,
  hardenKey,
  verifyChainInfo,
  verifyQuicknetSignature,
} from "./beacon";

// Two signatures fetched live from api.drand.sh and api2.drand.sh (they agreed).
const KNOWN_ROUNDS: Array<[number, string]> = [
  [
    100000,
    "b389ee950d02e062419be63c5c71aecc7b2751edb81743927488bc74738af69e84d9d13b4b87e09e39ec97ec35f98968",
  ],
  [
    33609370,
    "8afe5077dcb946ba27b0da4b5d613db1c67fce2bdeeb277b36bdf2a59153bce7d6336c2db5ee4dde19283efa804b7235",
  ],
];

test("quicknet signatures verify against the pinned group key", () => {
  for (const [round, sig] of KNOWN_ROUNDS) {
    expect(verifyQuicknetSignature(round, sig)).toBe(true);
  }
});

test("forged or mismatched signatures fail verification", () => {
  const [round, sig] = KNOWN_ROUNDS[0];
  expect(verifyQuicknetSignature(round + 1, sig)).toBe(false);
  expect(verifyQuicknetSignature(round, sig.slice(0, -2) + "00")).toBe(false);
  expect(verifyQuicknetSignature(round, "00".repeat(48))).toBe(false);
  expect(verifyQuicknetSignature(round, "not-hex")).toBe(false);
});

const REAL_CHAIN_INFO = {
  public_key:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
  period: 3,
  genesis_time: 1692803367,
  genesis_seed:
    "f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e",
  chain_hash:
    "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  scheme: "bls-unchained-g1-rfc9380",
  beacon_id: "quicknet",
};

test("chain info validation accepts quicknet and rejects tampering", () => {
  expect(verifyChainInfo(REAL_CHAIN_INFO)).toBe(true);
  expect(
    verifyChainInfo({ ...REAL_CHAIN_INFO, public_key: "00".repeat(96) }),
  ).toBe(false);
  expect(verifyChainInfo({ ...REAL_CHAIN_INFO, period: 30 })).toBe(false);
});

function seededRng(seed: bigint) {
  return (count: number): Uint8Array => {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
      out[i] = Number((seed >> 32n) & 0xffn);
    }
    return out;
  };
}

test("historical draws stay in range, are distinct, and are reproducible", () => {
  const latest = 33_609_370;
  const a = drawHistoricalIndices(latest, 8, seededRng(1n));
  const b = drawHistoricalIndices(latest, 8, seededRng(1n));
  expect(a).toEqual(b);
  expect(a.length).toBe(8);
  expect(new Set(a).size).toBe(8);
  for (const i of a) {
    expect(i).toBeGreaterThanOrEqual(1);
    expect(i).toBeLessThanOrEqual(latest - 5);
  }
  expect(drawHistoricalIndices(latest, 8, seededRng(2n))).not.toEqual(a);
});

test("hardened key is deterministic, 32 bytes, and input-sensitive", () => {
  const key1 = new Uint8Array(32).fill(1);
  const sigs = [new Uint8Array(48).fill(2), new Uint8Array(48).fill(3)];
  const k1 = hardenKey(key1, sigs);
  expect(k1.length).toBe(32);
  expect(hardenKey(key1, sigs)).toEqual(k1);
  expect(hardenKey(key1, [sigs[0], sigs[1], sigs[0]])).not.toEqual(k1);
  expect(hardenKey(new Uint8Array(32).fill(9), sigs)).not.toEqual(k1);
});

test("live: mirrors reachable, historical round fetches and verifies", async () => {
  const latest = await fetchLatestRound();
  expect(latest).toBeGreaterThan(33_000_000);
  const sig = await fetchVerifiedSignature(KNOWN_ROUNDS[0][0]);
  expect(Buffer.from(sig).toString("hex")).toBe(KNOWN_ROUNDS[0][1]);
}, 60_000);

import { get, set } from "@dotenvx/dotenvx";
import { privateKeyToAccount } from "viem/accounts";
import * as v from "valibot";
import {
  SCAFFOLD_DRAWS,
  drawHistoricalIndices,
  fetchLatestRound,
  fetchVerifiedSignature,
  hardenKey,
} from "./beacon";
import { assertSecretFilePermissions, hardenEnvFilePermissions, restrictUmask } from "./permissions";

const DRY_RUN = process.argv.includes("--dry-run");

// Owner-only files from here on, and fix any pre-existing loose permissions.
restrictUmask();
hardenEnvFilePermissions();

const KEY1_SCHEMA = v.pipe(
  v.string(),
  v.transform((s) => s.replace(/^0x/, "")),
  v.hexadecimal(),
  v.length(64), // 32 bytes
);

// Channel A: the local key, made by `overwrite-with-new-key` (openssl rand).
const key1Raw = get("PK");
if (!key1Raw) throw new Error("PK is not set. Run `bun run overwrite-with-new-key` first.");
const key1Hex = v.parse(KEY1_SCHEMA, key1Raw);
const key1 = Buffer.from(key1Hex, "hex");
const oldAccount = privateKeyToAccount(`0x${key1Hex}`);

// Channel B: 8 unrecorded draws over the full published history. The selection
// RNG is node:crypto — deliberately independent of key1's openssl.
const latestRound = await fetchLatestRound();
const indices = drawHistoricalIndices(latestRound, SCAFFOLD_DRAWS);
console.log(`chain horizon: round ${latestRound} (${SCAFFOLD_DRAWS} historical draws, indices not recorded)`);

const signatures = await Promise.all(indices.map((r) => fetchVerifiedSignature(r)));
console.log(`verified ${signatures.length} beacon signatures against the pinned group key`);

// The one-way mix. After this line, key2 is the only key that matters.
const key2 = hardenKey(key1, signatures);
const key2Hex = Buffer.from(key2).toString("hex");
const newAccount = privateKeyToAccount(`0x${key2Hex}`);

console.log("");
console.log("address before hardening:");
console.log(`  ${oldAccount.address}`);
console.log("address after hardening (check this on a block explorer):");
console.log(`  ${newAccount.address}`);
console.log("");

if (DRY_RUN) {
  console.log("dry run: nothing written. Run without --dry-run to overwrite PK.");
  process.exit(0);
}

set("PK", key2Hex);
hardenEnvFilePermissions();
assertSecretFilePermissions();
console.log("PK overwritten with the hardened key. The pre-mix key is gone.");
console.log("");
console.log("Now:");
console.log("  1. Back up .env AND .env.keys together. Lose both = lose the wallet.");
console.log("  2. Keep both files at permissions 600.");
console.log("  3. Delete secret.key if it exists (it holds a plaintext key).");

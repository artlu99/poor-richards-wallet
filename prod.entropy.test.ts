import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { $ } from "bun";
import { SCAFFOLD_DRAWS, hardenKey } from "./beacon";
import { assertUniform, SAMPLE_COUNT } from "./entropy-harness";

/** Same CSPRNG as `overwrite-with-new-key`: `openssl rand`, one key = 32 bytes.
 *  Batches 50 keys per openssl call; 5000 spawns would blow any test timeout. */
async function opensslKeys(count: number): Promise<Uint8Array[]> {
  const perCall = 50;
  const chunks: string[] = [];
  for (let i = 0; i < Math.ceil(count / perCall); i++) {
    chunks.push(
      await $`openssl rand -hex ${32 * perCall}`.text(), // 50 keys of 64 hex chars
    );
  }
  const hex = chunks.join("").trim();
  const lines = hex.match(/.{64}/g) ?? [];
  expect(lines.length).toBeGreaterThanOrEqual(count);
  return lines.slice(0, count).map((h) => Buffer.from(h, "hex"));
}

test("prod local: openssl rand -hex 32 looks uniform", async () => {
  assertUniform(await opensslKeys(SAMPLE_COUNT));
}, 60_000);

// scrypt (N=2^17) is slow; fewer samples than the openssl uniformity test.
const HARDEN_SAMPLES = 500;

test("prod mix: hardenKey looks uniform under independent scaffolding sigs", async () => {
  const [pk] = await opensslKeys(1);
  if (!pk) throw new Error("pk is not set");
  const samples = Array.from({ length: HARDEN_SAMPLES }, () => {
    const signatures = Array.from({ length: SCAFFOLD_DRAWS }, () =>
      randomBytes(48),
    );
    return hardenKey(pk, signatures);
  });
  assertUniform(samples);
}, 180_000);

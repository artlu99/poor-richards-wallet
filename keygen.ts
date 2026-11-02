import { createHash, type Hash } from "node:crypto";
import MersenneTwister from "mersenne-twister";

/** SHA-256 hasher over local PK bytes and beacon signature bytes. */
export function mixWithBeacon(pk: Uint8Array, sig: Uint8Array): Hash {
  return createHash("sha256").update(pk).update(sig);
}

/**
 * Deliberately flawed key material for negative tests.
 * Looks like a fast xorshift PRNG, but drops the high bit of every byte
 * (`& 0x7f`) — biased enough that uniformity checks should fail.
 * Do not use for wallets.
 */
export function flawedPseudoKey(seed: number): Uint8Array {
  let x = (seed >>> 0) || 1;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = (x >>> 0) & 0x7f;
  }
  return out;
}

/**
 * MT19937 via `mersenne-twister` (`random_int`), full 256-bit fill.
 * Looks uniform under this harness but is still not a CSPRNG — do not use for wallets.
 */
export function mersenneTwisterKey(seed: number): Uint8Array {
  const mt = new MersenneTwister(seed);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const word = mt.random_int() >>> 0;
    out[i * 4] = word & 0xff;
    out[i * 4 + 1] = (word >>> 8) & 0xff;
    out[i * 4 + 2] = (word >>> 16) & 0xff;
    out[i * 4 + 3] = (word >>> 24) & 0xff;
  }
  return out;
}

/**
 * Same MT library, but only one 32-bit `random_int` per key, repeated.
 * Plausible "stretch the RNG" mistake — should fail the uniformity harness.
 */
export function mersenneTwisterUnderdrawnKey(seed: number): Uint8Array {
  const mt = new MersenneTwister(seed);
  const out = new Uint8Array(32);
  const word = mt.random_int() >>> 0;
  for (let i = 0; i < 32; i++) {
    out[i] = (word >>> ((i % 4) * 8)) & 0xff;
  }
  return out;
}

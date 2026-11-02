import { expect } from "bun:test";

export const SAMPLE_COUNT = 5_000;

function bitBalance(samples: Uint8Array[]): number {
  let ones = 0;
  let bits = 0;
  for (const s of samples) {
    for (const b of s) {
      for (let i = 0; i < 8; i++) {
        ones += (b >> i) & 1;
        bits++;
      }
    }
  }
  return ones / bits;
}

function byteChiSquare(samples: Uint8Array[]): number {
  const counts = new Array(256).fill(0);
  let n = 0;
  for (const s of samples) {
    for (const b of s) {
      counts[b]++;
      n++;
    }
  }
  const expected = n / 256;
  return counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
}

function shannonEntropyBits(samples: Uint8Array[]): number {
  const counts = new Array(256).fill(0);
  let n = 0;
  for (const s of samples) {
    for (const b of s) {
      counts[b]++;
      n++;
    }
  }
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Shared uniformity checks used by prod and harness-confidence tests. */
export function assertUniform(samples: Uint8Array[]) {
  expect(new Set(samples.map((s) => Buffer.from(s).toString("hex"))).size).toBe(
    samples.length,
  );
  const balance = bitBalance(samples);
  expect(balance).toBeGreaterThan(0.49);
  expect(balance).toBeLessThan(0.51);
  expect(shannonEntropyBits(samples)).toBeGreaterThan(7.95);
  const chi = byteChiSquare(samples);
  expect(chi).toBeGreaterThan(200);
  expect(chi).toBeLessThan(320);
}

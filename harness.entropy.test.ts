import { expect, test } from "bun:test";
import { SAMPLE_COUNT, assertUniform } from "./entropy-harness";
import {
  flawedPseudoKey,
  mersenneTwisterKey,
  mersenneTwisterUnderdrawnKey,
} from "./keygen";

test("harness: flawed pseudo-RNG fails uniformity", () => {
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
    flawedPseudoKey(i + 1),
  );
  expect(() => assertUniform(samples)).toThrow();
});

test("harness: MT (mersenne-twister) full draws pass uniformity", () => {
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
    mersenneTwisterKey(i + 1),
  );
  assertUniform(samples);
});

test("harness: MT (mersenne-twister) under-drawn key fails uniformity", () => {
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
    mersenneTwisterUnderdrawnKey(i + 1),
  );
  expect(() => assertUniform(samples)).toThrow();
});

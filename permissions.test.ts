import { chmodSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  assertSecretFilePermissions,
  hardenEnvFilePermissions,
  restrictUmask,
} from "./permissions";

test("hardenEnvFilePermissions forces owner-only on every secret file", () => {
  const dir = mkdtempSync(join(tmpdir(), "prw-perm-"));
  try {
    writeFileSync(join(dir, ".env"), "test");
    writeFileSync(join(dir, ".env.keys"), "test");
    writeFileSync(join(dir, "secret.key"), "test");
    writeFileSync(join(dir, "unrelated.txt"), "test");
    chmodSync(join(dir, ".env"), 0o666);
    chmodSync(join(dir, ".env.keys"), 0o664);
    chmodSync(join(dir, "secret.key"), 0o604);
    const unrelatedBefore = statSync(join(dir, "unrelated.txt")).mode & 0o777;

    const fixed = hardenEnvFilePermissions(dir);
    expect(fixed.length).toBe(3);
    expect(fixed.some((p) => p.includes("unrelated.txt"))).toBe(false);
    for (const name of [".env", ".env.keys", "secret.key"]) {
      const mode = statSync(join(dir, name)).mode & 0o777;
      expect(mode).toBe(0o600);
    }
    // unrelated files are left alone
    const unrelatedAfter = statSync(join(dir, "unrelated.txt")).mode & 0o777;
    expect(unrelatedAfter).toBe(unrelatedBefore);

    expect(() => assertSecretFilePermissions(dir)).not.toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("missing secret files are skipped, loose files are caught", () => {
  const dir = mkdtempSync(join(tmpdir(), "prw-perm-"));
  try {
    expect(hardenEnvFilePermissions(dir)).toEqual([]);
    expect(() => assertSecretFilePermissions(dir)).not.toThrow();
    writeFileSync(join(dir, ".env.keys"), "test");
    chmodSync(join(dir, ".env.keys"), 0o666);
    expect(() => assertSecretFilePermissions(dir)).toThrow(/666/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restrictUmask is settable and affects new files", () => {
  const previous = restrictUmask();
  try {
    expect(process.umask()).toBe(0o077); // setter applied
    const dir = mkdtempSync(join(tmpdir(), "prw-perm-"));
    try {
      writeFileSync(join(dir, "created-under-umask"), "test");
      const mode = statSync(join(dir, "created-under-umask")).mode & 0o777;
      expect(mode & 0o077).toBe(0); // no group/world bits survive
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    restrictUmask(previous ?? 0o022); // restore for other tests
  }
});

// Repo state guard: the real secret files must never regress to world-readable.
const hasEnv = existsSync(".env");
const hasKeys = existsSync(".env.keys");
test.skipIf(!hasEnv && !hasKeys)(
  "repo secret files are owner-only",
  () => {
    expect(() => assertSecretFilePermissions()).not.toThrow();
  },
);

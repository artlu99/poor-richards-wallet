import { chmodSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

// Every file below can hold key material. All must be owner-only.
const SECRET_FILES = [".env", ".env.keys", "secret.key"] as const;
const OWNER_ONLY = 0o600;

/**
 * Make every file this process (and its children) creates readable only by its
 * owner. Call this before any dotenvx call — dotenvx itself creates files with
 * the inherited umask, so a default desktop umask (002) would leave both
 * `.env` and `.env.keys` world-readable (664).
 */
export function restrictUmask(mask = 0o077): number | undefined {
  try {
    return process.umask(mask);
  } catch {
    // Runtime without a settable umask: the explicit chmod after writes covers us.
    return undefined;
  }
}

/** chmod 600 every known secret file that exists. Returns the paths it fixed. */
export function hardenEnvFilePermissions(dir: string = process.cwd()): string[] {
  const fixed: string[] = [];
  for (const name of SECRET_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    if ((statSync(path).mode & 0o777) !== OWNER_ONLY) {
      chmodSync(path, OWNER_ONLY);
      fixed.push(path);
    }
  }
  return fixed;
}

/** Throw if any known secret file exists with permissions looser than 600. */
export function assertSecretFilePermissions(dir: string = process.cwd()): void {
  const loose: string[] = [];
  for (const name of SECRET_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const mode = statSync(path).mode & 0o777;
    if (mode !== OWNER_ONLY) {
      loose.push(`${path} (${mode.toString(8)})`);
    }
  }
  if (loose.length > 0) {
    throw new Error(
      `secret files with loose permissions: ${loose.join(", ")} — run chmod 600 on them`,
    );
  }
}

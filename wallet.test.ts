import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { privateKeyToAccount } from "viem/accounts";

const repo = resolve(import.meta.dir);

const pkg = (await Bun.file(join(repo, "package.json")).json()) as {
  scripts: {
    "overwrite-with-new-key": string;
    "view-account": string;
  };
};

/** Anvil account 0. Public test vector, not a wallet secret. */
const KNOWN_KEY =
  "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const KNOWN_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function redact(text: string) {
  return text.replace(/[0-9a-fA-F]{32,}/g, "<redacted>");
}

/** Temp dir outside the repo, so the real .env is never touched. */
async function sandbox() {
  const dir = await mkdtemp(join(tmpdir(), "poor-richards-wallet-"));
  if (resolve(dir).startsWith(repo)) {
    throw new Error("sandbox must sit outside the repo");
  }
  await Bun.write(join(dir, "index.ts"), Bun.file(join(repo, "index.ts")));
  await symlink(join(repo, "node_modules"), join(dir, "node_modules"));
  return dir;
}

async function destroy(dir: string) {
  await unlink(join(dir, "node_modules")).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}

async function run(
  cmd: string,
  cwd: string,
  extra: Record<string, string> = {},
) {
  // Bun loads the repo .env into this process. Passing that through makes
  // dotenvx reuse the real public key and skip writing a new .env.keys.
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "TERM"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.PATH = `${join(repo, "node_modules/.bin")}:${env.PATH ?? ""}`;
  Object.assign(env, extra);
  const proc = Bun.spawn(["bash", "-c", cmd], {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

function assertExit(
  result: { code: number; stderr: string },
  label: string,
) {
  if (result.code !== 0) {
    throw new Error(
      `${label} exited ${result.code}: ${redact(result.stderr)}`,
    );
  }
}

async function mode(path: string) {
  return (await stat(path)).mode & 0o777;
}

/** Decrypt PK into memory. Never put the value in an assertion message. */
async function readPk(dir: string) {
  const dest = join(dir, "pk.hex");
  const result = await run(
    `dotenvx run -- bun -e 'await Bun.write(${JSON.stringify(dest)}, process.env.PK ?? "")'`,
    dir,
  );
  assertExit(result, "decrypt PK");
  const pk = (await Bun.file(dest).text()).trim();
  await rm(dest, { force: true });
  if (!/^[0-9a-f]{64}$/.test(pk)) {
    throw new Error("decrypted PK was not 32 bytes of lowercase hex");
  }
  return pk;
}

test("overwrite-with-new-key stores an encrypted key that view-account derives", async () => {
  const dir = await sandbox();
  try {
    const wrote = await run(pkg.scripts["overwrite-with-new-key"], dir);
    assertExit(wrote, "overwrite-with-new-key");

    const first = await readPk(dir);
    const stored = await Bun.file(join(dir, ".env")).text();
    expect(stored.includes(first)).toBe(false);
    expect(await mode(join(dir, ".env"))).toBe(0o600);
    expect(await mode(join(dir, ".env.keys"))).toBe(0o600);

    const view = await run(pkg.scripts["view-account"], dir);
    assertExit(view, "view-account");
    const account = privateKeyToAccount(`0x${first}`);
    expect(view.stdout).toContain(
      `https://etherscan.io/address/${account.address}`,
    );

    const again = await run(pkg.scripts["overwrite-with-new-key"], dir);
    assertExit(again, "overwrite-with-new-key");
    const second = await readPk(dir);
    expect(first === second).toBe(false);
    const restored = await Bun.file(join(dir, ".env")).text();
    expect(restored.includes(second)).toBe(false);
    expect(await mode(join(dir, ".env"))).toBe(0o600);
    expect(await mode(join(dir, ".env.keys"))).toBe(0o600);
  } finally {
    await destroy(dir);
  }
}, 30_000);

test("index.ts derives the known address with or without a 0x prefix", async () => {
  const dir = await sandbox();
  try {
    for (const pk of [KNOWN_KEY, `0x${KNOWN_KEY}`]) {
      const result = await run("bun index.ts", dir, { PK: pk });
      assertExit(result, "index.ts");
      expect(result.stdout).toContain(
        `https://etherscan.io/address/${KNOWN_ADDRESS}`,
      );
    }
  } finally {
    await destroy(dir);
  }
});

test("index.ts prints no address when PK is missing", async () => {
  const dir = await sandbox();
  try {
    const result = await run("bun index.ts", dir);
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toMatch(/0x[0-9a-fA-F]{40}/);
  } finally {
    await destroy(dir);
  }
});

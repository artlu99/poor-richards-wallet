# Poor Richard's Wallet

A simple wallet for EVM chains. You make the key on your computer with OpenSSL. The key file stays encrypted on disk. No server holds your key. Only your backups can restore it.

## How the key is made

`openssl rand -hex 32` draws 32 bytes from OpenSSL's random-number generator, which is seeded by the operating system. Those 32 bytes are the secp256k1 private key. dotenvx encrypts them in `.env`.

The security of generation is the security of that operating-system entropy pool and the OpenSSL installation. There is no second random source and no network step.

## Limits

If you lose `.env` and `.env.keys`, you lose the wallet. Make backups of the file pair. Keep copies in more than one place.

Anyone who has the decrypted key, or both dotenvx files, can spend the funds. dotenvx encrypts the file on disk. It is not a BIP-39 passphrase. Keep `.env.keys` separate from everyday backups of `.env` when you can.

The output is 256 bits. secp256k1 gives about 128 bits of security against generic discrete-log attacks, assuming the operating-system generator supplied unpredictable bytes.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- [OpenSSL](https://openssl.org) command line tool
- [dotenvx](https://dotenvx.com) command line tool

The account code uses [viem](https://viem.sh). All code runs locally. No internet connection is required.

## Usage

### 1. Install

```bash
bun install
```

### 2. Make a new key

**Warning. This command destroys the old key. Move your funds first.**

```bash
bun run overwrite-with-new-key
```

### 3. Show the account

```bash
bun run view-account
```

## Storage rules

- `.env` — the encrypted key file. dotenvx encrypts the value. Keep file permissions `600`. Never commit it.
- `.env.keys` — the decryption keys for `.env`. Keep file permissions `600`. Never commit it. Never print it.
- `overwrite-with-new-key` sets umask `077` before the write and runs `chmod 600` afterward. dotenvx alone does not do this. Do not run raw `dotenvx set` commands yourself.
- Back up `.env` and `.env.keys` as a pair. One file without the other is useless.
- `secret.key` — a plain text export. It exists only when you make it. Delete it after use.

# Poor Richard's Wallet

**The simplest possible EVM wallet**. Private keys are generated locally and encrypted at rest.

**Dependencies:** [Bun](https://bun.com), [OpenSSL](https://openssl.org/), [viem](https://viem.sh/), [dotenvx](https://dotenvx.com)

## Usage

### 1. Install dependencies
```bash
bun install
```

### 2. Generate new wallet
**⚠️ WARNING: Overwrites existing keys!**

```bash
bun overwrite-with-new-key
```

### 3. View public address
```bash
bun view-account
```

### 4. Export private key
**⚠️ WARNING: Run this in a secure setting only!**

```bash
bunx dotenvx get PK > secret.key
```

## Important
- **Backup `.env.keys`:** This file is used to decrypt your keys. If lost, funds may be lost.

---
Inspired by [iammatthias](https://iammatthias.com/content/posts/1712432046964-generate-a-new-private-key/)

# Poor Richard's Wallet

**The simplest possible EVM wallet**. Private keys are generated locally and encrypted at rest.

### Dependencies

- **Cryptography:** [OpenSSL](https://openssl.org/), [dotenvx](https://dotenvx.com)
- **[OPTIONAL]:** [League of Entropy](https://www.drand.love/loe), `node:crypto`
- **Runtime:** [Bun](https://bun.com), [viem](https://viem.sh/), [valibot](https://valibot.dev)

## Usage

#### 1. Install dependencies
```bash
bun install
```

#### 2. Generate new wallet
**⚠️ WARNING: Overwrites existing keys!**

```bash
bun overwrite-with-new-key
```

#### 3. [OPTIONAL]: Mix key with randomness beacon
**⚠️ WARNING: Overwrites existing keys!**

Mixes local entropy with web-based entropy to create a new key.

```bash
bun overwrite-with-mixed-key
```

**When to use mixing**

- **Use mixing** if you want to inject external entropy due to concerns about local key generation
- **Skip mixing step** when external dependencies are inappropriate

**Tradeoffs:**

- **Mixing:**
  - ✅ Adds external entropy from public randomness beacon
  - ❌ Requires internet connection to fetch beacon
  - ❌ Introduces external dependency

- **Local-only key generation:**
  - ✅ Fewer dependencies
  - ✅ Works offline
  - ❌ No external entropy source (relies on OpenSSL's PRNG)

#### 4. View public address
```bash
bun view-account
```

#### 5. Export private key
**⚠️ WARNING: Run this in a secure setting only!**

```bash
bunx dotenvx get PK > secret.key
```

## Important
- **Backup `.env.keys`:** This file is used to decrypt your keys. If lost, funds may be lost.

---

*Inspired by @iammatthias' [post](https://iammatthias.com/content/posts/1712432046964-generate-a-new-private-key/).*

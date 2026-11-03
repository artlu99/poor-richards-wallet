# Poor Richard's Wallet

A simple wallet for EVM chains. You make the key on your computer. The key file stays encrypted on disk. No server holds your key. Only your backups can restore it.

## How the key is made

The wallet combines a local key with public beacon records selected by a second local random draw. A slow function mixes them. The goal is to tolerate a flaw in one *userspace* random-number path while the other path and the operating-system entropy pool remain sound.

The beacon records are public. They are not a third secret entropy source. Their value comes from the unrecorded choice of records. OpenSSL and Bun's `node:crypto` implementation can share the same operating-system entropy pool, so a failure in that shared pool can weaken both local draws.

1. **The computer makes part A.** The command `openssl rand -hex 32` makes 32 random bytes. OpenSSL seeds its random generator from the operating system. Its source code is public, but the installed binary and operating system remain part of the trust base.

2. **The script reads public beacon records.** The League of Entropy runs the drand network. This network publishes a new signed record every 3 seconds. Each signature is 48 bytes. The script reads 8 old records from the range reported by a drand endpoint, excluding a small safety margin.

3. **A second local draw selects the records.** The script selects 8 distinct record numbers with Bun's implementation of the Node `crypto.randomBytes` API. This is a different userspace path from the OpenSSL command. A flaw only in one userspace path does not by itself remove the other source. A flaw in the shared operating-system entropy pool can weaken both.

4. **The script mixes all parts.** The function scrypt combines part A and the 8 signatures. scrypt needs much memory for each call. This slows attacks that must guess mixer inputs. It does not slow theft of the final key or generic attacks on secp256k1.

5. **The script destroys the inputs.** Part A is overwritten in `.env`. The 8 record numbers are not saved to disk by this program. The final key is the only locally stored result. The drand endpoints receive the requested round numbers and can log them. Anyone who can observe the full request URLs can also learn the selection.

## Security properties

| Event | Result |
| --- | --- |
| Part A userspace generator is later found weak (OS pool still sound) | The unknown ordered record selection can protect the key. At a verified horizon near 33 million rounds, an attacker who lacks the record numbers faces about 2^200 candidate sequences. |
| Selection RNG userspace path is later found weak (OS pool still sound) | Part A alone gives 256 bits. This is the full strength of an EVM key. |
| Shared OS entropy pool is weak or backdoored | Both local sources can fail together. The public beacon does not restore secrecy if part A is known or enumerable. |
| A beacon record is false | The script checks each signature against the pinned group key. The script stops on the first bad record. |
| Both record endpoints respond | Their signatures must be identical and valid. |
| One record endpoint fails | One valid signature is sufficient; the script still verifies it against the pinned group key. |
| Part A leaks after generation, and the attacker did not learn the beacon selection | The attacker must search the ordered record selections. |
| An attacker watches the whole generation or obtains endpoint logs | The requests can reveal the record numbers. Keep the computer and request metadata safe at that moment. |
| The endpoint reports a false, old “latest” round | The current implementation can draw from a smaller history. The 2^200 estimate therefore assumes an honest, current horizon; production does not yet cross-check it. |

The record numbers are ephemeral selectors that this program does not store on disk. They are not guaranteed to be unknown to the drand endpoints or a machine observer. You never need them again for normal use. The final key alone opens the wallet. If you lose the key files, the public beacon history does not restore the wallet: part A was destroyed.

## Limits of this design

If you lose `.env` and `.env.keys`, you lose the wallet. The public beacon history cannot rebuild Part A after it was destroyed. Make backups of the file pair. Keep copies in more than one place.

Anyone who has the decrypted key (or both dotenvx files) can spend the funds. dotenvx encrypts the file on disk; it is not a BIP-39 passphrase. Keep `.env.keys` separate from everyday backups of `.env` when you can.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- [OpenSSL](https://openssl.org) command line tool
- [dotenvx](https://dotenvx.com) command line tool
- Beacon round numbers and signatures at generation time (today: an internet fetch; authenticated sneakernet/airgap import is possible in principle but not implemented — see `DISCUSSION.md`)

The crypto code uses [viem](https://viem.sh), [valibot](https://valibot.dev), and the [noble](https://github.com/paulmillr/noble-curves) libraries. All code runs locally.

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

### 3. Harden the key with beacon records

**Warning. This command destroys the old key. Run step 2 immediately before this step.**

```bash
bun run harden-with-drand
```

The script prints the wallet address before and after the mix. Write the new address down. Check it on a block explorer.

Add `--dry-run` to see the result without a write:

```bash
bun run harden-with-drand-dry-run
```

### 4. Show the account

```bash
bun run view-account
```

## Test suite

```bash
bun test
```

The suite checks three areas:

1. **Uniformity (not secrecy).** `openssl rand` output must look uniform. Deliberately biased generators must fail. A full Mersenne Twister stream can still *look* uniform and pass those checks; an under-drawn or bit-masked PRNG must fail. These tests do not prove cryptographic entropy.
2. **Beacon and mixer.** Signatures verify against the pinned group key. Historical draws stay in range. `hardenKey` (scrypt over part A and scaffolding signatures) is checked for stable, input-sensitive behavior. One test reads the live beacon network.
3. **File permissions.** Secret files must stay owner-only after the scripts run.

## Storage rules

- `.env` — the encrypted key file. dotenvx encrypts the value. Keep file permissions `600`. Never commit it.
- `.env.keys` — the decryption keys for `.env`. Keep file permissions `600`. Never commit it. Never print it.
- The scripts set owner-only permissions on these files. They set the umask before each write. They run `chmod 600` after each write. dotenvx alone does not do this. Do not run raw `dotenvx set` commands yourself.
- Back up `.env` and `.env.keys` as a pair. One file without the other is useless.
- `secret.key` — a plain text export. It exists only when you make it. Delete it after use.

## Source of randomness notes

The beacon data is public. Public data adds no secrecy by itself. The security contribution comes from selecting an ordered set of records with a local draw and not storing that selection on disk. An attacker who has part A but did not learn the selection must try candidate sequences. The endpoints can observe the requested rounds, so this is not protection against a fully observed ceremony.

The output is 256 bits. secp256k1 gives about 128 bits of security against generic discrete-log attacks. With a trustworthy horizon near 33 million rounds, 8 distinct ordered selections create about a 2^200 candidate-sequence search when the indices remain unknown. This does not add 200 bits of secret entropy to a known or predictable local RNG, and the final key cannot exceed the security of its 256-bit format.

# Poor Richard's Wallet

A simple wallet for EVM chains. You make the key on your computer. The key file stays encrypted on disk. No server holds your key. No third party can restore it.

## How the key is made

The wallet combines three independent sources of randomness. A slow function mixes them. This design has a goal: if someone later finds one source weak, the other sources keep the key safe.

1. **The computer makes part A.** The command `openssl rand -hex 32` makes 32 random bytes. The operating system random number generator makes these bytes. This generator is a CSPRNG. You can audit its code.

2. **The script reads part B from a public beacon.** The League of Entropy runs the drand network. This network publishes a new signed record every 3 seconds. Each record is 48 bytes. The script reads 8 old records from the full published history.

3. **A second generator selects the records.** The script selects the 8 record numbers with the Bun and Node random number generator. This generator uses different code from part A. If someone later finds a flaw in one generator, the other generator still holds its randomness.

4. **The script mixes all parts.** The function scrypt combines part A and the 8 signatures. scrypt needs much memory for each call. This property slows all search attacks.

5. **The script destroys the inputs.** Part A is overwritten. The 8 record numbers are not saved. The final key is the only result.

## Security properties

| Event | Result |
| --- | --- |
| Part A generator is later found weak | The 8 signatures protect the key. An attacker must search about 2^200 record combinations. |
| Part B generator is later found weak | Part A alone gives 256 bits. This is the full strength of an EVM key. |
| A beacon record is false | The script checks each signature against the pinned group key. The script stops on the first bad record. |
| A mirror sends false data | The script reads each record from two mirrors. The records must be identical. |
| Part A leaks after generation | The attacker still needs the 8 record numbers. They are not written anywhere. |
| An attacker watches the whole generation | No software can help. Keep the computer safe at that moment. |

The record numbers are a secret with no storage. You never need them again. The final key alone opens the wallet.

## Limits of this design

This design does not protect a lost file. If you lose `.env` and `.env.keys`, you lose the wallet. There is no recovery. Make backups. Keep them in two places.

This design does not protect a copied key. Anyone with the key file can spend the funds.

## Requirements

- [Bun](https://bun.sh) 1.4 or newer
- [OpenSSL](https://openssl.org) command line tool
- [dotenvx](https://dotenvx.com) command line tool
- An internet connection for the beacon step

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

The suite checks three things. First, the generators: the system random number generator must look uniform. Bad generators, for example a Mersenne Twister, must fail the tests. Second, the beacon: signatures must verify against the pinned group key, and the draw function must stay in range. Third, one test reads the live beacon network.

## Storage rules

- `.env` — the encrypted key file. dotenvx encrypts the value. Keep file permissions `600`. Never commit it.
- `.env.keys` — the decryption keys for `.env`. Keep file permissions `600`. Never commit it. Never print it.
- The scripts set owner-only permissions on these files. They set the umask before each write. They run `chmod 600` after each write. dotenvx alone does not do this. Do not run raw `dotenvx set` commands yourself.
- Back up `.env` and `.env.keys` as a pair. One file without the other is useless.
- `secret.key` — a plain text export. It exists only when you make it. Delete it after use.

## Source of randomness notes

The beacon data is public. Public data adds no secrecy by itself. This design uses it for two properties. First, independence: the beacon is far from your computer. Second, unrecorded selection: the script does not save which records it chose. An attacker who wants to search must try all record combinations, because the selection is unknown and unrecorded.

The key has 256 bits. An EVM key gives about 128 bits of security. The 8 selected records add about 200 bits against a search. This is more than the key format can use. Do not reduce the number of records.

# Beacon ceremony, BIP-39, and key custody

Companion to `README.md`. This document explains how the parts fit together. They are layers, not competing wallet designs.

## Four separate layers

1. **Generation — beacon ceremony.** Produce 32 bytes from Part A, a hidden ordered selection of public drand records, and scrypt.
2. **Format and derivation.** Use those 32 bytes directly as a raw secp256k1 key (the current implementation), or use them as BIP-39 entropy and spend from an HD child.
3. **Storage.** Protect the stored raw key or mnemonic with dotenvx, file permissions, separate backups, and disk encryption.
4. **Optional second factor.** Add a BIP-39 passphrase if the threat model requires a secret that never appears on the primary backup medium.

Keeping these layers separate prevents misleading comparisons. BIP-39 does not specify how entropy is generated. The beacon ceremony does not require or forbid mnemonics. dotenvx encryption is not a BIP-39 passphrase.

## What the beacon ceremony does

The current ceremony:

1. generates Part A with `openssl rand -hex 32`;
2. uses Bun's `node:crypto.randomBytes` implementation to select 8 distinct historical drand rounds;
3. fetches and verifies the public signatures for those rounds against a pinned group key; and
4. applies scrypt to Part A and the signatures to produce 32 bytes.

The program overwrites Part A and does not store the selected round numbers on disk. The drand endpoints receive those round numbers and can log them. A process or network observer that can see the full request URLs can also learn them.

The two local random-number paths use different userspace implementations, but they can depend on the same operating-system entropy pool. The ceremony can tolerate a fault isolated to one userspace path while the other path and the operating-system pool remain sound. It does not guarantee safety when the shared operating-system entropy source is predictable or compromised.

## What the public beacon contributes

The beacon signatures are public. They do not add secret entropy by themselves. The security contribution comes from the ordered selection of records remaining unknown.

Near a horizon of 33 million rounds, 8 distinct ordered selections give approximately a 2^200 candidate-sequence space. This statement is conditional:

- the selector must be sufficiently unpredictable;
- the attacker must not learn the selected rounds from the process, network requests, or endpoint logs; and
- the round horizon must actually be near 33 million.

The current implementation trusts the first reachable endpoint's report of the latest round. It does not cross-check or authenticate that horizon. A false old horizon could reduce the search space while the selected historical signatures still verify. Therefore, 2^200 is a design estimate under an honest current horizon, not an unconditional runtime guarantee.

scrypt makes each candidate-input guess memory-hard. It does not slow theft of the final key, and it does not add entropy to predictable inputs.

## Raw-key and mnemonic outputs

The beacon ceremony ends with 32 bytes. There are two output choices:

- **Raw-key path (implemented today):** treat the output as a secp256k1 private key and store it with dotenvx.
- **Mnemonic path (not implemented):** treat the output as 256-bit BIP-39 entropy, encode it as 24 words, and use an HD child as the only spending key.

The mnemonic path is a small code change because viem and `@scure/bip39` already provide the required functions. It is still a meaningful wallet migration. The implementation must fix and document the wordlist, derivation path, account index, and optional passphrase rules. It must also provide a safe way to display, verify, and back up the words. Restoring the same address requires the same mnemonic, passphrase, and derivation path.

Paper inheritance and ordinary mnemonic-wallet interoperability belong to the mnemonic path. Their absence from the current raw-key implementation is an output-format choice, not a limitation of the beacon ceremony.

## Storage and passphrases

dotenvx encrypts the stored secret. Its decryption key, `.env.keys`, is a separate secret. File permissions and full-disk encryption add more protection, but operational key custody remains important. If an attacker obtains both `.env` and `.env.keys`, the attacker can decrypt the wallet secret.

A BIP-39 passphrase protects a different boundary. If it is strong and kept away from the mnemonic, possession of the words alone is insufficient. This can protect a copied steel plate or a complete mnemonic backup. It also introduces footguns: silent typos, Unicode normalization, weak human choices, and inheritance failure.

Use external encryption for ordinary storage protection. Add a BIP-39 passphrase only when the additional derivation-level factor is worth its custody risk.

## Backup and recovery

For the current raw-key path, the backup is the `.env` / `.env.keys` pair. If both are lost, the wallet is lost. Part A was destroyed, and public beacon history cannot recreate it.

For a future mnemonic path, the words become a portable backup. Losing the encrypted working copy is survivable if the words and any passphrase remain available.

Searching public beacon combinations is an attacker cost when Part A is already known. It is not an owner recovery method after Part A is gone.

## Network and airgap use

The current command fetches records online for convenience. The mixer itself can run offline if the airgapped computer receives authenticated `(round number, signature)` pairs and has a trustworthy round horizon.

A sneakernet workflow is possible but not implemented. A complete design must specify how the airgapped computer selects rounds without revealing them, how the corresponding records are transferred, and how the horizon is established. Moving only signature bytes is insufficient because verification also needs the round numbers.

## Implementation scope and review

The implementation composes established primitives and libraries: OpenSSL's random generator, scrypt, SHA-256, noble BLS12-381 operations, and drand signatures. This does not prove that every dependency or the composition is free of defects.

The tests verify known and live beacon signatures, reject malformed signatures, test draw bounds, exercise the scrypt mixer, check file permissions, and perform limited output-uniformity checks. Uniformity tests do not prove entropy, source integrity, or resistance to a malicious random-number implementation.

## Post-quantum: the one-shot, first-shot risk

Shor's algorithm against secp256k1 breaks EVM keys regardless of whether they came from ordinary BIP-39 or the beacon ceremony. The signature scheme is the post-quantum bottleneck, not the entropy format.

Migration should use an ecosystem-reviewed post-quantum wallet standard. This is an industry-wide one-shot, first-shot risk: a custom construction can produce normal-looking keys while failing silently. Testnets show functionality, not long-term cryptographic confidence.

The general structure can carry forward — independent inputs, one-way derivation, and explicit domain separation — but a future implementation must follow the new standard rather than assume the current mixer transfers unchanged.

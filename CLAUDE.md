# Project Context: dotenvx Configuration

## Environment Variables
- Managed via `dotenvx` (encrypted environment variables).
- `.env` files are ENCRYPTED and safe to commit to version control.

## Critical Rules
1. **NEVER read `.env.keys` directly.** This file contains decryption keys.
2. **NEVER RUN DESTRUCTIVE OPERATIONS** `bun run overwrite-with-new-key` is a destructive operation. So is `bunx dotenvx set <KEY> <VALUE>`. So is `bun run harden-with-drand` (it overwrites PK with the hardened key; only `bun run harden-with-drand-dry-run` is safe). 
3. **NEVER print the contents of `.env.keys`.**
4. Do not use `bunx dotenvx get <KEY>` to inspect specific values. This should be left for the user to run on their own.
5. Use `dotenvx run -- <command>` to inject environment variables into scripts.

## File Structure
- `.env`: Encrypted environment variables.
- `.env.keys`: Decryption keys (GITIGNORED - DO NOT COMMIT).
- `secret.key`: Temporary plain text export (GITIGNORED).

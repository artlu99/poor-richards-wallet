import { privateKeyToAccount } from "viem/accounts";

const pk = process.env.PK;
if (!pk) {
   throw new Error(`PK is required. Run \`bun overwrite-with-new-key\` to generate a new one.`);
}

const account = privateKeyToAccount(`0x${pk.replace('0x', '')}` as `0x${string}`);

console.log("Here is your new account (consider browsing via VPN):");
console.log(`https://etherscan.io/address/${account.address}`);
import { createHash } from "node:crypto";
import { get, set } from "@dotenvx/dotenvx";
import * as v from "valibot";

// https://docs.drand.love/dev-guide/developer/http-api
const BEACON = `https://api.drand.sh/v2/beacons/quicknet/rounds/latest`;
const BeaconSchema = v.object({ round: v.number(), signature: v.string() });

const pk = get("PK");
if (!pk) throw new Error("PK is not set");

// fetch fresh randomness
const response = await fetch(BEACON);
const data = await response.json();
const parsed = v.parse(BeaconSchema, data);

// use SHA-256 to mix private key with entropy from randomness beacon
const pkBytes = Buffer.from(pk.replace("0x", ""), "hex");
const sigBytes = Buffer.from(parsed.signature.replace("0x", ""), "hex");
const mixedKey = createHash("sha256").update(pkBytes).update(sigBytes);

set("PK", mixedKey.digest("hex"));

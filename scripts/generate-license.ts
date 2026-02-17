import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PRIVATE_KEY_PATH = join(homedir(), ".moltmind", "license-private.pem");
const instanceId = process.argv[2];
if (!instanceId) {
  console.error("Usage: tsx scripts/generate-license.ts <instance_id>");
  process.exit(1);
}

const privateKey = readFileSync(PRIVATE_KEY_PATH, "utf-8");
const signature = crypto.sign("sha256", Buffer.from(instanceId), privateKey);
const sig64 = signature.toString("base64url");
const prefix = instanceId.replace(/-/g, "").slice(0, 8);

console.log(`MMPRO-${prefix}-${sig64}`);

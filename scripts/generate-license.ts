import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const PRIVATE_KEY_PATH = join(homedir(), ".moltmind", "license-private.pem");

const isAdmin = process.argv.includes("--admin");
const instanceId = process.argv.filter((a) => a !== "--admin")[2];

if (!instanceId) {
  console.error("Usage: tsx scripts/generate-license.ts [--admin] <instance_id>");
  console.error("  --admin  Generate an MMADMIN- key (skips heartbeat, developer only)");
  process.exit(1);
}

const privateKey = readFileSync(PRIVATE_KEY_PATH, "utf-8");
const signature = crypto.sign("sha256", Buffer.from(instanceId), privateKey);
const sig64 = signature.toString("base64url");
const prefix = instanceId.replace(/-/g, "").slice(0, 8);
const keyPrefix = isAdmin ? "MMADMIN" : "MMPRO";

console.log(`${keyPrefix}-${prefix}-${sig64}`);

import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getMemoryStats, getDailyStoreCount } from "./db.js";

// RSA public key (embedded — can verify but NOT sign)
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw6wFE2BKom762I5biH29
fJEIACaCyFCxMDmfTxp4/ABVzUPrP8iHu5RPFMecOwOZBdlr/+sB4MrqTdBWPm9I
fjMVSw17cfxAvx7Zt5l7w/2cX9HfP9Ua7v+FzpDzYljjJxAV/qAnTGLGwgKWFJWR
zkP80kRbrdvAIXI8FP73OJ7xQvAlMVTzBygBAHlD63ayhHFnCC1dGaYYDR9pE90H
78q4TiWmj9lmuf0Ny62D/kspuLGUSVFoNndAQK+TTmwGq2tcoinYgSCYFCDISI0L
2gyLxXIA7OKLVLSG7a9J2as2cbGfMz3FF05Enf20U1XzvJKxrNPfPDn6eMGgS0l/
bQIDAQAB
-----END PUBLIC KEY-----`;

const LICENSE_PATH = join(homedir(), ".moltmind", "license.key");
const INSTANCE_ID_PATH = join(homedir(), ".moltmind", "instance_id");
const FREE_DAILY_LIMIT = 20;
const FREE_TOTAL_LIMIT = 200;

// Cache license validation result (validated once at startup)
let licenseCache: { valid: boolean; message: string } | null = null;

export function validateLicense(): { valid: boolean; message: string } {
  if (licenseCache !== null) return licenseCache;

  if (!existsSync(LICENSE_PATH)) {
    licenseCache = { valid: false, message: "No license file. Save your key to ~/.moltmind/license.key" };
    return licenseCache;
  }
  if (!existsSync(INSTANCE_ID_PATH)) {
    licenseCache = { valid: false, message: "No instance_id found. Run any MoltMind tool first." };
    return licenseCache;
  }

  const key = readFileSync(LICENSE_PATH, "utf-8").trim();
  const instanceId = readFileSync(INSTANCE_ID_PATH, "utf-8").trim();

  const match = key.match(/^MMPRO-([a-f0-9]{8})-(.+)$/);
  if (!match) {
    licenseCache = { valid: false, message: "Invalid license format" };
    return licenseCache;
  }

  const [, prefix, sig64] = match;

  // Verify prefix matches this machine
  const expectedPrefix = instanceId.replace(/-/g, "").slice(0, 8);
  if (prefix !== expectedPrefix) {
    licenseCache = { valid: false, message: "License key is for a different machine" };
    return licenseCache;
  }

  // Verify RSA signature
  try {
    const signature = Buffer.from(sig64, "base64url");
    const isValid = crypto.verify("sha256", Buffer.from(instanceId), PUBLIC_KEY, signature);
    if (!isValid) {
      licenseCache = { valid: false, message: "Invalid license key" };
      return licenseCache;
    }
  } catch {
    licenseCache = { valid: false, message: "License verification failed" };
    return licenseCache;
  }

  licenseCache = { valid: true, message: `Pro license active (machine ${prefix})` };
  return licenseCache;
}

// Reset cache (for testing)
export function _resetLicenseCache(): void {
  licenseCache = null;
}

export function isProTier(): boolean {
  return validateLicense().valid;
}

export function checkStoreLimits(): { allowed: boolean; message: string } {
  if (isProTier()) {
    return { allowed: true, message: "Pro: unlimited" };
  }

  const stats = getMemoryStats();
  // Exclude archived from total count
  const activeMemories = stats.total - (stats.by_tier["archived"] ?? 0);
  if (activeMemories >= FREE_TOTAL_LIMIT) {
    return {
      allowed: false,
      message: `Free tier limit: ${FREE_TOTAL_LIMIT} total memories reached. Upgrade to Pro for unlimited storage.`,
    };
  }

  const todayStores = getDailyStoreCount();
  if (todayStores >= FREE_DAILY_LIMIT) {
    return {
      allowed: false,
      message: `Free tier limit: ${FREE_DAILY_LIMIT} stores per day reached. Resets tomorrow.`,
    };
  }

  return {
    allowed: true,
    message: `Free: ${FREE_DAILY_LIMIT - todayStores}/day, ${FREE_TOTAL_LIMIT - activeMemories} total remaining`,
  };
}

// Exported for testing
export const _constants = {
  FREE_DAILY_LIMIT,
  FREE_TOTAL_LIMIT,
  PUBLIC_KEY,
  LICENSE_PATH,
  INSTANCE_ID_PATH,
} as const;

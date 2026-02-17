import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
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
const ADMIN_LICENSE_PATH = join(homedir(), ".moltmind", "admin.key");
const INSTANCE_ID_PATH = join(homedir(), ".moltmind", "instance_id");
const HEARTBEAT_PATH = join(homedir(), ".moltmind", "last_heartbeat");
const HEARTBEAT_API_URL = "https://moltmind-license.arimatch1.workers.dev/api/heartbeat";
const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const HEARTBEAT_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FREE_DAILY_LIMIT = 20;
const FREE_TOTAL_LIMIT = 200;

// Cache license validation result (validated once at startup)
let licenseCache: { valid: boolean; admin: boolean; message: string } | null = null;

/**
 * Validate an RSA-signed license key against this machine's instance_id.
 * Checks admin.key first, then license.key.
 */
export function validateLicense(): { valid: boolean; admin: boolean; message: string } {
  if (licenseCache !== null) return licenseCache;

  if (!existsSync(INSTANCE_ID_PATH)) {
    licenseCache = { valid: false, admin: false, message: "No instance_id found. Run any MoltMind tool first." };
    return licenseCache;
  }

  const instanceId = readFileSync(INSTANCE_ID_PATH, "utf-8").trim();
  const expectedPrefix = instanceId.replace(/-/g, "").slice(0, 8);

  // Check admin license first
  if (existsSync(ADMIN_LICENSE_PATH)) {
    const adminResult = verifyKey(readFileSync(ADMIN_LICENSE_PATH, "utf-8").trim(), instanceId, expectedPrefix, "MMADMIN");
    if (adminResult.valid) {
      licenseCache = { valid: true, admin: true, message: `Admin license active (machine ${expectedPrefix})` };
      return licenseCache;
    }
  }

  // Check regular Pro license
  if (!existsSync(LICENSE_PATH)) {
    licenseCache = { valid: false, admin: false, message: "No license file. Save your key to ~/.moltmind/license.key" };
    return licenseCache;
  }

  const proResult = verifyKey(readFileSync(LICENSE_PATH, "utf-8").trim(), instanceId, expectedPrefix, "MMPRO");
  if (!proResult.valid) {
    licenseCache = { valid: false, admin: false, message: proResult.message };
    return licenseCache;
  }

  licenseCache = { valid: true, admin: false, message: `Pro license active (machine ${expectedPrefix})` };
  return licenseCache;
}

function verifyKey(
  key: string,
  instanceId: string,
  expectedPrefix: string,
  keyPrefix: "MMPRO" | "MMADMIN"
): { valid: boolean; message: string } {
  const regex = new RegExp(`^${keyPrefix}-([a-f0-9]{8})-(.+)$`);
  const match = key.match(regex);
  if (!match) {
    return { valid: false, message: "Invalid license format" };
  }

  const [, prefix, sig64] = match;

  if (prefix !== expectedPrefix) {
    return { valid: false, message: "License key is for a different machine" };
  }

  try {
    const signature = Buffer.from(sig64, "base64url");
    const isValid = crypto.verify("sha256", Buffer.from(instanceId), PUBLIC_KEY, signature);
    if (!isValid) {
      return { valid: false, message: "Invalid license key" };
    }
  } catch {
    return { valid: false, message: "License verification failed" };
  }

  return { valid: true, message: "OK" };
}

// Reset cache (for testing)
export function _resetLicenseCache(): void {
  licenseCache = null;
}

export function isProTier(): boolean {
  return validateLicense().valid;
}

export function isAdminTier(): boolean {
  return validateLicense().admin;
}

/**
 * Heartbeat check — verifies this machine is the active one for this license.
 * - Admin licenses skip entirely.
 * - Only checks once per 24 hours.
 * - 7-day grace period for network failures.
 * - Revokes license if another machine is active.
 */
export async function checkHeartbeat(): Promise<void> {
  // Admin licenses never need heartbeat
  if (isAdminTier()) return;

  // Only check if we have a Pro license
  if (!isProTier()) return;

  // Throttle: only check once per 24 hours
  if (existsSync(HEARTBEAT_PATH)) {
    try {
      const lastCheck = new Date(readFileSync(HEARTBEAT_PATH, "utf-8").trim()).getTime();
      if (Date.now() - lastCheck < HEARTBEAT_INTERVAL_MS) return;
    } catch {
      // Corrupted file — proceed with check
    }
  }

  const instanceId = readFileSync(INSTANCE_ID_PATH, "utf-8").trim();
  const licenseKey = readFileSync(LICENSE_PATH, "utf-8").trim();
  const prefixMatch = licenseKey.match(/^MMPRO-([a-f0-9]{8})-/);
  if (!prefixMatch) return;
  const licensePrefix = prefixMatch[1];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(HEARTBEAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_id: instanceId, license_prefix: licensePrefix }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json() as { valid: boolean; message?: string };

    if (data.valid) {
      // Success — update last heartbeat timestamp
      writeFileSync(HEARTBEAT_PATH, new Date().toISOString(), "utf-8");
    } else {
      // License active on another machine — revoke locally
      console.error(`MoltMind: License deactivated — ${data.message ?? "active on another machine"}`);
      try { unlinkSync(LICENSE_PATH); } catch { /* already gone */ }
      try { unlinkSync(HEARTBEAT_PATH); } catch { /* already gone */ }
      _resetLicenseCache();
    }
  } catch {
    // Network error — check grace period
    if (existsSync(HEARTBEAT_PATH)) {
      try {
        const lastCheck = new Date(readFileSync(HEARTBEAT_PATH, "utf-8").trim()).getTime();
        if (Date.now() - lastCheck < HEARTBEAT_GRACE_MS) {
          console.error("MoltMind: Heartbeat unreachable, grace period active");
          return;
        }
      } catch {
        // Corrupted timestamp — fall through to revoke
      }
    }
    // No recent heartbeat — revert to free tier
    console.error("MoltMind: Heartbeat unreachable, grace period expired — reverting to free tier");
    try { unlinkSync(LICENSE_PATH); } catch { /* already gone */ }
    try { unlinkSync(HEARTBEAT_PATH); } catch { /* already gone */ }
    _resetLicenseCache();
  }
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
  ADMIN_LICENSE_PATH,
  INSTANCE_ID_PATH,
  HEARTBEAT_PATH,
  HEARTBEAT_API_URL,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_GRACE_MS,
} as const;

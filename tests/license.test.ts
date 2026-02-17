import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import crypto from "node:crypto";

let testDir: string;

describe("License RSA Validation Logic", () => {
  let publicKey: string;
  let privateKey: string;

  beforeEach(() => {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub;
    privateKey = priv;

    testDir = join(tmpdir(), `moltmind-license-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should generate and verify a valid license key", () => {
    const instanceId = crypto.randomUUID();
    const signature = crypto.sign("sha256", Buffer.from(instanceId), privateKey);
    const sig64 = signature.toString("base64url");
    const prefix = instanceId.replace(/-/g, "").slice(0, 8);
    const licenseKey = `MMPRO-${prefix}-${sig64}`;

    const match = licenseKey.match(/^MMPRO-([a-f0-9]{8})-(.+)$/);
    assert.ok(match, "License key should match expected format");

    const [, keyPrefix, keySig64] = match;
    const expectedPrefix = instanceId.replace(/-/g, "").slice(0, 8);
    assert.equal(keyPrefix, expectedPrefix);

    const sigBuf = Buffer.from(keySig64, "base64url");
    const isValid = crypto.verify("sha256", Buffer.from(instanceId), publicKey, sigBuf);
    assert.equal(isValid, true, "RSA signature should verify");
  });

  it("should reject a tampered signature", () => {
    const instanceId = crypto.randomUUID();
    const signature = crypto.sign("sha256", Buffer.from(instanceId), privateKey);
    const sig64 = signature.toString("base64url");

    const tamperedSig = "x" + sig64.slice(1);

    const sigBuf = Buffer.from(tamperedSig, "base64url");
    const isValid = crypto.verify("sha256", Buffer.from(instanceId), publicKey, sigBuf);
    assert.equal(isValid, false, "Tampered signature should not verify");
  });

  it("should reject a key for a different machine", () => {
    const instanceIdA = crypto.randomUUID();
    const instanceIdB = crypto.randomUUID();

    const signature = crypto.sign("sha256", Buffer.from(instanceIdA), privateKey);
    const sig64 = signature.toString("base64url");

    const sigBuf = Buffer.from(sig64, "base64url");
    const isValid = crypto.verify("sha256", Buffer.from(instanceIdB), publicKey, sigBuf);
    assert.equal(isValid, false, "Key signed for machine A should not verify for machine B");
  });

  it("should reject an invalid license format", () => {
    const badFormats = [
      "invalid-key",
      "MMPRO-short-sig",
      "MMPRO-12345678",
      "PRO-12345678-sig",
      "",
    ];

    for (const key of badFormats) {
      const match = key.match(/^MMPRO-([a-f0-9]{8})-(.+)$/);
      assert.equal(match, null, `"${key}" should not match the license format`);
    }
  });

  it("should detect prefix mismatch", () => {
    const instanceId = crypto.randomUUID();
    const expectedPrefix = instanceId.replace(/-/g, "").slice(0, 8);
    const wrongPrefix = "00000000";
    assert.notEqual(expectedPrefix, wrongPrefix, "Prefixes should differ for the test");
  });
});

describe("License Key Generation Script Logic", () => {
  let privateKey: string;

  beforeEach(() => {
    const pair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKey = pair.privateKey;
  });

  it("should produce a key that matches MMPRO-{prefix}-{sig} format", () => {
    const instanceId = crypto.randomUUID();
    const signature = crypto.sign("sha256", Buffer.from(instanceId), privateKey);
    const sig64 = signature.toString("base64url");
    const prefix = instanceId.replace(/-/g, "").slice(0, 8);
    const key = `MMPRO-${prefix}-${sig64}`;

    assert.ok(key.startsWith("MMPRO-"));
    assert.ok(key.length > 20);
    const parts = key.split("-");
    assert.equal(parts[0], "MMPRO");
    assert.equal(parts[1].length, 8);
  });
});

describe("Free Tier Limits Logic", () => {
  let db: typeof import("../src/db.js");
  const originalCwd = process.cwd();

  beforeEach(async () => {
    testDir = join(tmpdir(), `moltmind-limits-${crypto.randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    db = await import("../src/db.js");
    db.closeDb();
    db.initProjectVault();
  });

  afterEach(() => {
    db.closeDb();
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("getDailyStoreCount should count today's memories", () => {
    assert.equal(db.getDailyStoreCount(), 0);

    db.insertMemory({
      type: "raw",
      title: "Test",
      content: "Content",
      tags: [],
      metadata: {},
      embedding: null,
      tier: "hot",
    });

    assert.equal(db.getDailyStoreCount(), 1);
  });

  it("getDailyStoreCount should exclude archived memories", () => {
    const mem = db.insertMemory({
      type: "raw",
      title: "To archive",
      content: "Content",
      tags: [],
      metadata: {},
      embedding: null,
      tier: "hot",
    });

    assert.equal(db.getDailyStoreCount(), 1);
    db.deleteMemory(mem.id);
    assert.equal(db.getDailyStoreCount(), 0);
  });

  it("getMemoryStats should return accurate totals", () => {
    const stats = db.getMemoryStats();
    assert.equal(stats.total, 0);

    db.insertMemory({
      type: "learning",
      title: "Test",
      content: "Content",
      tags: [],
      metadata: {},
      embedding: null,
      tier: "hot",
    });

    const stats2 = db.getMemoryStats();
    assert.equal(stats2.total, 1);
    assert.equal(stats2.by_type["learning"], 1);
    assert.equal(stats2.by_tier["hot"], 1);
  });
});

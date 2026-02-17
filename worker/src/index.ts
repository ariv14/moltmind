/**
 * MoltMind License Worker — Cloudflare Worker for license checkout, webhook, and heartbeat.
 *
 * Routes:
 *   GET  /checkout               — Create Polar checkout session via API, redirect to payment
 *   POST /api/webhook/polar      — Handle Polar order.created webhook (Standard Webhooks sig)
 *   GET  /api/license/:token     — CLI polls for license key after payment
 *   POST /api/heartbeat          — One-machine enforcement check
 */

interface Env {
  LICENSES: KVNamespace;
  ACTIVE_LICENSES: KVNamespace;
  RSA_PRIVATE_KEY: string;
  POLAR_WEBHOOK_SECRET: string;
  POLAR_ACCESS_TOKEN: string;
  POLAR_PRODUCT_ID: string;
}

interface ActiveLicenseRecord {
  instance_id: string;
  license_key: string;
  email: string;
  activated_at: string;
}

const POLAR_API_BASE = "https://api.polar.sh/v1";
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

// CORS headers for CLI polling
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// --- RSA Signing (Web Crypto API) ---

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signLicense(instanceId: string, privateKeyPem: string): Promise<string> {
  const key = await importPrivateKey(privateKeyPem);
  const data = new TextEncoder().encode(instanceId);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  const sig64 = arrayBufferToBase64url(signature);
  const prefix = instanceId.replace(/-/g, "").slice(0, 8);
  return `MMPRO-${prefix}-${sig64}`;
}

// --- Standard Webhooks Signature Verification ---
// Spec: https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md
// Format: HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{body}", base64 encoded, prefixed with "v1,"

async function verifyStandardWebhook(
  body: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const msgId = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");

  if (!msgId || !timestamp || !signatureHeader) return false;

  // Reject old timestamps (replay protection)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return false;

  // Construct signed content: "{msg_id}.{timestamp}.{body}"
  const signedContent = `${msgId}.${timestamp}.${body}`;

  // Polar's secret may be prefixed with "whsec_" per Standard Webhooks convention
  const secretBytes = secret.startsWith("whsec_")
    ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(secret);

  // Import HMAC key
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedContent));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(mac)));

  // Check against all signatures in the header (space-delimited, each prefixed with version)
  const signatures = signatureHeader.split(" ");
  for (const sig of signatures) {
    const [version, value] = sig.split(",", 2);
    if (version === "v1" && value === expectedSig) {
      return true;
    }
  }

  return false;
}

// --- Route Handlers ---

async function handleCheckout(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const instanceId = url.searchParams.get("id");
  const activationToken = url.searchParams.get("token");

  if (!instanceId || !activationToken) {
    return jsonResponse({ error: "Missing id or token parameter" }, 400);
  }

  // Create Polar checkout session via API with metadata
  const checkoutRes = await fetch(`${POLAR_API_BASE}/checkouts/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products: [env.POLAR_PRODUCT_ID],
      metadata: {
        instance_id: instanceId,
        activation_token: activationToken,
      },
      success_url: `https://api.aidigitalcrew.com/api/license/${activationToken}?success=true`,
    }),
  });

  if (!checkoutRes.ok) {
    const err = await checkoutRes.text();
    return jsonResponse({ error: "Failed to create checkout session", detail: err }, 502);
  }

  const checkout = await checkoutRes.json() as { url?: string };
  if (!checkout.url) {
    return jsonResponse({ error: "No checkout URL returned" }, 502);
  }

  return Response.redirect(checkout.url, 302);
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();

  // Verify Standard Webhooks signature
  const valid = await verifyStandardWebhook(body, request.headers, env.POLAR_WEBHOOK_SECRET);
  if (!valid) {
    return jsonResponse({ error: "Invalid webhook signature" }, 401);
  }

  let payload: {
    type?: string;
    data?: {
      id?: string;
      metadata?: { instance_id?: string; activation_token?: string };
      customer?: { email?: string };
      customer_email?: string;
    };
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Only handle order.created events
  if (payload.type !== "order.created") {
    return jsonResponse({ received: true });
  }

  const data = payload.data;
  if (!data) return jsonResponse({ error: "No data in payload" }, 400);

  const instanceId = data.metadata?.instance_id;
  const activationToken = data.metadata?.activation_token;
  const orderId = data.id;
  const email = data.customer?.email ?? data.customer_email ?? "unknown";

  if (!instanceId || !activationToken || !orderId) {
    return jsonResponse({ error: "Missing metadata fields" }, 400);
  }

  // Sign the license
  const licenseKey = await signLicense(instanceId, env.RSA_PRIVATE_KEY);

  // Store for CLI polling (24h TTL)
  await env.LICENSES.put(activationToken, JSON.stringify({
    license_key: licenseKey,
    instance_id: instanceId,
  }), { expirationTtl: 86400 });

  // Store for heartbeat enforcement (permanent)
  const activeRecord: ActiveLicenseRecord = {
    instance_id: instanceId,
    license_key: licenseKey,
    email,
    activated_at: new Date().toISOString(),
  };
  await env.ACTIVE_LICENSES.put(orderId, JSON.stringify(activeRecord));

  // Also store a reverse lookup: license_prefix → order_id
  const prefix = instanceId.replace(/-/g, "").slice(0, 8);
  await env.ACTIVE_LICENSES.put(`prefix:${prefix}`, orderId);

  return jsonResponse({ success: true });
}

async function handleLicensePoll(activationToken: string, env: Env): Promise<Response> {
  const stored = await env.LICENSES.get(activationToken);

  if (!stored) {
    return jsonResponse({ success: false, status: "pending" });
  }

  try {
    const data = JSON.parse(stored) as { license_key: string };
    return jsonResponse({ success: true, license_key: data.license_key });
  } catch {
    return jsonResponse({ success: false, status: "error" }, 500);
  }
}

async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  let body: { instance_id?: string; license_prefix?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return jsonResponse({ valid: false, message: "Invalid JSON" }, 400);
  }

  const { instance_id, license_prefix } = body;
  if (!instance_id || !license_prefix) {
    return jsonResponse({ valid: false, message: "Missing instance_id or license_prefix" }, 400);
  }

  // Look up the order by license prefix
  const orderId = await env.ACTIVE_LICENSES.get(`prefix:${license_prefix}`);
  if (!orderId) {
    // No record — could be an old license from before heartbeat was added
    return jsonResponse({ valid: true, message: "No heartbeat record found, allowing" });
  }

  const recordStr = await env.ACTIVE_LICENSES.get(orderId);
  if (!recordStr) {
    return jsonResponse({ valid: true, message: "No active record found, allowing" });
  }

  try {
    const record = JSON.parse(recordStr) as ActiveLicenseRecord;
    if (record.instance_id === instance_id) {
      return jsonResponse({ valid: true });
    }
    return jsonResponse({
      valid: false,
      message: "License active on another machine. Run 'npx moltmind --upgrade' to transfer.",
    });
  } catch {
    return jsonResponse({ valid: true, message: "Record parse error, allowing" });
  }
}

// --- Main Router ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // GET /checkout
    if (path === "/checkout" && request.method === "GET") {
      return handleCheckout(request, env);
    }

    // POST /api/webhook/polar
    if (path === "/api/webhook/polar" && request.method === "POST") {
      return handleWebhook(request, env);
    }

    // GET /api/license/:activationToken
    const licenseMatch = path.match(/^\/api\/license\/([a-f0-9-]+)$/);
    if (licenseMatch && request.method === "GET") {
      return handleLicensePoll(licenseMatch[1], env);
    }

    // POST /api/heartbeat
    if (path === "/api/heartbeat" && request.method === "POST") {
      return handleHeartbeat(request, env);
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};

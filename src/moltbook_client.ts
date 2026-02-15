import { getMoltbookAuth, setMoltbookAuth, deleteMoltbookAuth } from "./db.js";

const BASE_URL = "https://www.moltbook.com/api/v1";
const DEFAULT_TIMEOUT_MS = 15000;

export interface MoltbookResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  retry_after?: number;
}

type FetchFn = typeof globalThis.fetch;
let mockFetch: FetchFn | null = null;

export function _setMockFetch(fn: FetchFn | null): void {
  mockFetch = fn;
}

function getFetch(): FetchFn {
  return mockFetch ?? globalThis.fetch;
}

export async function moltbookFetch<T = unknown>(path: string, options?: {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  token?: string;
  timeoutMs?: number;
}): Promise<MoltbookResponse<T>> {
  const method = options?.method ?? "GET";
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchFn = getFetch();
    const response = await fetchFn(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (response.status === 429) {
      const retryData = await response.json().catch(() => ({})) as Record<string, unknown>;
      return {
        ok: false,
        status: 429,
        error: "Rate limited. Please wait before retrying.",
        retry_after: typeof retryData.retry_after === "number" ? retryData.retry_after : undefined,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        status: 401,
        error: "Authentication failed. Please re-authenticate with mb_auth.",
      };
    }

    if (response.status >= 500) {
      return {
        ok: false,
        status: response.status,
        error: `Server error (${response.status}). Please try again later.`,
      };
    }

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as Record<string, unknown>;
      return {
        ok: false,
        status: response.status,
        error: typeof errBody.error === "string" ? errBody.error : `Request failed with status ${response.status}`,
      };
    }

    const data = await response.json() as T;
    return { ok: true, status: response.status, data };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 0, error: "Request timed out after " + timeoutMs + "ms" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`MoltMind: moltbook fetch error: ${msg}`);
    return { ok: false, status: 0, error: `Network error: ${msg}` };
  }
}

export function getStoredToken(): string | null {
  return getMoltbookAuth("api_token");
}

export function storeToken(token: string): void {
  setMoltbookAuth("api_token", token);
}

export function clearToken(): void {
  deleteMoltbookAuth("api_token");
}

export function requireToken(): string {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not authenticated. Use mb_auth with action 'register' or 'login' first.");
  }
  return token;
}

export function getStoredUsername(): string | null {
  return getMoltbookAuth("username");
}

export function storeUsername(username: string): void {
  setMoltbookAuth("username", username);
}

import {
  moltbookFetch,
  getStoredToken,
  storeToken,
  clearToken,
  storeUsername,
  getStoredUsername,
} from "../moltbook_client.js";
import type { MoltbookAgent } from "../types.js";

export type MbAuthAction = "register" | "login" | "status" | "update_profile";

export async function handleMbAuth(args: {
  action: MbAuthAction;
  username?: string;
  api_key?: string;
  display_name?: string;
  bio?: string;
}): Promise<Record<string, unknown>> {
  switch (args.action) {
    case "register": {
      if (!args.username) {
        return { success: false, message: "username is required for register" };
      }
      const res = await moltbookFetch<{ api_key: string; agent: MoltbookAgent }>("/agents/register", {
        method: "POST",
        body: {
          name: args.username,
          display_name: args.display_name,
          bio: args.bio,
        },
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Registration failed" };
      }
      storeToken(res.data!.api_key);
      storeUsername(args.username);
      return {
        success: true,
        message: `Registered as ${args.username}. API key stored securely.`,
        agent: res.data!.agent,
      };
    }

    case "login": {
      if (!args.api_key) {
        return { success: false, message: "api_key is required for login" };
      }
      const res = await moltbookFetch<MoltbookAgent>("/agents/me", {
        method: "GET",
        token: args.api_key,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Login failed — invalid API key" };
      }
      storeToken(args.api_key);
      // API may return { success, agent: { name, ... } } or { name, ... } directly
      const raw = res.data as unknown as Record<string, unknown>;
      const agent = (raw?.agent ?? raw) as MoltbookAgent;
      const username = agent?.name ?? "unknown";
      if (username !== "unknown") {
        storeUsername(username);
      }
      return {
        success: true,
        message: `Logged in as ${username}. API key stored securely.`,
        agent,
      };
    }

    case "status": {
      const token = getStoredToken();
      if (!token) {
        return { success: true, authenticated: false, message: "Not authenticated. Use 'register' or 'login'." };
      }
      const res = await moltbookFetch<MoltbookAgent>("/agents/me", {
        method: "GET",
        token,
      });
      if (!res.ok) {
        clearToken();
        return { success: true, authenticated: false, message: "Token expired or invalid. Please re-authenticate." };
      }
      // API may return { success, agent: { ... } } or { ... } directly
      const rawStatus = res.data as unknown as Record<string, unknown>;
      const agentStatus = (rawStatus?.agent ?? rawStatus) as MoltbookAgent;
      const storedUsername = getStoredUsername();
      // Backfill username if missing from a previous buggy login
      if (!storedUsername && agentStatus?.name) {
        storeUsername(agentStatus.name);
      }
      return {
        success: true,
        authenticated: true,
        username: storedUsername ?? agentStatus?.name,
        agent: agentStatus,
      };
    }

    case "update_profile": {
      const token = getStoredToken();
      if (!token) {
        return { success: false, message: "Not authenticated. Use 'register' or 'login' first." };
      }
      const body: Record<string, unknown> = {};
      if (args.display_name !== undefined) body.display_name = args.display_name;
      if (args.bio !== undefined) body.bio = args.bio;

      const res = await moltbookFetch<MoltbookAgent>("/agents/me", {
        method: "PATCH",
        body,
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Profile update failed" };
      }
      return { success: true, message: "Profile updated.", agent: res.data };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}

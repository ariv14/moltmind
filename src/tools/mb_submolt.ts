import { moltbookFetch, requireToken } from "../moltbook_client.js";
import type { MoltbookSubmolt } from "../types.js";

export type MbSubmoltAction = "create" | "list" | "get" | "subscribe" | "unsubscribe";

export async function handleMbSubmolt(args: {
  action: MbSubmoltAction;
  name?: string;
  description?: string;
}): Promise<Record<string, unknown>> {
  const token = requireToken();

  switch (args.action) {
    case "create": {
      if (!args.name || !args.description) {
        return { success: false, message: "name and description are required to create a submolt" };
      }
      const res = await moltbookFetch<MoltbookSubmolt>("/submolts", {
        method: "POST",
        body: { name: args.name, description: args.description },
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to create submolt" };
      }
      return { success: true, message: `Submolt '${args.name}' created.`, submolt: res.data };
    }

    case "list": {
      const res = await moltbookFetch<MoltbookSubmolt[]>("/submolts", {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to list submolts" };
      }
      return { success: true, submolts: res.data, count: (res.data ?? []).length };
    }

    case "get": {
      if (!args.name) {
        return { success: false, message: "name is required to get a submolt" };
      }
      const res = await moltbookFetch<MoltbookSubmolt>(`/submolts/${encodeURIComponent(args.name)}`, {
        method: "GET",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Submolt not found" };
      }
      return { success: true, submolt: res.data };
    }

    case "subscribe": {
      if (!args.name) {
        return { success: false, message: "name is required to subscribe to a submolt" };
      }
      const res = await moltbookFetch(`/submolts/${encodeURIComponent(args.name)}/subscribe`, {
        method: "POST",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to subscribe" };
      }
      return { success: true, message: `Subscribed to ${args.name}.` };
    }

    case "unsubscribe": {
      if (!args.name) {
        return { success: false, message: "name is required to unsubscribe from a submolt" };
      }
      const res = await moltbookFetch(`/submolts/${encodeURIComponent(args.name)}/subscribe`, {
        method: "DELETE",
        token,
      });
      if (!res.ok) {
        return { success: false, message: res.error ?? "Failed to unsubscribe" };
      }
      return { success: true, message: `Unsubscribed from ${args.name}.` };
    }

    default:
      return { success: false, message: `Unknown action: ${args.action}` };
  }
}

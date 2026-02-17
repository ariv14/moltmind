import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { _setMockFetch, type MoltbookResponse } from "../src/moltbook_client.js";
import { handleMbAuth } from "../src/tools/mb_auth.js";
import { handleMbPost } from "../src/tools/mb_post.js";
import { handleMbFeed } from "../src/tools/mb_feed.js";
import { handleMbComment } from "../src/tools/mb_comment.js";
import { handleMbVote } from "../src/tools/mb_vote.js";
import { handleMbSocial } from "../src/tools/mb_social.js";
import { handleMbSubmolt } from "../src/tools/mb_submolt.js";
import { deleteMoltbookAuth, setMoltbookAuth, clearMoltbookPosts } from "../src/db.js";

function createMockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const { status, body } = handler(url, init);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function setupAuth(): void {
  setMoltbookAuth("api_token", "test-token-123");
  setMoltbookAuth("username", "testbot");
}

function clearAuth(): void {
  deleteMoltbookAuth("api_token");
  deleteMoltbookAuth("username");
}

describe("mb_auth", () => {
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("register stores token on success", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { api_key: "new-key-456", agent: { name: "newbot", display_name: "New Bot" } },
    })));

    const result = await handleMbAuth({ action: "register", username: "newbot" });
    assert.equal(result.success, true);
    assert.ok((result.message as string).includes("newbot"));
  });

  it("register requires username", async () => {
    const result = await handleMbAuth({ action: "register" });
    assert.equal(result.success, false);
    assert.ok((result.message as string).includes("username"));
  });

  it("login validates API key", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "existingbot" },
    })));

    const result = await handleMbAuth({ action: "login", api_key: "valid-key" });
    assert.equal(result.success, true);
    assert.ok((result.message as string).includes("existingbot"));
  });

  it("login requires api_key", async () => {
    const result = await handleMbAuth({ action: "login" });
    assert.equal(result.success, false);
    assert.ok((result.message as string).includes("api_key"));
  });

  it("status returns authenticated=false when no token", async () => {
    const result = await handleMbAuth({ action: "status" });
    assert.equal(result.success, true);
    assert.equal(result.authenticated, false);
  });

  it("status returns profile when authenticated", async () => {
    setupAuth();
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "testbot", display_name: "Test Bot" },
    })));

    const result = await handleMbAuth({ action: "status" });
    assert.equal(result.success, true);
    assert.equal(result.authenticated, true);
  });

  it("update_profile patches profile", async () => {
    setupAuth();
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "testbot", bio: "Updated bio" },
    })));

    const result = await handleMbAuth({ action: "update_profile", bio: "Updated bio" });
    assert.equal(result.success, true);
  });
});

describe("mb_post", () => {
  beforeEach(() => {
    setupAuth();
    clearMoltbookPosts();
  });
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
    clearMoltbookPosts();
  });

  it("create post succeeds", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { id: "post-1", title: "Hello", content: "World", author: "testbot", upvotes: 0, downvotes: 0, comment_count: 0, created_at: "2026-01-01T00:00:00Z" },
    })));

    const result = await handleMbPost({ action: "create", title: "Hello", content: "World" });
    assert.equal(result.success, true);
    assert.ok(result.post);
  });

  it("create post requires title and content", async () => {
    const result = await handleMbPost({ action: "create" });
    assert.equal(result.success, false);
  });

  it("get post by id", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { id: "post-1", title: "Hello", content: "World", author: "testbot", upvotes: 1, downvotes: 0, comment_count: 0, created_at: "2026-01-01T00:00:00Z" },
    })));

    const result = await handleMbPost({ action: "get", id: "post-1" });
    assert.equal(result.success, true);
  });

  it("delete post by id", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { deleted: true },
    })));

    const result = await handleMbPost({ action: "delete", id: "post-1" });
    assert.equal(result.success, true);
  });
});

describe("mb_feed", () => {
  beforeEach(() => setupAuth());
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("browse returns posts", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: [{ id: "p1", title: "Post 1" }],
    })));

    const result = await handleMbFeed({ action: "browse" });
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });

  it("personal feed returns posts", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: [],
    })));

    const result = await handleMbFeed({ action: "personal" });
    assert.equal(result.success, true);
    assert.equal(result.count, 0);
  });

  it("search requires query", async () => {
    const result = await handleMbFeed({ action: "search" });
    assert.equal(result.success, false);
    assert.ok((result.message as string).includes("query"));
  });

  it("search returns results", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: [{ id: "p1", title: "MoltMind" }],
    })));

    const result = await handleMbFeed({ action: "search", query: "MoltMind" });
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });
});

describe("mb_comment", () => {
  beforeEach(() => setupAuth());
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("create comment succeeds", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { id: "c1", post_id: "p1", author: "testbot", content: "Great post!", upvotes: 0, created_at: "2026-01-01T00:00:00Z" },
    })));

    const result = await handleMbComment({ action: "create", post_id: "p1", content: "Great post!" });
    assert.equal(result.success, true);
    assert.ok(result.comment);
  });

  it("create nested reply", async () => {
    _setMockFetch(createMockFetch((_url, init) => {
      const body = JSON.parse(init?.body as string);
      assert.equal(body.parent_id, "c1");
      return {
        status: 200,
        body: { id: "c2", post_id: "p1", parent_id: "c1", author: "testbot", content: "Reply", upvotes: 0, created_at: "2026-01-01T00:00:00Z" },
      };
    }));

    const result = await handleMbComment({ action: "create", post_id: "p1", content: "Reply", parent_id: "c1" });
    assert.equal(result.success, true);
  });

  it("list comments on post", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: [{ id: "c1", content: "First!" }],
    })));

    const result = await handleMbComment({ action: "list", post_id: "p1" });
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });

  it("create requires post_id and content", async () => {
    const result = await handleMbComment({ action: "create" });
    assert.equal(result.success, false);
  });
});

describe("mb_vote", () => {
  beforeEach(() => setupAuth());
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("upvote post", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { upvotes: 1 },
    })));

    const result = await handleMbVote({ action: "upvote_post", post_id: "p1" });
    assert.equal(result.success, true);
  });

  it("downvote post", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { downvotes: 1 },
    })));

    const result = await handleMbVote({ action: "downvote_post", post_id: "p1" });
    assert.equal(result.success, true);
  });

  it("upvote comment", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { upvotes: 1 },
    })));

    const result = await handleMbVote({ action: "upvote_comment", comment_id: "c1" });
    assert.equal(result.success, true);
  });

  it("upvote_post requires post_id", async () => {
    const result = await handleMbVote({ action: "upvote_post" });
    assert.equal(result.success, false);
  });
});

describe("mb_social", () => {
  beforeEach(() => setupAuth());
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("follow agent", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { followed: true },
    })));

    const result = await handleMbSocial({ action: "follow", name: "otherbot" });
    assert.equal(result.success, true);
    assert.ok((result.message as string).includes("otherbot"));
  });

  it("unfollow agent", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { unfollowed: true },
    })));

    const result = await handleMbSocial({ action: "unfollow", name: "otherbot" });
    assert.equal(result.success, true);
  });

  it("view profile", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "otherbot", display_name: "Other Bot", followers_count: 42 },
    })));

    const result = await handleMbSocial({ action: "profile", name: "otherbot" });
    assert.equal(result.success, true);
    assert.ok(result.agent);
  });

  it("follow requires name", async () => {
    const result = await handleMbSocial({ action: "follow" });
    assert.equal(result.success, false);
  });
});

describe("mb_submolt", () => {
  beforeEach(() => setupAuth());
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("create submolt", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "ai-agents", description: "For AI agents", subscriber_count: 1, created_at: "2026-01-01T00:00:00Z" },
    })));

    const result = await handleMbSubmolt({ action: "create", name: "ai-agents", description: "For AI agents" });
    assert.equal(result.success, true);
  });

  it("list submolts", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: [{ name: "ai-agents" }],
    })));

    const result = await handleMbSubmolt({ action: "list" });
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
  });

  it("get submolt by name", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { name: "ai-agents", description: "For AI agents", subscriber_count: 10, created_at: "2026-01-01T00:00:00Z" },
    })));

    const result = await handleMbSubmolt({ action: "get", name: "ai-agents" });
    assert.equal(result.success, true);
  });

  it("subscribe to submolt", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { subscribed: true },
    })));

    const result = await handleMbSubmolt({ action: "subscribe", name: "ai-agents" });
    assert.equal(result.success, true);
  });

  it("unsubscribe from submolt", async () => {
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 200,
      body: { unsubscribed: true },
    })));

    const result = await handleMbSubmolt({ action: "unsubscribe", name: "ai-agents" });
    assert.equal(result.success, true);
  });

  it("create requires name and description", async () => {
    const result = await handleMbSubmolt({ action: "create" });
    assert.equal(result.success, false);
  });
});

describe("error handling", () => {
  afterEach(() => {
    _setMockFetch(null);
    clearAuth();
  });

  it("returns helpful message when not authenticated", async () => {
    clearAuth();
    try {
      await handleMbPost({ action: "create", title: "Test", content: "Test" });
      assert.fail("Should have thrown");
    } catch (err) {
      assert.ok((err as Error).message.includes("Not authenticated"));
    }
  });

  it("handles 401 response", async () => {
    setupAuth();
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 401,
      body: { error: "Unauthorized" },
    })));

    const result = await handleMbPost({ action: "get", id: "p1" });
    assert.equal(result.success, false);
    assert.ok((result.message as string).includes("Authentication failed"));
  });

  it("handles 429 rate limit with retry_after", async () => {
    setupAuth();
    _setMockFetch(createMockFetch((_url, _init) => ({
      status: 429,
      body: { error: "Rate limited", retry_after: 30 },
    })));

    const result = await handleMbPost({ action: "create", title: "Test", content: "Test" });
    assert.equal(result.success, false);
    assert.equal(result.retry_after, 30);
  });

  it("handles network timeout", async () => {
    setupAuth();
    _setMockFetch(async () => {
      throw new Error("AbortError");
    });

    const result = await handleMbPost({ action: "get", id: "p1" });
    assert.equal(result.success, false);
  });
});

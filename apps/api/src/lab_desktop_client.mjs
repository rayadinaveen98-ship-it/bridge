import { randomUUID } from "node:crypto";

/**
 * A single-account client for internal Bridge lab testing from Windows.
 * Never stores test passphrases, JWTs or private messages on disk.
 */
export class BridgeLabDesktopClient {
  constructor({ origin = "http://127.0.0.1:8787", fetchImpl = fetch } = {}) {
    const u = new URL(origin);
    if (u.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
      (u.pathname !== "/" && u.pathname !== "") ||
      u.username || u.password || u.search || u.hash || !u.port) {
      throw new TypeError("Only local loopback test backend URLs are allowed");
    }
    this.origin = u.origin;
    this.fetch = fetchImpl;
    this.token = null;
    this.requestId = null;
    this.conversationId = null;
    this.cursor = 0;
  }

  async request(path, { method = "GET", body, auth = true, idempotencyKey } = {}) {
    if (!path.startsWith("/") || path.startsWith("//")) throw new TypeError("Invalid path");
    if (auth && !this.token) throw new Error("Sign in first");
    const headers = { Accept: "application/json" };
    if (auth) headers.Authorization = "Bearer " + this.token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let response;
    try {
      response = await this.fetch(this.origin + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(12_000)
      });
    } catch (err) {
      throw new Error("Cannot reach Bridge test backend at " + this.origin + ". " + err.message);
    }
    const raw = await response.text();
    let data = null;
    try { if (raw) data = JSON.parse(raw); } catch { /* invalid remote response */ }
    if (!response.ok) {
      const err = new Error("Bridge API " + response.status + ": " +
        (data && typeof data.error === "string" ? data.error : "request_failed"));
      err.status = response.status;
      throw err;
    }
    return data;
  }

  async health() {
    const r = await this.request("/healthz", { auth: false });
    if (r?.alive !== true) throw new Error("Bridge health check failed");
    return r;
  }

  async login(handle, passphrase) {
    if (handle !== "tester_b") throw new Error("Desktop helper is reserved for tester_b");
    const data = await this.request("/internal/lab/login", {
      method: "POST", auth: false, body: { handle, passphrase }
    });
    if (typeof data?.token !== "string") throw new Error("Invalid login response");
    this.token = data.token;
  }

  async prepareEnglish() {
    const bootstrap = await this.request("/v1/bootstrap");
    if (!bootstrap.languages?.some(x => x.code === "en")) {
      throw new Error("English is not enabled in the local Bridge test language catalog");
    }
    await this.request("/v1/me/preferences", {
      method: "PUT", body: {
        languageCodes: ["en"], intention: "just_chat",
        interests: [], topic: null
      }
    });
  }

  async search() {
    this.requestId = randomUUID();
    const result = await this.request("/v1/matches/search", {
      method: "POST", idempotencyKey: this.requestId, body: { topic: null }
    });
    if (result?.state === "connected" && result.conversationId) {
      this.conversationId = result.conversationId;
    }
    return result;
  }

  async searchStatus() {
    if (!this.requestId) throw new Error("Search not started");
    const r = await this.request("/v1/matches/search/" + this.requestId);
    if (r?.state === "connected" && r.conversationId) {
      this.conversationId = r.conversationId;
    }
    return r;
  }

  async messages() {
    if (!this.conversationId) throw new Error("No chat yet");
    const items = await this.request("/v1/conversations/" +
      this.conversationId + "/messages?afterSequence=" + this.cursor);
    if (!Array.isArray(items)) throw new Error("Invalid message response");
    const fresh = [];
    for (const item of items) {
      if (!Number.isSafeInteger(item.sequenceNumber) ||
          item.sequenceNumber <= this.cursor) continue;
      if (item.sequenceNumber !== this.cursor + 1) {
        throw new Error("Message cursor gap; do not silently skip chat history");
      }
      this.cursor = item.sequenceNumber;
      fresh.push(item);
    }
    return fresh;
  }

  async peer() {
    if (!this.conversationId) throw new Error("No chat yet");
    return this.request("/v1/conversations/" + this.conversationId + "/peer");
  }

  async send(body) {
    if (!this.conversationId) throw new Error("No chat yet");
    if (!body?.trim() || [...body].length > 4000) {
      throw new Error("Send a nonempty message of at most 4000 characters");
    }
    // Retry using the exact same client message ID if the network is uncertain.
    if (this.pending?.body !== body) {
      this.pending = { id: randomUUID(), body };
    }
    const p = this.pending;
    const result = await this.request("/v1/conversations/" +
      this.conversationId + "/messages", {
        method: "POST", idempotencyKey: p.id,
        body: { clientMessageId: p.id, body: p.body }
      });
    this.pending = null;
    return result;
  }

  async vote(decision) {
    return this.request("/v1/conversations/" + this.conversationId +
      "/connection-vote", { method: "PUT", body: { decision } });
  }

  async endChat() {
    return this.request("/v1/conversations/" + this.conversationId +
      "/close", { method: "POST", body: {} });
  }

  async report(peerAccountId, category = "other") {
    return this.request("/v1/reports", {
      method: "POST",
      body: { reportedAccountId: peerAccountId,
        conversationId: this.conversationId, category }
    });
  }

  async block(peerAccountId) {
    return this.request("/v1/blocks/" + peerAccountId, { method: "PUT" });
  }
}

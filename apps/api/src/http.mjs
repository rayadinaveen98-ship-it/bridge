import { ApiError, verifyBearer, assertId, assertMessage, assertPreferences } from "./auth.mjs";
import { createLimiter } from "./limiter.mjs";

const MAX_BODY_BYTES = 16 * 1024;

async function readBody(req) {
  const type = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") throw new ApiError(415, "unsupported_media_type", "JSON content type required");
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new ApiError(413, "body_too_large", "Request body too large");
    chunks.push(chunk);
  }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ApiError(400, "bad_json", "Malformed JSON"); }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new ApiError(400, "bad_json", "JSON object required");
  }
  return result;
}

function send(res, status, value) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(status === 204 ? "" : JSON.stringify(value));
}

export function createHandler(service, authentication, liveHub = null) {
  if (!service || !authentication) throw new TypeError("Backend dependencies required");
  const limit = createLimiter();
  return async (req, res) => {
    try {
      const pathname = new URL(req.url, "http://127.0.0.1").pathname;
      const method = req.method;
      if (method === "GET" && pathname === "/healthz") {
        return send(res, 200, { alive: true, component: "bridge-internal-api" });
      }
      const { subject } = verifyBearer(req.headers.authorization, authentication);
      limit(subject, method, pathname);
      if (method === "GET" && pathname === "/v1/bootstrap") {
        return send(res, 200, await service.bootstrap(subject));
      }
      if (method === "PUT" && pathname === "/v1/me/preferences") {
        await service.setPreferences(subject, assertPreferences(await readBody(req)));
        return send(res, 204);
      }
      if (method === "POST" && pathname === "/v1/matches/search") {
        const idempotencyKey = assertId(req.headers["idempotency-key"]);
        const body = await readBody(req);
        if (body.topic !== undefined && body.topic !== null &&
            (typeof body.topic !== "string" || body.topic.length > 80)) {
          throw new ApiError(422, "invalid_topic", "Invalid topic");
        }
        return send(res, 202, await service.enqueue(subject, { topic: body.topic ?? null, idempotencyKey }));
      }
      const queue = pathname.match(/^\/v1\/matches\/search\/([^/]+)$/);
      if (queue) {
        const requestId = assertId(queue[1]);
        if (method === "GET") return send(res, 200, await service.queueStatus(subject, requestId));
        if (method === "DELETE") {
          await service.cancelQueue(subject, requestId);
          return send(res, 204);
        }
      }
      const peerRoute = pathname.match(/^\/v1\/conversations\/([^/]+)\/peer$/);
      if (peerRoute && method === "GET") {
        return send(res,200,await service.conversationPeer(subject,assertId(peerRoute[1])));
      }
      const eventStream = pathname.match(/^\/v1\/conversations\/([^/]+)\/events$/);
      if (eventStream && method === "GET") {
        if (!liveHub) throw new ApiError(503,"realtime_unavailable");
        const conversationId=assertId(eventStream[1]);
        return await liveHub.open({
          subject,conversationId,req,res,
          authorize:async()=>{
            // A long-lived stream must not outlive the signed JWT.
            verifyBearer(req.headers.authorization, authentication);
            await service.authorizeEvents(subject,conversationId);
          }
        });
      }
      const messages = pathname.match(/^\/v1\/conversations\/([^/]+)\/messages$/);
      if (messages) {
        const conversationId = assertId(messages[1]);
        if (method === "GET") {
          const raw = new URL(req.url, "http://127.0.0.1").searchParams.get("afterSequence");
          if (raw !== null && !/^(0|[1-9]\d{0,14})$/.test(raw)) {
            throw new ApiError(422, "invalid_cursor", "Invalid message cursor");
          }
          return send(res, 200, await service.messages(subject, conversationId, Number(raw || 0)));
        }
        if (method === "POST") {
          const idempotencyKey = assertId(req.headers["idempotency-key"]);
          return send(res, 201, await service.sendMessage(subject, conversationId, assertMessage(await readBody(req)), idempotencyKey));
        }
      }
      const close = pathname.match(/^\/v1\/conversations\/([^/]+)\/close$/);
      if (close && method === "POST") {
        await service.closeConversation(subject, assertId(close[1]));
        return send(res, 204);
      }
      const vote = pathname.match(/^\/v1\/conversations\/([^/]+)\/connection-vote$/);
      if (vote && method === "PUT") {
        const conversationId = assertId(vote[1]);
        const input = await readBody(req);
        if (!["accept", "withdraw"].includes(input.decision)) throw new ApiError(422, "invalid_decision");
        return send(res, 200, await service.castVote(subject, conversationId, input.decision));
      }
      if (method === "GET" && pathname === "/v1/connections") {
        return send(res, 200, await service.connections(subject));
      }
      const block = pathname.match(/^\/v1\/blocks\/([^/]+)$/);
      if (block) {
        const targetId = assertId(block[1]);
        if (method === "PUT") { await service.block(subject, targetId); return send(res, 204); }
        if (method === "DELETE") { await service.unblock(subject, targetId); return send(res, 204); }
      }
      if (method === "POST" && pathname === "/v1/reports") {
        const input = await readBody(req);
        if (!assertId(input.reportedAccountId) || (input.conversationId && !assertId(input.conversationId)) ||
            !["harassment", "threat", "spam", "impersonation", "sexual_content", "other"].includes(input.category) ||
            (input.details !== undefined && (typeof input.details !== "string" || input.details.length > 2000))) {
          throw new ApiError(422, "invalid_report");
        }
        return send(res, 202, await service.report(subject, input));
      }
      throw new ApiError(404, "not_found", "Resource unavailable");
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      // Do not disclose internal stack, database errors, account existence or secrets.
      if (status >= 500 && typeof service.onError === "function") service.onError(error);
      if (res.headersSent) {
        // SSE headers cannot be rewritten as JSON if a stream fails mid-flight.
        if (!res.writableEnded) res.end();
      } else if (!res.writableEnded) {
        send(res, status, {error: error instanceof ApiError ? error.code : "internal_error"});
      }
    }
  };
}

import { createPublicKey, createVerify } from "node:crypto";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function strictJson(value) {
  try {
    const result = JSON.parse(value);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("object required");
    return result;
  } catch {
    throw new ApiError(401, "unauthorized", "Invalid session token");
  }
}

/** No algorithm negotiation: Bridge internal backend accepts RS256 only. */
export function verifyBearer(header, options) {
  if (!options?.publicKeyPem || !options.issuer || !options.audience) {
    throw new ApiError(503, "auth_unconfigured", "Authentication not configured");
  }
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Bearer token required");
  }
  const token = header.substring(7);
  if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new ApiError(401, "unauthorized", "Invalid session token");
  }
  const [protectedPart, payloadPart, signaturePart] = token.split(".");
  const h = strictJson(Buffer.from(protectedPart, "base64url").toString("utf8"));
  const claims = strictJson(Buffer.from(payloadPart, "base64url").toString("utf8"));
  if (h.alg !== "RS256" || (h.typ && h.typ !== "JWT") || h.crit !== undefined) {
    throw new ApiError(401, "unauthorized", "Unsupported token");
  }
  let verified = false;
  try {
    const key = createPublicKey(options.publicKeyPem);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error("RSA key too weak");
    }
    const verifier = createVerify("RSA-SHA256");
    verifier.update(protectedPart + "." + payloadPart, "ascii");
    verifier.end();
    verified = verifier.verify(key, Buffer.from(signaturePart, "base64url"));
  } catch {
    throw new ApiError(503, "auth_unconfigured", "Server authentication key invalid");
  }
  if (!verified) throw new ApiError(401, "unauthorized", "Invalid session signature");
  const now = Number.isFinite(options.nowSeconds) ? options.nowSeconds : Math.floor(Date.now() / 1000);
  if (claims.iss !== options.issuer ||
      !(claims.aud === options.audience || (Array.isArray(claims.aud) && claims.aud.includes(options.audience))) ||
      typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 256 ||
      !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
      !Number.isSafeInteger(claims.iat) || claims.iat > now + 60 ||
      (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
      claims.exp - claims.iat > 3600) {
    throw new ApiError(401, "unauthorized", "Expired or invalid session claims");
  }
  return { subject: claims.sub, expiresAt: claims.exp };
}

export function uuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function assertId(value) {
  if (!uuid(value)) throw new ApiError(422, "invalid_id", "Expected a UUID");
  return value;
}

export function assertMessage(body) {
  if (!body || typeof body !== "object" || !uuid(body.clientMessageId) ||
      typeof body.body !== "string" || body.body.trim().length < 1 || [...body.body].length > 4000) {
    throw new ApiError(422, "invalid_message", "Message or clientMessageId invalid");
  }
  return { clientMessageId: body.clientMessageId, body: body.body };
}

export function assertPreferences(body) {
  const allowedIntents = ["just_chat", "make_friends", "thoughtful_talk"];
  if (!body || !Array.isArray(body.languageCodes) || body.languageCodes.length < 1 ||
      body.languageCodes.length > 30 || !allowedIntents.includes(body.intention) ||
      !Array.isArray(body.interests) || body.interests.length > 16 ||
      body.interests.some(x => typeof x !== "string" || x.length > 48)) {
    throw new ApiError(422, "invalid_preferences", "Invalid preferences");
  }
  const languages = body.languageCodes.map(x => typeof x === "string" ? x.trim().toLowerCase() : "");
  if (languages.some(x => x.length < 2 || x.length > 35 || !/^[a-z0-9-]+$/.test(x)) ||
      new Set(languages).size !== languages.length ||
      (body.topic != null && (typeof body.topic !== "string" || body.topic.length > 80))) {
    throw new ApiError(422, "invalid_preferences", "Invalid languages or topic");
  }
  return { languageCodes: languages, intention: body.intention, interests: body.interests, topic: body.topic ?? null };
}

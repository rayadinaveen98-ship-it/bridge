import { createHash, createPrivateKey, createSign, randomBytes, scrypt as rawScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ApiError } from "./auth.mjs";

const scrypt = promisify(rawScrypt);
const HANDLE_RE = /^[a-z][a-z0-9_-]{2,30}$/;
const SALT_BYTES = 16;
const HASH_BYTES = 64;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const DUMMY_SALT = Buffer.from("BridgeTestOnlySalt", "utf8");

export function normalizeHandle(value) {
  if (typeof value !== "string") throw new ApiError(401,"invalid_credentials");
  const valueNormalized = value.trim().toLowerCase();
  if (!HANDLE_RE.test(valueNormalized)) throw new ApiError(401,"invalid_credentials");
  return valueNormalized;
}

export async function hashLabPassphrase(plaintext, salt = randomBytes(SALT_BYTES)) {
  if (typeof plaintext !== "string" || plaintext.length < 16 || plaintext.length > 256) {
    throw new TypeError("Lab passphrases must have 16–256 characters");
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_BYTES) {
    throw new TypeError("Invalid salt");
  }
  const derived = await scrypt(plaintext, salt, HASH_BYTES, SCRYPT);
  return { salt: salt.toString("hex"), hash: derived.toString("hex") };
}

/** Never logs the supplied passphrase. Constant work on unknown handles. */
export async function verifyLabPassphrase(plaintext, expected) {
  if (typeof plaintext !== "string" || plaintext.length > 256) return false;
  const candidate = plaintext || "_";
  const hasStoredHash = expected && typeof expected.salt === "string" &&
    typeof expected.hash === "string" &&
    /^[0-9a-f]{32}$/i.test(expected.salt) &&
    /^[0-9a-f]{128}$/i.test(expected.hash);
  const salt = hasStoredHash ? Buffer.from(expected.salt,"hex") : DUMMY_SALT;
  const hash = await scrypt(candidate, salt, HASH_BYTES, SCRYPT);
  const stored = hasStoredHash ? Buffer.from(expected.hash,"hex") : Buffer.alloc(HASH_BYTES);
  return hasStoredHash && timingSafeEqual(hash,stored);
}

export function signLabJwt(subject, signing) {
  if (typeof subject !== "string" || !subject || subject.length > 256 ||
      !signing?.privateKeyPem || !signing.issuer || !signing.audience) {
    throw new Error("Lab signer not configured");
  }
  const privateKey = createPrivateKey(signing.privateKeyPem);
  if (privateKey.asymmetricKeyType !== "rsa" ||
      (privateKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) {
    throw new Error("Lab RSA signer requires 2048+ bit key");
  }
  const now = Math.floor(Date.now()/1000);
  const encode = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const data = [
    encode({alg:"RS256",typ:"JWT"}),
    encode({sub:subject,iss:signing.issuer,aud:signing.audience,iat:now,exp:now+1800})
  ].join(".");
  const signer=createSign("RSA-SHA256");
  signer.update(data,"ascii");
  signer.end();
  return {token:data+"."+signer.sign(privateKey).toString("base64url"),expiresIn:1800};
}

/** Lab-only fixed-window in-memory throttle: scoped to local API process. */
export function createLabLoginLimiter(now = () => Date.now()) {
  const attempts=new Map();
  return function check(handle,ip) {
    const normalized=typeof handle==="string" ? handle.trim().toLowerCase().slice(0,35):"_invalid_";
    const key = createHash("sha256").update(String(ip)+"\0"+normalized).digest("hex");
    const t=now(), value=attempts.get(key);
    const current=!value||value.expiresAt<t ? {count:0,expiresAt:t+15*60*1000}:value;
    current.count++;
    attempts.set(key,current);
    if (attempts.size>5000) {
      for(const [id,state] of attempts) if(state.expiresAt<t)attempts.delete(id);
      if(attempts.size>5000)attempts.clear();
    }
    if(current.count>5) throw new ApiError(429,"too_many_login_attempts");
  };
}

/**
 * Login is only enabled explicitly in loopback laboratory mode.
 * The untrusted client can never create accounts, choose subjects, or mark age.
 */
export function createLabLogin(pool, signing, {enabled=false} = {}) {
  const throttle=createLabLoginLimiter();
  return {
    enabled,
    async login({handle,passphrase},remoteAddress) {
      if(!enabled)throw new ApiError(404,"not_found");
      const name=normalizeHandle(handle);
      throttle(name,remoteAddress);
      if(typeof passphrase!=="string" || passphrase.length > 256) {
        throw new ApiError(401,"invalid_credentials");
      }
      const rows=await pool.query(
        "SELECT a.auth_subject,a.status,a.age_verified_at,a.safety_eligible," +
        "cred.salt,cred.passphrase_hash FROM bridge_lab_credentials cred " +
        "JOIN bridge_accounts a ON a.id=cred.account_id WHERE cred.handle=$1",
        [name]);
      const found=rows.rows[0];
      const valid=await verifyLabPassphrase(passphrase,
        found ? {salt:found.salt,hash:found.passphrase_hash}:null);
      if(!valid || found.status!=="active" || !found.age_verified_at ||
         found.safety_eligible!==true)throw new ApiError(401,"invalid_credentials");
      return signLabJwt(found.auth_subject,signing);
    }
  };
}

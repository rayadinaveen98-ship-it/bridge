/**
 * Opt-in, two-account cloud QA only. This is not public stranger chat.
 * Secrets stay in the deployment environment; never return them in API responses.
 */
import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { hashLabPassphrase, createLabLogin } from "./lab_auth.mjs";
import { verifyBearer } from "./auth.mjs";

const QA_HANDLES = Object.freeze([
  ["tester_a", "Stardust", "BRIDGE_QA_TESTER_A_PASSPHRASE"],
  ["tester_b", "Moonlight", "BRIDGE_QA_TESTER_B_PASSPHRASE"]
]);

export function readCloudQaConfig(env) {
  if (env.BRIDGE_DEPLOYMENT_MODE !== "cloud_qa") return null;
  if (env.BRIDGE_ALLOW_LAB_LOGIN !== "1") {
    throw new Error("Cloud QA requires explicit synthetic-account login opt-in.");
  }
  const connection = env.BRIDGE_DATABASE_URL;
  let url;
  try { url = new URL(connection); }
  catch { throw new Error("Cloud QA database URL is missing or invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      !["require", "verify-full"].includes(url.searchParams.get("sslmode"))) {
    throw new Error("Cloud QA requires a dedicated TLS-enabled Neon PostgreSQL URL.");
  }
  if (env.BRIDGE_BIND_HOST && env.BRIDGE_BIND_HOST !== "0.0.0.0") {
    throw new Error("Cloud QA must bind on 0.0.0.0 behind the hosting TLS proxy.");
  }
  const a = env.BRIDGE_QA_TESTER_A_PASSPHRASE;
  const b = env.BRIDGE_QA_TESTER_B_PASSPHRASE;
  if (typeof a !== "string" || typeof b !== "string" ||
      a.length < 32 || b.length < 32 || a.length > 256 || b.length > 256 ||
      a === b || /^(?:replace|example|password)/i.test(a) ||
      /^(?:replace|example|password)/i.test(b)) {
    throw new Error("Provide two distinct, strong 32+ character synthetic QA passphrases.");
  }
  const encodedKey = env.BRIDGE_QA_PRIVATE_KEY_B64;
  if (!encodedKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)) {
    throw new Error("Cloud QA requires a valid base64 RSA private key.");
  }
  let privateKey, publicKeyPem;
  try {
    privateKey = createPrivateKey(Buffer.from(encodedKey, "base64"));
    if (privateKey.asymmetricKeyType !== "rsa" ||
        (privateKey.asymmetricKeyDetails?.modulusLength || 0) < 3072) {
      throw new Error("QA RSA signing key must be at least 3072 bits.");
    }
    publicKeyPem = createPublicKey(privateKey).export({type:"spki",format:"pem"}).toString();
  } catch {
    throw new Error("Cloud QA signing key is invalid or too weak.");
  }
  return {
    databaseUrl: connection,
    signing: {
      privateKeyPem: privateKey.export({type:"pkcs8",format:"pem"}).toString(),
      publicKeyPem,
      issuer: "bridge-private-cloud-qa",
      audience: "bridge-api"
    },
    passphrases: { tester_a:a, tester_b:b }
  };
}

/** Add only missing synthetic fixtures; never silently rotate existing credentials. */
export async function provisionCloudQaAccounts(pool, passphrases) {
  for (const [handle, nickname] of QA_HANDLES) {
    const exists = await pool.query(
      "SELECT account_id FROM bridge_lab_credentials WHERE handle=$1", [handle]);
    if (exists.rows.length > 0) continue;
    const secret = await hashLabPassphrase(passphrases[handle]);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      // A single DB transaction prevents orphaned credentials on a failed boot.
      const id = randomUUID(), subject = "bridge-cloud-qa:" + id;
      await db.query(
        "INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) " +
        "VALUES($1,$2,'active',now(),true)", [id,subject]);
      await db.query(
        "INSERT INTO bridge_profiles(account_id,pseudonym,avatar_key) VALUES($1,$2,'moon')",
        [id,nickname]);
      await db.query(
        "INSERT INTO bridge_lab_credentials(account_id,handle,salt,passphrase_hash) " +
        "VALUES($1,$2,$3,$4)", [id,handle,secret.salt,secret.hash]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally { db.release(); }
  }
  // Test-only catalog fixture, not a claim of operational moderation.
  await pool.query(
    "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) " +
    "VALUES('en','English',true) ON CONFLICT(code) DO NOTHING");
}

/**
 * Founder QA startup gate: test the same login path used by Android.
 * Never logs credentials, token values or account identities.
 * Fails closed when Render's secrets no longer match existing Neon credentials.
 */
export async function verifyCloudQaCredentials(pool, passphrases, signing) {
  const temporaryLogin = createLabLogin(pool, signing, {enabled:true});
  for (const [handle] of QA_HANDLES) {
    try {
      const issued = await temporaryLogin.login({
        handle,
        passphrase:passphrases[handle]
      }, "cloud-qa-boot-check");
      const claims = verifyBearer("Bearer " + issued.token, {
        publicKeyPem:signing.publicKeyPem,
        issuer:signing.issuer,
        audience:signing.audience
      });
      if (!claims.subject.startsWith("bridge-cloud-qa:")) {
        throw new Error("Not a cloud QA identity");
      }
    } catch {
      throw new Error(
        "Bridge Cloud QA login self-check failed. " +
        "Render credentials may differ from the existing database. " +
        "Reconcile test secrets explicitly; never auto-reset credentials."
      );
    }
  }
}

/**
 * Synthetic test fixture provisioner, never production signup.
 * No hardcoded secrets. Credentials printed once only to local terminal.
 * BRIDGE_DATABASE_URL MUST point at a LOCAL database named bridge_lab or bridge_test.
 */
import { randomUUID, randomBytes, generateKeyPairSync } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { hashLabPassphrase } from "../src/lab_auth.mjs";

const dbUrl=process.env.BRIDGE_DATABASE_URL;
if(!dbUrl)throw new Error("BRIDGE_DATABASE_URL is required");
const target=new URL(dbUrl);
if(!["127.0.0.1","localhost","::1"].includes(target.hostname) ||
   !["/bridge_lab","/bridge_test"].includes(target.pathname)) {
  throw new Error("Refusing synthetic account provisioning outside local bridge_lab/bridge_test");
}
const {Pool}=await import("pg");
const pool=new Pool({connectionString:dbUrl,max:2});
const keyDir=resolve(process.env.BRIDGE_LAB_KEY_DIR || "./.bridge-private-lab");
try {
  await pool.query("SELECT 1 FROM bridge_lab_credentials LIMIT 1");
  mkdirSync(keyDir,{recursive:true,mode:0o700});
  const privatePath=resolve(keyDir,"lab-private.pem");
  const publicPath=resolve(keyDir,"lab-public.pem");
  if(existsSync(privatePath)!==existsSync(publicPath))throw Error("Incomplete keypair; inspect private directory before retry");
  if(!existsSync(privatePath)){
    const keys=generateKeyPairSync("rsa",{modulusLength:3072});
    writeFileSync(privatePath,keys.privateKey.export({type:"pkcs8",format:"pem"}),{mode:0o600,flag:"wx"});
    writeFileSync(publicPath,keys.publicKey.export({type:"spki",format:"pem"}),{mode:0o600,flag:"wx"});
  }
  chmodSync(privatePath,0o600);
  chmodSync(publicPath,0o600);
  console.log("Lab RSA keys:",privatePath,publicPath);
  console.log("Configure BRIDGE_AUTH_ISSUER=bridge-internal-lab and BRIDGE_AUTH_AUDIENCE=bridge-api");
  for(const [handle,nickname] of [["tester_a","Stardust"],["tester_b","Moonlight"]]){
    const present=await pool.query("SELECT 1 FROM bridge_lab_credentials WHERE handle=$1",[handle]);
    if(present.rows.length){
      console.log(handle, "already exists; passphrase is not reprinted. Never silently reset credentials.");
      continue;
    }
    const passphrase=randomBytes(24).toString("base64url");
    const secret=await hashLabPassphrase(passphrase);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const id=randomUUID(), subject="bridge-lab:"+id;
      // Marked eligible ONLY in this isolated synthetic lab. Not real age assurance.
      await client.query("INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) VALUES($1,$2,'active',now(),true)",[id,subject]);
      await client.query("INSERT INTO bridge_profiles(account_id,pseudonym,avatar_key) VALUES($1,$2,'moon')",[id,nickname]);
      await client.query("INSERT INTO bridge_lab_credentials(account_id,handle,salt,passphrase_hash) VALUES($1,$2,$3,$4)",[id,handle,secret.salt,secret.hash]);
      await client.query("COMMIT");
      console.log("Internal account:",handle," One-time passphrase:",passphrase);
    }catch(err){await client.query("ROLLBACK");throw err;}
    finally{client.release();}
  }
  // Moderated-language marker is lab fixture ONLY, not staffed policy coverage.
  await pool.query("INSERT INTO bridge_supported_languages(code,display_name,moderation_ready) VALUES('en','English',true) ON CONFLICT(code) DO UPDATE SET moderation_ready=true");
  console.log("TEST LAB ONLY: English is a synthetic test fixture, not operational moderation coverage.");
} finally {await pool.end();}

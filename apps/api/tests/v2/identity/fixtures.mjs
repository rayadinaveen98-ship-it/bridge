/**
 * B3b-1 synthetic-only RSA/JWT and disposable PostgreSQL fixtures.
 * Generates ephemeral keys in memory. NO Render/Neon credentials or QA IDs.
 */
import {createSign,generateKeyPairSync,randomUUID,createHash} from "node:crypto";
import {createDisposableSubjectAdapter} from "../../../src/v2/private_subject_adapter.mjs";

export const uuid=()=>randomUUID();
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const issuer="b3b-synthetic-disposable-only";
export const audience="bridge-api-b3b-test";
const ACK="disposable-bridge_test-only";
export const blocked=e=>e?.code==="resource_unavailable"&&
  e?.message==="resource_unavailable";

export function syntheticSigning(){
  const {privateKey,publicKey}=generateKeyPairSync("rsa",{
    modulusLength:3072,publicExponent:0x10001
  });
  const publicKeyPem=publicKey.export({type:"spki",format:"pem"}).toString();
  return Object.freeze({
    privateKey,authentication:Object.freeze({publicKeyPem,issuer,audience})
  });
}
export function subject(id){return "b3b-disposable:"+id;}
export function signedToken(keys,{
  sub=subject(uuid()),
  header={},claims={},rawPayload=null,
  signer=keys.privateKey
}={}){
  const now=Math.floor(Date.now()/1000);
  const h={alg:"RS256",typ:"JWT",...header};
  const payload=rawPayload??{
    iss:issuer,aud:audience,sub,iat:now-2,nbf:now-2,exp:now+1500,
    ...claims
  };
  const hdr=Buffer.from(JSON.stringify(h)).toString("base64url");
  const p=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data=hdr+"."+p;
  const sign=createSign("RSA-SHA256");
  sign.update(data,"ascii");
  sign.end();
  const sig=sign.sign(signer).toString("base64url");
  return "Bearer "+data+"."+sig;
}
export function disposableUrl(){
  const raw=process.env.BRIDGE_TEST_DATABASE_URL;
  let u;
  try{u=new URL(raw);}catch{throw Error("B3b disposable DSN required");}
  if(process.env.BRIDGE_TEST_MIGRATION_ACK!==ACK||
    !["postgres:","postgresql:"].includes(u.protocol)||
    !["127.0.0.1","localhost"].includes(u.hostname)||
    u.pathname!=="/bridge_test"||u.username!=="bridge_test"||
    !u.password||!["","5432"].includes(u.port)||u.search||u.hash)
      throw Error("B3b only permits acknowledged local bridge_test");
  return raw;
}
export function adapter(pool,keys){
  return createDisposableSubjectAdapter(pool,{
    authentication:keys.authentication
  });
}
export async function syntheticAccount(pool,{
  status="active",age=true,eligible=true,deleted=false
}={}){
  const id=uuid(),authSubject=subject(id);
  await pool.query(
    "INSERT INTO bridge_accounts"+
    "(id,auth_subject,status,age_verified_at,safety_eligible,deleted_at) "+
    "VALUES($1,$2,$3,$4,$5,$6)",
    [id,authSubject,status,age?new Date():null,eligible,
      deleted?new Date():null]
  );
  return Object.freeze({id,subject:authSubject});
}
export async function fixtureSnapshot(pool,legacy){
  // Mirrors the four-message synthetic fixture, not hosted QA data.
  const rows=await pool.query(
    "SELECT m.id,m.sequence_number,m.sender_id,m.body "+
    "FROM bridge_messages m WHERE m.conversation_id=$1 "+
    "ORDER BY m.sequence_number",
    [legacy.room]
  );
  return createHash("sha256").update(JSON.stringify(rows.rows)).digest("hex");
}
export async function counts(pool){
  const rows=(await pool.query(
    "SELECT (SELECT count(*)::int FROM bridge_v2_secure_messages) AS secure,"+
    "(SELECT count(*)::int FROM bridge_event_outbox) AS outbox"
  )).rows[0];
  return Object.freeze({...rows});
}

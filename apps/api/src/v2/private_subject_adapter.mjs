/**
 * Bridge B3b-1 — DISCONNECTED synthetic signed subject -> actor resolver.
 *
 * Only for acknowledged loopback PostgreSQL 16 "bridge_test". No hosted HTTP,
 * no B2a/B2b operation dispatch, no production keys or public identity claims.
 * The callback is chosen by internal synthetic test code, NEVER by an HTTP
 * request. Returning its result is not a grant of access to any V2 message.
 */
import {verifyBearer} from "../auth.mjs";
import {withV2ConnectionTx} from "../sessions/direct_repository.mjs";

const ACK="disposable-bridge_test-only";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class SubjectBoundaryDenied extends Error {
  constructor(){
    super("resource_unavailable");
    this.name="SubjectBoundaryDenied";
    this.code="resource_unavailable";
  }
}
const deny=()=>{throw new SubjectBoundaryDenied();};

function requireSyntheticPool(pool) {
  if(process.env.BRIDGE_TEST_MIGRATION_ACK!==ACK)deny();
  const dsn=process.env.BRIDGE_TEST_DATABASE_URL;
  let u;
  try{u=new URL(dsn);}catch{deny();}
  if(!["postgres:","postgresql:"].includes(u.protocol)||
    !["127.0.0.1","localhost"].includes(u.hostname)||
    u.pathname!=="/bridge_test"||u.username!=="bridge_test"||
    !u.password||!["","5432"].includes(u.port)||u.search||u.hash||
    pool?.options?.connectionString!==dsn||
    typeof pool?.connect!=="function")deny();
}
function requireAuthentication(authentication) {
  if(!authentication||typeof authentication!=="object"||
     Array.isArray(authentication)||
     typeof authentication.publicKeyPem!=="string"||
     !authentication.publicKeyPem.trim()||
     typeof authentication.issuer!=="string"||
     !authentication.issuer||authentication.issuer.length>256||
     typeof authentication.audience!=="string"||
     !authentication.audience||authentication.audience.length>256)deny();
  // "nowSeconds" supplied by a caller/config is deliberately discarded.
  return Object.freeze({
    publicKeyPem:authentication.publicKeyPem,
    issuer:authentication.issuer,
    audience:authentication.audience
  });
}
function verifiedBearer(authorization,authentication,nowSeconds=undefined){
  try{
    // This calls Bridge's existing strict RS256 verification function.
    return verifyBearer(authorization,nowSeconds===undefined?
      authentication:{...authentication,nowSeconds});
  }catch{deny();}
}
async function assertActualDisposable(c){
  const actual=(await c.query(
    "SELECT current_database() AS db,current_user AS usr,inet_server_addr() AS host"
  )).rows;
  if(actual.length!==1||actual[0].db!=="bridge_test"||
     actual[0].usr!=="bridge_test"||actual[0].host===null)deny();
  const receipt=(await c.query(
    "SELECT version FROM bridge_schema_migrations WHERE version='0008'"
  )).rows;
  if(receipt.length!==1)deny();
}
function cleanRequest(request) {
  if(!request||typeof request!=="object"||Array.isArray(request)||
    Object.keys(request).length!==2||
    !Object.hasOwn(request,"authorization")||
    !Object.hasOwn(request,"work")||
    typeof request.work!=="function")deny();
  return request;
}
export function createDisposableSubjectAdapter(pool,{authentication}={}){
  requireSyntheticPool(pool);
  const auth=requireAuthentication(authentication);
  return Object.freeze({
    async withVerifiedActor(request) {
      requireSyntheticPool(pool);
      const {authorization,work}=cleanRequest(request);
      // No unverified subject, user/body actor, or token claim enters SQL.
      const admitted=verifiedBearer(authorization,auth);
      try{
        return await withV2ConnectionTx(pool,async c=>{
          // withV2ConnectionTx acquires advisory mutex 714411 before this code.
          await assertActualDisposable(c);
          const result=await c.query(
            "SELECT id,auth_subject,status,age_verified_at,safety_eligible,"+
            "deleted_at FROM bridge_accounts WHERE auth_subject=$1 FOR UPDATE",
            [admitted.subject]
          );
          if(result.rows.length!==1)deny();
          const a=result.rows[0];
          if(!UUID.test(a.id)||a.auth_subject!==admitted.subject||
             a.status!=="active"||a.age_verified_at==null||
             a.safety_eligible!==true||a.deleted_at!==null)deny();
          // Sample actual DB wall-clock AFTER acquiring advisory + account
          // row locks, and RECHECK token expiration/claims before callback.
          const times=(await c.query(
            "SELECT clock_timestamp() AS instant"
          )).rows;
          if(times.length!==1||!(times[0].instant instanceof Date)||
             !Number.isFinite(times[0].instant.getTime()))deny();
          const nowSeconds=Math.floor(times[0].instant.getTime()/1000);
          const afterWait=verifiedBearer(authorization,auth,nowSeconds);
          if(afterWait.subject!==a.auth_subject||
             afterWait.expiresAt!==admitted.expiresAt)deny();
          const trusted=Object.freeze({actorId:a.id});
          // Callback is an internal synthetic test operation only. It runs
          // BEFORE COMMIT, on SAME client, with row lock held.
          return await work(c,trusted);
        });
      }catch{
        // Uniform deny: no subject/account/SQL/JWT/error details escape.
        deny();
      }
    }
  });
}

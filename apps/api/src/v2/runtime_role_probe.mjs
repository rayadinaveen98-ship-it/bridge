// B3c-2: opt-in one-session READ-ONLY metadata probe; never a V2 release approval.
export const RUNTIME_ROLE_AUDIT_FLAG="BRIDGE_INTERNAL_RUNTIME_ROLE_AUDIT_ONCE";
export function runtimeRoleAuditEnabled(env,cloudQa) {
  return cloudQa===true && env?.[RUNTIME_ROLE_AUDIT_FLAG]==="1";
}

// No user tables are read. No database names, role names, credentials or user rows are returned.
export const ROLE_AUDIT_SQL=[
  "SELECT current_user=session_user AS same_principal,",
  "r.rolsuper AS is_superuser, r.rolbypassrls AS bypasses_rls,",
  "r.rolcreaterole AS can_create_role, r.rolcreatedb AS can_create_database,",
  "(SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "WHERE n.nspname='public' AND c.relkind='r' AND left(c.relname,7)='bridge_') AS bridge_table_count,",
  "(SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "WHERE n.nspname='public' AND c.relkind='r' AND left(c.relname,7)='bridge_' AND c.relowner=r.oid) AS owned_bridge_tables,",
  "(SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "WHERE n.nspname='public' AND c.relkind='r' AND left(c.relname,7)='bridge_' AND c.relrowsecurity) AS rls_enabled_tables,",
  "(SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace",
  "WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN",
  "('bridge_v2_secure_messages','bridge_v2_secure_live','bridge_v2_secure_unread')) AS v2_secure_table_count",
  "FROM pg_catalog.pg_roles r WHERE r.rolname=current_user"
].join(" ");
const UNVERIFIED=Object.freeze({status:"UNVERIFIED",sampled_connection:false});
const count=x=>Number.isInteger(x)&&x>=0&&x<=100000?x:null;

export function classifyRuntimeRole(rows) {
  if(!Array.isArray(rows)||rows.length!==1) return UNVERIFIED;
  const x=rows[0],fields=["same_principal","is_superuser","bypasses_rls","can_create_role","can_create_database"];
  if(!x||fields.some(k=>typeof x[k]!=="boolean"))return UNVERIFIED;
  const nums=["bridge_table_count","owned_bridge_tables","rls_enabled_tables","v2_secure_table_count"]
    .map(k=>count(x[k]));
  if(nums.some(n=>n===null))return UNVERIFIED;
  const [tables,owned,rls,secure]=nums;
  if(owned>tables||rls>tables||secure>3||secure>tables)return UNVERIFIED;
  const privileged=x.is_superuser||x.bypasses_rls||x.can_create_role||
    x.can_create_database||owned>0||!x.same_principal;
  return Object.freeze({
    status:privileged||tables===0||rls!==tables?"HOLD_V2":"ROLE_REVIEW_ONLY",
    sampled_connection:true,privileged_db_role:Boolean(privileged),
    same_principal:x.same_principal,is_superuser:x.is_superuser,
    bypasses_rls:x.bypasses_rls,can_create_role:x.can_create_role,
    can_create_database:x.can_create_database,owns_bridge_table:owned>0,
    bridge_tables_rls_enabled:tables>0&&rls===tables,v2_schema_present:secure===3
  });
}

export async function probeRuntimeRole(pool) {
  let client,summary=UNVERIFIED;
  try {
    client=await pool.connect(); // Actual runtime pool, not an independent owner-tool login.
    await client.query("BEGIN TRANSACTION READ ONLY");
    const result=await client.query(ROLE_AUDIT_SQL);
    summary=classifyRuntimeRole(result?.rows);
  } catch {
    summary=UNVERIFIED; // Never log driver exception: may include connection metadata.
  } finally {
    if(client) {
      try {await client.query("ROLLBACK");} catch {summary=UNVERIFIED;}
      try {client.release();} catch {summary=UNVERIFIED;}
    }
  }
  return summary;
}

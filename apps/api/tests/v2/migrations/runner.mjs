/**
 * DISPOSABLE PostgreSQL V2 expand runner — NEVER invoke on Neon/Render.
 * Guard must succeed before opening any connection. Only bridge_test via
 * loopback and the explicit operator/test acknowledgment is supported.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath,pathToFileURL} from "node:url";
import pg from "pg";

const ROOT=new URL("../../../../../",import.meta.url);
const MIGRATIONS=Object.freeze([
  "0004_v2_metadata.sql",
  "0005_v2_delivery.sql",
  "0006_v2_history.sql",
  "0007_v2_evidence_retention.sql"
]);
export const V2_FILES=MIGRATIONS;
const ACK="disposable-bridge_test-only";

export function assertDisposableConnection(connectionString,ack) {
  if(typeof connectionString!=="string" || ack!==ACK)
    throw new Error("Refusing V2 migration: explicit disposable database acknowledgment required");
  let url;
  try {url=new URL(connectionString);} catch {
    throw new Error("Refusing V2 migration: invalid database URL");
  }
  if(!["postgres:","postgresql:"].includes(url.protocol) ||
     !["127.0.0.1","localhost"].includes(url.hostname) ||
     url.pathname!=="/bridge_test" || url.username!=="bridge_test" ||
     !["","5432"].includes(url.port) || url.search!=="" || url.hash!=="" ||
     !url.password)
    throw new Error("Refusing V2 migration: only loopback bridge_test user/database is allowed");
  return true;
}

export function digestSql(contents) {
  return createHash("sha256").update(contents,"utf8").digest("hex");
}
export function verifyRecordedHash(version,recorded,actual) {
  if(recorded!==actual)
    throw new Error("V2 migration checksum mismatch: "+version);
  return true;
}

export async function applyV2Migrations({
  databaseUrl=process.env.BRIDGE_TEST_DATABASE_URL,
  acknowledgment=process.env.BRIDGE_TEST_MIGRATION_ACK,
  failBeforeLedgerVersion=null
}={}) {
  assertDisposableConnection(databaseUrl,acknowledgment);
  if(failBeforeLedgerVersion!==null && !MIGRATIONS.some(x=>x.slice(0,4)===failBeforeLedgerVersion))
    throw new Error("Invalid disposable-only failure injection version");

  const {Client}=pg;
  const client=new Client({connectionString:databaseUrl,application_name:"bridge_v2_disposable_migration"});
  await client.connect();
  const report=[];
  try {
    const connection=await client.query("SELECT current_database() AS db,current_user AS usr,inet_server_addr() AS addr");
    if(connection.rows[0]?.db!=="bridge_test" ||
       connection.rows[0]?.usr!=="bridge_test")
      throw new Error("Refusing V2 migration: unexpected runtime DB identity");

    for(const file of MIGRATIONS) {
      const sql=await readFile(new URL("database/migrations/"+file,ROOT),"utf8");
      const version=file.slice(0,4);
      const checksum=digestSql(sql);
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["bridge-v2-disposable-migrations"]);
        const found=await client.query("SELECT to_regclass('public.bridge_schema_migrations') AS ledger");
        if(found.rows[0]?.ledger) {
          const prior=await client.query(
            "SELECT checksum FROM bridge_schema_migrations WHERE version=$1",
            [version]);
          if(prior.rows.length) {
            verifyRecordedHash(version,prior.rows[0].checksum.trim(),checksum);
            await client.query("COMMIT");
            report.push({version,status:"already_applied",checksum});
            continue;
          }
        } else if(version!=="0004") {
          throw new Error("Missing migration ledger before "+version);
        }
        // Entire SQL and migration receipt share one transaction.
        await client.query(sql);
        if(failBeforeLedgerVersion===version)
          throw new Error("Injected disposable migration failure before receipt: "+version);
        await client.query(
          "INSERT INTO bridge_schema_migrations(version,checksum,runner_id) VALUES($1,$2,$3)",
          [version,checksum,"bridge_v2_disposable_test"]);
        await client.query("COMMIT");
        report.push({version,status:"applied",checksum});
      } catch(error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return report;
  } finally {
    await client.end();
  }
}

if(process.argv[1] && pathToFileURL(fileURLToPath(import.meta.url)).href===
   pathToFileURL(process.argv[1]).href) {
  applyV2Migrations()
    .then(records=>{
      for(const item of records)console.log("V2 disposable migration",item.version,item.status,item.checksum);
    })
    .catch(error=>{
      console.error("V2 disposable migration failed:",error.message);
      process.exitCode=1;
    });
}

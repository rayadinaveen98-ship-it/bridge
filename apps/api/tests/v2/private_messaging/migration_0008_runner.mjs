/**
 * Bridge B1a new-0008-only migrator. Disposable bridge_test + loopback only.
 * Do not add 0008 to the previously certified V2-03 runner: its four-ledger,
 * 34-table pre-0008 backup/restore rehearsal must remain unchanged.
 */
import {readFile} from "node:fs/promises";
import {Client} from "pg";
import {assertDisposableConnection,digestSql}
  from "../migrations/runner.mjs";

const SQL_URL=new URL("../../../../../database/migrations/0008_v2_secure_messaging.sql",import.meta.url);
const ACK="disposable-bridge_test-only";
const VERSION="0008";
export async function applyDisposable0008({
  databaseUrl=process.env.BRIDGE_TEST_DATABASE_URL,
  acknowledgment=process.env.BRIDGE_TEST_MIGRATION_ACK,
  failBeforeReceipt=false
}={}) {
  // Guard before making ANY database connection, including on retries.
  assertDisposableConnection(databaseUrl,acknowledgment);
  if(failBeforeReceipt!==false&&failBeforeReceipt!==true)
    throw new TypeError("Invalid B1a test-only failure injection");
  const source=await readFile(SQL_URL,"utf8");
  const checksum=digestSql(source);
  const client=new Client({
    connectionString:databaseUrl,application_name:"bridge_b1a_disposable_0008"
  });
  await client.connect();
  try {
    // Verify the actual connection identity, not only the supplied DSN.
    const me=(await client.query(
      "SELECT current_database() AS db,current_user AS usr,inet_server_addr() AS host"
    )).rows[0];
    if(me?.db!=="bridge_test"||me?.usr!=="bridge_test"||me?.host===null)
      throw Error("Refusing B1a: unexpected actual disposable database identity");
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
        ["bridge-v2-disposable-migrations"]);
      const prior=(await client.query(
        "SELECT version,trim(checksum) AS checksum FROM bridge_schema_migrations "+
        "WHERE version IN ('0004','0005','0006','0007','0008') ORDER BY version FOR UPDATE"
      )).rows;
      if(prior.length<4||["0004","0005","0006","0007"].some((v,i)=>prior[i]?.version!==v))
        throw Error("Refusing B1a: complete approved 0004-0007 ledger required");
      const existing=prior.find(x=>x.version===VERSION);
      if(existing) {
        if(existing.checksum!==checksum)
          throw Error("B1a 0008 checksum mismatch");
        await client.query("COMMIT");
        return {version:VERSION,status:"already_applied",checksum};
      }
      if(prior.length!==4)
        throw Error("Refusing B1a: unexpected disposable migration ledger");
      await client.query(source);
      if(failBeforeReceipt)
        throw Error("Injected B1a disposable failure before ledger receipt");
      await client.query(
        "INSERT INTO bridge_schema_migrations(version,checksum,runner_id) "+
        "VALUES($1,$2,$3)",
        [VERSION,checksum,"bridge_v2_b1a_disposable_only"]
      );
      await client.query("COMMIT");
      return {version:VERSION,status:"applied",checksum};
    }catch(e){
      try{await client.query("ROLLBACK");}catch{/* Preserve original failure. */}
      throw e;
    }
  }finally {
    await client.end();
  }
}

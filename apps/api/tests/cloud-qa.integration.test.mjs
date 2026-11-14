import test from "node:test";
import assert from "node:assert/strict";
import { provisionCloudQaAccounts } from "../src/cloud_qa.mjs";
import { verifyLabPassphrase } from "../src/lab_auth.mjs";

test("real PostgreSQL: cloud QA seeds exactly two synthetic accounts idempotently",{
  skip:!process.env.BRIDGE_TEST_DATABASE_URL
},async()=>{
  const parsed=new URL(process.env.BRIDGE_TEST_DATABASE_URL);
  if(parsed.pathname!=="/bridge_test" ||
      !["127.0.0.1","localhost","::1"].includes(parsed.hostname)) {
    throw Error("Refusing cloud QA fixture test outside local bridge_test DB");
  }
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString:process.env.BRIDGE_TEST_DATABASE_URL,max:2});
  const secrets={
    tester_a:"synthetic-qa-test-a-2026-".repeat(2),
    tester_b:"synthetic-qa-test-b-2026-".repeat(2)
  };
  try {
    await provisionCloudQaAccounts(pool,secrets);
    const first=await pool.query(
      "SELECT cred.handle,cred.salt,cred.passphrase_hash,p.pseudonym,"+
      "a.auth_subject,a.status,a.safety_eligible "+
      "FROM bridge_lab_credentials cred "+
      "JOIN bridge_accounts a ON a.id=cred.account_id "+
      "JOIN bridge_profiles p ON p.account_id=a.id "+
      "WHERE cred.handle IN ('tester_a','tester_b') ORDER BY cred.handle");
    assert.equal(first.rows.length,2);
    assert.deepEqual(first.rows.map(x=>x.handle),["tester_a","tester_b"]);
    assert.deepEqual(first.rows.map(x=>x.pseudonym),["Stardust","Moonlight"]);
    for(const row of first.rows){
      assert.equal(row.status,"active");
      assert.equal(row.safety_eligible,true);
      assert.ok(row.auth_subject.startsWith("bridge-cloud-qa:"));
      assert.equal(await verifyLabPassphrase(secrets[row.handle],{
        salt:row.salt,hash:row.passphrase_hash
      }),true);
      assert.notEqual(row.passphrase_hash,secrets[row.handle]);
    }
    await provisionCloudQaAccounts(pool,secrets);
    const second=await pool.query(
      "SELECT a.auth_subject,cred.handle FROM bridge_lab_credentials cred "+
      "JOIN bridge_accounts a ON a.id=cred.account_id "+
      "WHERE cred.handle IN ('tester_a','tester_b') ORDER BY cred.handle");
    assert.deepEqual(second.rows.map(x=>x.auth_subject),
      first.rows.map(x=>x.auth_subject));
  } finally { await pool.end(); }
});

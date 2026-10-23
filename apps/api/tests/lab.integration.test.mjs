import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync } from "node:crypto";
import { createLabLogin, hashLabPassphrase } from "../src/lab_auth.mjs";
import { verifyBearer } from "../src/auth.mjs";

test("real PostgreSQL: provisioned synthetic account can sign in but suspended account cannot",{
  skip:!process.env.BRIDGE_TEST_DATABASE_URL
},async()=>{
  const parsed=new URL(process.env.BRIDGE_TEST_DATABASE_URL);
  if(parsed.pathname!=="/bridge_test" ||
     !["127.0.0.1","localhost","::1"].includes(parsed.hostname)) {
    throw Error("Refusing lab auth test against non-loopback bridge_test database");
  }
  const {Pool}=await import("pg");
  const pool=new Pool({connectionString:process.env.BRIDGE_TEST_DATABASE_URL,max:2});
  const id=randomUUID(),subject="bridge-lab:"+id,handle="qa_"+id.replaceAll("-","").slice(0,16);
  const phrase="bridge-only-internal-test-passphrase-"+id;
  const salt=await hashLabPassphrase(phrase);
  const keyPair=generateKeyPairSync("rsa",{modulusLength:2048});
  const signer={privateKeyPem:keyPair.privateKey.export({type:"pkcs8",format:"pem"}),
    issuer:"bridge-lab-ci",audience:"bridge-api"};
  const verifier={publicKeyPem:keyPair.publicKey.export({type:"spki",format:"pem"}),
    issuer:signer.issuer,audience:signer.audience};
  try{
    await pool.query(
      "INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible) " +
      "VALUES($1,$2,'active',now(),true)",[id,subject]);
    await pool.query(
      "INSERT INTO bridge_lab_credentials(account_id,handle,salt,passphrase_hash) " +
      "VALUES($1,$2,$3,$4)",[id,handle,salt.salt,salt.hash]);
    const lab=createLabLogin(pool,signer,{enabled:true});
    const token=await lab.login({handle,passphrase:phrase},"127.0.0.1");
    assert.equal(verifyBearer("Bearer "+token.token,verifier).subject,subject);
    await assert.rejects(lab.login({handle,passphrase:"incorrect"},"127.0.0.1"),
      e=>e.status===401);
    await pool.query("UPDATE bridge_accounts SET status='suspended' WHERE id=$1",[id]);
    await assert.rejects(lab.login({handle,passphrase:phrase},"127.0.0.1"),
      e=>e.status===401);
    const row=await pool.query("SELECT passphrase_hash FROM bridge_lab_credentials WHERE account_id=$1",[id]);
    assert.notEqual(row.rows[0].passphrase_hash,phrase);
  }finally{
    await pool.query("DELETE FROM bridge_lab_credentials WHERE account_id=$1",[id]).catch(()=>{});
    await pool.query("DELETE FROM bridge_accounts WHERE id=$1",[id]).catch(()=>{});
    await pool.end();
  }
});

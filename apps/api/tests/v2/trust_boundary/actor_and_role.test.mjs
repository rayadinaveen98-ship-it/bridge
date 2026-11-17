/**
 * B3c-2R3B-2A. A = deliberately forgeable actor GUC; B = fixed command with
 * independent LOGIN and nonowner executor. PASS for A means UNSAFE REPRODUCED.
 */
import assert from "node:assert/strict";

export async function actorAndRoleChecks(t,lab){
  const {admin,clients,roles,schemas,people,withTx}=lab;
  await t.test("TB-A01: direct RLS with caller-controlled actor GUC is UNSAFE",async()=>{
    await admin.query("CREATE TABLE "+schemas.cmd+".guc_probe(owner_id uuid NOT NULL)");
    await admin.query("INSERT INTO "+schemas.cmd+".guc_probe VALUES($1),($2)",
      [people.a,people.c]);
    await admin.query("ALTER TABLE "+schemas.cmd+".guc_probe ENABLE ROW LEVEL SECURITY");
    await admin.query("GRANT SELECT ON "+schemas.cmd+".guc_probe TO "+roles.runtime);
    await admin.query("CREATE POLICY tb_guc_unsafe ON "+schemas.cmd+
      ".guc_probe FOR SELECT TO "+roles.runtime+
      " USING(owner_id=current_setting('bridge.insecure.actor',true)::uuid)");
    await clients.runtime.query("BEGIN");
    try{
      await clients.runtime.query("SELECT pg_catalog.set_config('bridge.insecure.actor',$1,true)",
        [people.c]);
      const rows=(await clients.runtime.query("SELECT owner_id FROM "+
        schemas.cmd+".guc_probe")).rows;
      assert.deepEqual(rows,[{owner_id:people.c}],
        "a compromised runtime can forge the actor GUC; candidate A REJECTED");
    }finally{await clients.runtime.query("ROLLBACK");}
    await admin.query("REVOKE ALL ON "+schemas.cmd+".guc_probe FROM "+roles.runtime);
  });
  await t.test("TB-B01: distinct LOGINs and NOLOGIN nonowner executor",async()=>{
    for(const key of ["runtime","issuer","actor","migrator"]){
      assert.equal((await clients[key].query("SELECT session_user me")).rows[0].me,
        roles[key]);
      const flags=(await clients[key].query(
        "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit,rolcanlogin "+
        "FROM pg_roles WHERE rolname=current_user")).rows[0];
      for(const f of ["rolsuper","rolbypassrls","rolcreatedb","rolcreaterole","rolinherit"])
        assert.equal(flags[f],false,key+" privilege "+f);
      assert.equal(flags.rolcanlogin,true);
    }
    const exec=(await admin.query("SELECT rolcanlogin,rolsuper,rolbypassrls "+
      "FROM pg_roles WHERE rolname=$1",[roles.exec])).rows[0];
    assert.deepEqual(exec,{rolcanlogin:false,rolsuper:false,rolbypassrls:false});
    const owner=(await admin.query(
      "SELECT relname,pg_get_userbyid(relowner) owner FROM pg_class "+
      "WHERE relname=ANY($1) AND relnamespace='public'::regnamespace",
      [lab.secureTables])).rows;
    assert.equal(owner.length,3);
    for(const item of owner)assert.notEqual(item.owner,roles.exec,
      "the command executor MUST NOT own an RLS table");
    for(const table of [...lab.secureTables,
      "bridge_accounts","bridge_blocks","bridge_conversations"]){
      const q=(await clients.runtime.query(
        "SELECT has_table_privilege(current_user,$1,'SELECT') allowed",
        ["public."+table])).rows[0];
      assert.equal(q.allowed,false,"runtime must not directly read "+table);
    }
    for(const table of ["bridge_v2_secure_live","bridge_v2_secure_unread"]){
      assert.equal((await clients.runtime.query(
        "SELECT has_table_privilege($1,$2,'SELECT') allowed",
        [roles.exec,"public."+table])).rows[0].allowed,false,
        "executor must not gain ciphertext access: "+table);
    }
  });
  await t.test("TB-B02: legitimate fixed metadata command works; strangers denied",async()=>{
    await withTx(async({client,issue,call})=>{
      assert.equal(await call(client,issue()),1);
    });
    await withTx(async({client,issue,call})=>{
      assert.equal(await call(client,issue({actor:people.b,target:people.bc.roomId})),1);
    });
    await withTx(async({client,issue,call})=>{
      await assert.rejects(()=>call(client,issue({actor:people.a,
        target:people.bc.roomId})),e=>e.code==="42501");
    });
  });
  await t.test("TB-B03: SQL credential cannot read, switch role or inherit authority",async()=>{
    const runtime=clients.runtime;
    await assert.rejects(()=>runtime.query(
      "SELECT * FROM public.bridge_v2_secure_messages"),e=>e.code==="42501");
    await assert.rejects(()=>runtime.query(
      "SELECT * FROM "+schemas.key+".private_key"),e=>e.code==="42501");
    await assert.rejects(()=>runtime.query("SET ROLE "+roles.exec),e=>e.code==="42501");
    await assert.rejects(()=>runtime.query("SET ROLE "+roles.issuer),e=>e.code==="42501");
    await assert.rejects(()=>runtime.query("CREATE TABLE "+schemas.cmd+
      ".pwn(x integer)"),e=>e.code==="42501");
    await assert.rejects(()=>runtime.query("GRANT SELECT ON public.bridge_accounts TO "+
      roles.runtime),e=>e.code==="42501");
    await assert.rejects(()=>clients.actor.query("SELECT "+schemas.cmd+
      ".inspect(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)"),e=>
      ["42501","3F000"].includes(e.code));
    const owner=(await admin.query("SELECT pg_get_userbyid(p.proowner) name "+
      "FROM pg_proc p WHERE p.oid=$1::regprocedure",
      [schemas.cmd+".inspect(uuid,text,uuid,uuid,text,text,bigint,text,text)"])).rows[0].name;
    assert.equal(owner,roles.exec);
  });
  await t.test("TB-B04: current eligibility, Block and relationship checks deny",async sub=>{
    const scenarios=[
      ["suspend actor","UPDATE bridge_accounts SET status='suspended' WHERE id=$1",
        "UPDATE bridge_accounts SET status='active' WHERE id=$1",[people.a]],
      ["age not verified","UPDATE bridge_accounts SET age_verified_at=NULL WHERE id=$1",
        "UPDATE bridge_accounts SET age_verified_at=clock_timestamp() WHERE id=$1",[people.b]],
      ["safety revoked","UPDATE bridge_accounts SET safety_eligible=false WHERE id=$1",
        "UPDATE bridge_accounts SET safety_eligible=true WHERE id=$1",[people.a]],
      ["participant departure","UPDATE bridge_conversation_participants SET "+
        "left_at=clock_timestamp() WHERE conversation_id=$1 AND account_id=$2",
        "UPDATE bridge_conversation_participants SET left_at=NULL "+
        "WHERE conversation_id=$1 AND account_id=$2",[people.ab.roomId,people.a]],
      ["relationship ended","UPDATE bridge_connections SET ended_at=clock_timestamp() WHERE id=$1",
        "UPDATE bridge_connections SET ended_at=NULL WHERE id=$1",[people.ab.connectionId]],
      ["room closed","UPDATE bridge_conversations SET state='closed',closed_at=clock_timestamp() WHERE id=$1",
        "UPDATE bridge_conversations SET state='open',closed_at=NULL WHERE id=$1",[people.ab.roomId]]
    ];
    for(const [label,change,restore,params] of scenarios)await sub.test(label,async()=>{
      await admin.query(change,params);
      try{
        await withTx(async({client,issue,call})=>{
          await assert.rejects(()=>call(client,issue()),e=>e.code==="42501");
        });
      }finally{await admin.query(restore,params);}
    });
    for(const [blocker,blocked] of [[people.a,people.b],[people.b,people.a]])
      await sub.test("Block direction denies "+blocker.slice(0,6),async()=>{
        await admin.query("INSERT INTO bridge_blocks(blocker_id,blocked_id) VALUES($1,$2)",
          [blocker,blocked]);
        try{
          await withTx(async({client,issue,call})=>{
            await assert.rejects(()=>call(client,issue()),e=>e.code==="42501");
          });
        }finally{
          await admin.query("DELETE FROM bridge_blocks WHERE blocker_id=$1 AND blocked_id=$2",
            [blocker,blocked]);
        }
      });
  });
}

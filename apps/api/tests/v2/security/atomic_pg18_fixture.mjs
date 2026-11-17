/**
 * B3c-2R3B-1: disposable PG18 tested guard fixture.
 * Real 0001-0008 migrations and strict Docker cluster attestation are reused.
 * Test-only command-owner role is non-superuser and does not have BYPASSRLS;
 * it temporarily owns only the THREE secure-message tables in the lab.
 * The runtime role owns no tables and has EXECUTE only, not direct SQL access.
 * The function owner bypasses table RLS by ownership: NOT production-safe.
 */
import assert from "node:assert/strict";
import {createHash,createHmac,randomBytes,randomUUID} from "node:crypto";
import pg from "pg";
import {withActualPg18SignedProof,assertOnlyDisposablePg18,
  syntheticCipherBytes} from "../privileges/b3c2r2_actual_schema_fixture.mjs";
import {createDisposableAtomicGuard,assertDisposableB3c2r3b1}
  from "../../../src/v2/security/disposable_atomic_guard.mjs";
import {signedToken,subject} from "../identity/fixtures.mjs";

const url="postgresql://bridge_privproof_admin:bridge_privproof_only@127.0.0.1:5432/bridge_privproof";
const dataTables=["bridge_v2_secure_messages","bridge_v2_secure_live","bridge_v2_secure_unread"];
const contextTables=["bridge_accounts","bridge_blocks","bridge_conversations",
  "bridge_connections","bridge_conversation_participants","bridge_v2_direct_sessions"];
export const denied=e=>e?.code==="resource_unavailable";
export {randomUUID,syntheticCipherBytes};
export function fixtureEnv(overrides={}){
  return {...process.env,CI:"true",GITHUB_ACTIONS:"true",
    BRIDGE_B3C2R3B1_ACK:"bridge-b3c2r3b1-disposable-only",
    BRIDGE_B3C2R2_ACK:"disposable-actual-0008-pg18-only",
    BRIDGE_B3C2R2_PG_MAJOR:"18",
    BRIDGE_B3C2R2_TEST_DATABASE_URL:url,...overrides};
}
function gatewaySql(schema){
  if(!/^b3r2_[0-9a-f]{12}_s$/.test(schema))throw Error('unsafe_generated_schema');
  return "CREATE FUNCTION __S__.dispatch(a uuid,op text,target uuid,client_id uuid,recovery text,exp bigint,mac text)\nRETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $proof$\nDECLARE\n  vkey bytea; checktext text; expected text; epoch bigint; roomid uuid;\n  room record; pair record; envelope record; person record; members uuid[];\n  total int; all_present boolean; seen int; peer uuid; segment record;\n  seq bigint; msgid uuid; stamp timestamptz; token text; result jsonb;\nBEGIN\n  PERFORM pg_catalog.pg_advisory_xact_lock(714411);\n  SELECT k.secret INTO vkey FROM __S__.guard_key k WHERE k.id=1;\n  epoch:=pg_catalog.floor(pg_catalog.date_part('epoch',pg_catalog.clock_timestamp()))::bigint;\n  IF vkey IS NULL OR a IS NULL OR target IS NULL OR op NOT IN\n    ('send','live','unread','ack','recover') OR mac IS NULL OR\n    mac !~ '^[a-f0-9]{64}$' OR exp<=epoch OR exp>epoch+26 THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  checktext:=a::text||'|'||op||'|'||target::text||'|'||\n    coalesce(client_id::text,'')||'|'||\n    pg_catalog.encode(public.digest(\n      pg_catalog.convert_to(coalesce(recovery,''),'UTF8'),'sha256'),'hex')||'|'||\n    exp::text||'|'||pg_catalog.txid_current()::text||'|'||session_user;\n  expected:=pg_catalog.encode(public.hmac(\n    pg_catalog.convert_to(checktext,'UTF8'),vkey,'sha256'),'hex');\n  IF expected<>mac THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  IF op IN ('unread','ack','recover') THEN\n    SELECT u.*,m.conversation_id,m.sender_id,m.policy_version AS mp INTO envelope\n      FROM public.bridge_v2_secure_unread u\n      JOIN public.bridge_v2_secure_messages m ON m.id=u.message_id\n      WHERE u.id=target FOR UPDATE OF u;\n    IF NOT FOUND OR envelope.recipient_id<>a OR envelope.mp<>'bridge-v2' THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n    roomid:=envelope.conversation_id;\n  ELSE\n    roomid:=target;\n  END IF;\n  SELECT r.* INTO room FROM public.bridge_conversations r WHERE r.id=roomid FOR UPDATE;\n  IF NOT FOUND OR room.kind<>'connection' OR room.policy_version<>'bridge-v2' OR\n    room.v2_session_role<>'direct' OR room.legacy_qa IS DISTINCT FROM false OR\n    room.connection_id IS NULL THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  SELECT c.* INTO pair FROM public.bridge_connections c\n    WHERE c.id=room.connection_id FOR SHARE;\n  IF NOT FOUND OR pair.ended_at IS NOT NULL OR pair.policy_version<>'bridge-v2' THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  SELECT pg_catalog.array_agg(p.account_id ORDER BY p.account_id),\n    pg_catalog.count(*)::integer,pg_catalog.bool_and(p.left_at IS NULL)\n    INTO members,total,all_present\n    FROM public.bridge_conversation_participants p WHERE p.conversation_id=roomid;\n  IF total<>2 OR all_present IS DISTINCT FROM true OR\n    NOT a=ANY(members) OR members[1]=members[2] OR\n    members[1]<>pair.member_low OR members[2]<>pair.member_high THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  seen:=0;\n  FOR person IN\n    SELECT id,auth_subject,status,age_verified_at,safety_eligible,deleted_at\n      FROM public.bridge_accounts WHERE id=ANY(members) ORDER BY id FOR SHARE\n  LOOP\n    seen:=seen+1;\n    IF person.status<>'active' OR person.age_verified_at IS NULL OR\n       person.safety_eligible IS DISTINCT FROM true OR person.deleted_at IS NOT NULL OR\n       person.auth_subject<>'b3b-disposable:'||person.id::text THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n  END LOOP;\n  IF seen<>2 OR EXISTS(\n    SELECT 1 FROM public.bridge_blocks b WHERE\n      (b.blocker_id=members[1] AND b.blocked_id=members[2]) OR\n      (b.blocker_id=members[2] AND b.blocked_id=members[1])\n  ) THEN RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001'; END IF;\n  peer:=CASE WHEN a=members[1] THEN members[2] ELSE members[1] END;\n  IF op IN ('send','live') THEN\n    SELECT d.* INTO segment FROM public.bridge_v2_direct_sessions d\n      WHERE d.conversation_id=roomid FOR SHARE;\n    IF NOT FOUND OR segment.state<>'open' OR segment.connection_id<>pair.id OR\n      segment.policy_version<>'bridge-v2' OR room.state<>'open' OR\n      room.idle_expires_at IS NULL OR room.idle_expires_at<=pg_catalog.clock_timestamp() THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n  END IF;\n  IF op='live' THEN\n    SELECT coalesce(pg_catalog.jsonb_agg(\n      pg_catalog.jsonb_build_object('id',m.id,'sender',m.sender_id,\n        'sequence',m.sequence_number,'shape',pg_catalog.encode(l.ciphertext,'hex'))\n      ORDER BY m.sequence_number),'[]'::jsonb)\n      INTO result FROM public.bridge_v2_secure_messages m\n      JOIN public.bridge_v2_secure_live l ON l.message_id=m.id\n      WHERE m.conversation_id=roomid;\n    RETURN pg_catalog.jsonb_build_object('messages',result);\n  END IF;\n  IF op='send' THEN\n    IF client_id IS NULL OR recovery IS NOT NULL OR room.next_message_sequence IS NULL\n      OR room.next_message_sequence>1000000 THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n    seq:=room.next_message_sequence;stamp:=pg_catalog.clock_timestamp();\n    msgid:=pg_catalog.gen_random_uuid();\n    INSERT INTO public.bridge_v2_secure_messages(\n      id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at)\n      VALUES(msgid,roomid,a,client_id,seq,'bridge-v2',stamp);\n    INSERT INTO public.bridge_v2_secure_live(\n      message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,\n      kek_id,kek_version,cipher_suite,aad_version)\n      VALUES(msgid,pg_catalog.decode('beef','hex'),public.gen_random_bytes(12),\n        public.gen_random_bytes(16),public.gen_random_bytes(32),\n        public.gen_random_bytes(12),public.gen_random_bytes(16),\n        'ci-r3b1-live',1,'aes-256-gcm-v1',1);\n    INSERT INTO public.bridge_v2_secure_unread(\n      message_id,connection_id,recipient_id,accepted_at,expires_at,\n      ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,\n      kek_id,kek_version,cipher_suite,aad_version)\n      VALUES(msgid,pair.id,peer,stamp,stamp+interval '7 days',\n        pg_catalog.decode('cafe','hex'),public.gen_random_bytes(12),\n        public.gen_random_bytes(16),public.gen_random_bytes(32),\n        public.gen_random_bytes(12),public.gen_random_bytes(16),\n        'ci-r3b1-unread',1,'aes-256-gcm-v1',1);\n    UPDATE public.bridge_conversations SET\n      next_message_sequence=seq+1,last_accepted_at=stamp,\n      idle_expires_at=stamp+interval '30 minutes' WHERE id=roomid;\n    RETURN pg_catalog.jsonb_build_object('id',msgid,'sequence',seq);\n  END IF;\n  IF envelope.connection_id<>pair.id OR envelope.sender_id<>peer OR\n    envelope.state IN ('expired','revoked') OR envelope.expires_at<=pg_catalog.clock_timestamp()\n    OR envelope.expires_at>envelope.accepted_at+interval '7 days' THEN\n    RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n  END IF;\n  IF op='unread' THEN\n    IF envelope.state<>'unread' OR envelope.first_acknowledged_at IS NOT NULL THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n    RETURN pg_catalog.jsonb_build_object('id',envelope.id,\n      'shape',pg_catalog.encode(envelope.ciphertext,'hex'));\n  END IF;\n  IF op='ack' THEN\n    IF envelope.state<>'unread' OR envelope.first_acknowledged_at IS NOT NULL THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n    token:=pg_catalog.encode(public.gen_random_bytes(24),'hex');\n    UPDATE public.bridge_v2_secure_unread SET\n      state='acknowledged',first_acknowledged_at=pg_catalog.clock_timestamp(),\n      recovery_token_digest=public.digest(\n        pg_catalog.convert_to(token,'UTF8'),'sha256') WHERE id=envelope.id;\n    RETURN pg_catalog.jsonb_build_object('id',envelope.id,'recoveryToken',token);\n  END IF;\n  IF op='recover' THEN\n    IF envelope.state<>'acknowledged' OR envelope.first_acknowledged_at IS NULL\n      OR pg_catalog.clock_timestamp()>=envelope.first_acknowledged_at+interval '15 minutes'\n      OR recovery IS NULL OR envelope.recovery_token_digest IS NULL\n      OR envelope.recovery_token_digest<>public.digest(\n        pg_catalog.convert_to(recovery,'UTF8'),'sha256') THEN\n      RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\n    END IF;\n    RETURN pg_catalog.jsonb_build_object('id',envelope.id,\n      'shape',pg_catalog.encode(envelope.ciphertext,'hex'));\n  END IF;\n  RAISE EXCEPTION 'resource_unavailable' USING ERRCODE='P0001';\nEND\n$proof$".replaceAll('__S__',schema);
}
export async function withAtomicPg18Fixture(work,{testGate=null}={}){
  const env=fixtureEnv();
  assertDisposableB3c2r3b1(env);assertOnlyDisposablePg18(env);
  return withActualPg18SignedProof(async lab=>{
    const {admin,appClient,names,people,schemaReceipt}=lab;
    const schema=names.schema,key=randomBytes(32);
    let transferred=false,pool=null,created=false;
    async function asMigrator(sql,params=[]){
      await admin.query("SET ROLE "+names.migrator);
      try{return await admin.query(sql,params);}
      finally{await admin.query("RESET ROLE");}
    }
    try {
      assert.equal(schemaReceipt.tables,37);
      assert.equal(schemaReceipt.rlsTables,3);
      for(const [table,policies] of [
        [dataTables[0],["b3r2_meta_read","b3r2_meta_write"]],
        [dataTables[1],["b3r2_live_read","b3r2_live_write"]],
        [dataTables[2],["b3r2_unread_read","b3r2_unread_write"]]
      ]){
        for(const p of policies)await admin.query("DROP POLICY IF EXISTS "+p+" ON public."+table);
        await admin.query("REVOKE ALL ON TABLE public."+table+" FROM "+names.app);
      }
      for(const t of contextTables)
        await admin.query("GRANT SELECT ON TABLE public."+t+" TO "+names.migrator);
      for(const t of dataTables)
        await admin.query("ALTER TABLE public."+t+" OWNER TO "+names.migrator);
      transferred=true;
      await asMigrator("CREATE TABLE "+schema+".guard_key(id integer PRIMARY KEY,secret bytea NOT NULL)");
      await asMigrator("INSERT INTO "+schema+".guard_key VALUES(1,$1)",[key]);
      await asMigrator("BEGIN");
      try {
        await asMigrator(gatewaySql(schema));
        await asMigrator("REVOKE ALL ON FUNCTION "+schema+
          ".dispatch(uuid,text,uuid,uuid,text,bigint,text) FROM PUBLIC");
        await asMigrator("GRANT EXECUTE ON FUNCTION "+schema+
          ".dispatch(uuid,text,uuid,uuid,text,bigint,text) TO "+names.app);
        await asMigrator("COMMIT");
      }catch(e){await asMigrator("ROLLBACK");throw e;}
      created=true;
      for(const link of [people.ab,people.bc]) {
        await admin.query(
          "UPDATE public.bridge_conversations SET policy_version='bridge-v2',"+
          "v2_session_role='direct',legacy_qa=false,"+
          "last_accepted_at=clock_timestamp(),"+
          "idle_expires_at=clock_timestamp()+interval '30 minutes',"+
          "next_message_sequence=1 WHERE id=$1",[link.roomId]);
        await admin.query(
          "UPDATE public.bridge_connections SET policy_version='bridge-v2' WHERE id=$1",
          [link.connectionId]);
        await admin.query(
          "INSERT INTO public.bridge_v2_direct_sessions("+
          "conversation_id,connection_id,state,policy_version,opened_at) "+
          "VALUES($1,$2,'open','bridge-v2',clock_timestamp())",
          [link.roomId,link.connectionId]);
      }
      pool=new pg.Pool({connectionString:url,max:6,application_name:"b3c2r3b1_ci_synthetic_writer"});
      const signer=({actor,operation,targetId,clientMessageId,recoveryToken,expires,tx,session})=>
        createHmac("sha256",key).update([
          actor,operation,targetId,clientMessageId??"",
          createHash("sha256").update(recoveryToken??"").digest("hex"),
          expires,tx,session].join("|")).digest("hex");
      const createGuard=hook=>createDisposableAtomicGuard({
        checkout:async()=>({query:(...args)=>appClient.query(...args),release:()=>{}}),
        authentication:lab.keys.authentication,proofSigner:signer,
        schema,testGate:hook,env
      });
      async function writer(change){
        const client=await pool.connect();
        try{
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock($1)",[714411]);
          const result=await change(client);
          await client.query("COMMIT");return result;
        }catch(e){try{await client.query("ROLLBACK");}catch{}throw e;}
        finally{client.release();}
      }
      async function seed(author,room,connection,recipient){
        const id=randomUUID(),now=new Date(),l=syntheticCipherBytes(),u=syntheticCipherBytes();
        await writer(async c=>{
          await c.query("INSERT INTO bridge_v2_secure_messages "+
            "(id,conversation_id,sender_id,client_message_id,sequence_number,policy_version,accepted_at) "+
            "VALUES($1,$2,$3,$4,1,'bridge-v2',$5)",
            [id,room,author,randomUUID(),now]);
          await c.query("INSERT INTO bridge_v2_secure_live "+
            "(message_id,ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
            "kek_id,kek_version,cipher_suite,aad_version) "+
            "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
            [id,l.ciphertext,l.dataIv,l.dataTag,l.wrappedDek,
              l.wrapIv,l.wrapTag,l.kekId,1,l.cipherSuite,1]);
          await c.query("INSERT INTO bridge_v2_secure_unread "+
            "(message_id,connection_id,recipient_id,accepted_at,expires_at,"+
            "ciphertext,data_iv,data_tag,wrapped_dek,wrap_iv,wrap_tag,"+
            "kek_id,kek_version,cipher_suite,aad_version) "+
            "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
            [id,connection,recipient,now,new Date(now.getTime()+86400000),
              u.ciphertext,u.dataIv,u.dataTag,u.wrappedDek,u.wrapIv,
              u.wrapTag,u.kekId,1,u.cipherSuite,1]);
        });
        return id;
      }
      const guard=createGuard(testGate);
      const verify=async()=>{
        const role=(await appClient.query(
          "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolinherit "+
          "FROM pg_roles WHERE rolname=current_user")).rows[0];
        for(const attr of Object.keys(role))assert.equal(role[attr],false);
        for(const table of dataTables)
          assert.equal((await appClient.query(
            "SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed",
            ["public."+table])).rows[0].allowed,false);
        assert.equal((await appClient.query(
          "SELECT has_function_privilege(current_user,$1,'EXECUTE') AS allowed",
          [schema+".dispatch(uuid,text,uuid,uuid,text,bigint,text)"]
        )).rows[0].allowed,true);
      };
      await verify();
      return await work(Object.freeze({
        guard,createGuard,verify,admin,appClient,people,names,schema,
        signer,seed,writer,pool,schemaReceipt,env,
        token:actor=>signedToken(lab.keys,{sub:subject(actor)})
      }));
    }finally{
      if(pool)await pool.end();
      if(transferred) {
        for(const table of dataTables)
          await admin.query("ALTER TABLE public."+table+" OWNER TO bridge_privproof_admin");
        for(const table of contextTables)
          await admin.query("REVOKE ALL ON TABLE public."+table+" FROM "+names.migrator);
      }
      if(created)await admin.query("DROP FUNCTION IF EXISTS "+schema+
        ".dispatch(uuid,text,uuid,uuid,text,bigint,text)");
      key.fill(0);
    }
  });
}

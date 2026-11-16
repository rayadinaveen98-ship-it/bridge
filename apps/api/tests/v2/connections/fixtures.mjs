import {randomUUID,createHash} from "node:crypto";
import {createRandomSessionRepository} from "../../../src/sessions/random_repository.mjs";
import {assertDisposableConnection} from "../migrations/runner.mjs";
export const uuid=()=>randomUUID();
export const hold=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const checkDisposable=()=>{
  const url=process.env.BRIDGE_TEST_DATABASE_URL;
  assertDisposableConnection(url,process.env.BRIDGE_TEST_MIGRATION_ACK);
  return url;
};
export async function single(pool,sql,args=[]){
  return (await pool.query(sql,args)).rows[0];
}
export async function qty(pool,sql,args=[]){
  return Number((await single(pool,sql,args)).n);
}
export async function accounts(pool,count=2){
  const ids=Array.from({length:count},uuid).sort();
  for(const id of ids)await pool.query(
    "INSERT INTO bridge_accounts(id,auth_subject,status,age_verified_at,safety_eligible)"+
    " VALUES($1,$2,'active',clock_timestamp(),true)",[id,"v205-disposable|"+id]);
  return ids;
}
export async function match(pool,people,{queue=true}={}){
  const matchId=uuid();
  await pool.query(
    "INSERT INTO bridge_supported_languages(code,display_name,moderation_ready)"+
    " VALUES('en','English',true) ON CONFLICT DO NOTHING");
  await pool.query(
    "INSERT INTO bridge_match_sessions(id,member_low,member_high,language_code,state,"+
    "reserved_at,lease_expires_at,activated_at) VALUES($1,$2,$3,'en','active',"+
    "clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '4 minutes',"+
    "clock_timestamp()-interval '5 minutes')",[matchId,...people]);
  for(const id of people)await pool.query(
    "INSERT INTO bridge_active_match_slots(account_id,match_session_id) VALUES($1,$2)",
    [id,matchId]);
  if(queue)for(const id of people)await pool.query(
    "INSERT INTO bridge_match_queue(account_id,request_id,state,expires_at,match_session_id)"+
    " VALUES($1,$2,'reserved',clock_timestamp()+interval '2 minutes',$3)"+
    " ON CONFLICT(account_id) DO UPDATE SET request_id=EXCLUDED.request_id,"+
    "state='reserved',expires_at=EXCLUDED.expires_at,"+
    "match_session_id=EXCLUDED.match_session_id",
    [id,uuid(),matchId]);
  return matchId;
}
export async function randomRoom(pool,{people=null,queue=true}={}){
  const members=people||await accounts(pool);
  const matchId=await match(pool,members,{queue});
  const room=(await createRandomSessionRepository(pool).activate({matchId})).id;
  return {people:members,matchId,room};
}
export async function sourceText(pool,fixture,num=2){
  for(let i=0;i<num;i++)await pool.query(
    "INSERT INTO bridge_messages(conversation_id,sender_id,client_message_id,"+
    "sequence_number,body) VALUES($1,$2,$3,$4,$5)",
    [fixture.room,fixture.people[i%2],uuid(),i+1,"v205 original random "+(i+1)]);
  await pool.query(
    "UPDATE bridge_conversations SET next_message_sequence=$2 WHERE id=$1",
    [fixture.room,num+1]);
}
export async function snapshotRandomContent(pool,room){
  const messages=(await pool.query(
    "SELECT id,sender_id,sequence_number,body FROM bridge_messages "+
    "WHERE conversation_id=$1 ORDER BY sequence_number",[room])).rows;
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}
export async function legacyFixture(pool){
  const people=await accounts(pool);
  const matchId=await match(pool,people);
  const room=uuid();
  await pool.query(
    "INSERT INTO bridge_conversations(id,match_session_id,kind,state,next_message_sequence) "+
    "VALUES($1,$2,'random','open',5)",[room,matchId]);
  for(const id of people)await pool.query(
    "INSERT INTO bridge_conversation_participants(conversation_id,account_id) VALUES($1,$2)",
    [room,id]);
  const f={people,matchId,room};
  await sourceText(pool,f,4);
  const before=await legacySnapshot(pool,f);
  return {...f,before};
}
export async function legacySnapshot(pool,f){
  const rows=[];
  for(const [sql,args] of [
    ["SELECT id,kind,state,policy_version,v2_session_role,legacy_qa,"+
     "last_accepted_at,idle_expires_at FROM bridge_conversations WHERE id=$1",[f.room]],
    ["SELECT id,sequence_number,sender_id,body FROM bridge_messages "+
     "WHERE conversation_id=$1 ORDER BY sequence_number",[f.room]],
    ["SELECT account_id,match_session_id FROM bridge_active_match_slots "+
     "WHERE match_session_id=$1 ORDER BY account_id",[f.matchId]]
  ])rows.push((await pool.query(sql,args)).rows);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
export async function setRoomDeadline(pool,roomId,offsetMs){
  const date=new Date(Date.now()-30*60_000+offsetMs);
  await pool.query("UPDATE bridge_conversations SET last_accepted_at=$2,"+
    "idle_expires_at=$2::timestamptz+interval '30 minutes' WHERE id=$1",
    [roomId,date]);
}
export async function connected(pool,keepRepo,fixture=null){
  const f=fixture||await randomRoom(pool);
  const a=await keepRepo.vote({conversationId:f.room,actorId:f.people[0],decision:"accept"});
  if(a.status!=="pending")throw Error("expected first Keep pending");
  const b=await keepRepo.vote({conversationId:f.room,actorId:f.people[1],decision:"accept"});
  if(b.status!=="connected")throw Error("expected second Keep connected");
  return {...f,...b};
}

import test from "node:test";
import assert from "node:assert/strict";
import { BridgeLabDesktopClient } from "../src/lab_desktop_client.mjs";

function fake(responses, requests) {
  return async (url,options) => {
    const path=new URL(url).pathname + new URL(url).search;
    requests.push({path,method:options.method,headers:options.headers,
      body:options.body && JSON.parse(options.body)});
    const result=responses.shift();
    assert.ok(result, "No fake result for "+path);
    return new Response(result.value===undefined?"":JSON.stringify(result.value),
      {status:result.status||200,
        headers:{"Content-Type":"application/json"}});
  };
}

test("rejects remote or credential-in-URL endpoints",()=>{
  for(const invalid of [
    "https://127.0.0.1:8787",
    "http://example.org:8787",
    "http://user:pass@127.0.0.1:8787",
    "http://127.0.0.1:8787/not-a-lab",
    "http://127.0.0.1:8787/?token=secret"
  ])assert.throws(()=>new BridgeLabDesktopClient({origin:invalid}),TypeError);
  assert.equal(new BridgeLabDesktopClient().origin,"http://127.0.0.1:8787");
});

test("tester_b login, English-only setup, and queue matching use no public sign-up",async()=>{
  const requests=[];
  const responses=[
    {value:{alive:true,component:"bridge-internal-api"}},
    {value:{token:"synthetic.jwt.token",expiresIn:1800}},
    {value:{languages:[{code:"en",displayName:"English"}],featureFlags:{}}},
    {status:204},
    {status:202,value:{requestId:"r",state:"waiting"}},
    {value:{requestId:"r",state:"connected",conversationId:"conv-1"}}
  ];
  const client=new BridgeLabDesktopClient({fetchImpl:fake(responses,requests)});
  await client.health();
  await assert.rejects(client.login("tester_a","s3cret"),/reserved for tester_b/);
  await client.login("tester_b","fake-test-passphrase");
  await client.prepareEnglish();
  assert.equal((await client.search()).state,"waiting");
  assert.equal((await client.searchStatus()).state,"connected");
  assert.equal(client.conversationId,"conv-1");
  assert.equal(requests[1].path,"/internal/lab/login");
  assert.equal(requests[1].headers.Authorization,undefined);
  assert.equal(requests[2].headers.Authorization,"Bearer synthetic.jwt.token");
  assert.deepEqual(requests[3].body,{
    languageCodes:["en"],intention:"just_chat",interests:[],topic:null
  });
  assert.equal(requests[4].headers["Idempotency-Key"],client.requestId);
});

test("message cursor advances in order and idempotent retries reuse message ID",async()=>{
  const requests=[];
  const responses=[
    {status:200,value:[
      {id:"m1",sequenceNumber:1,body:"first",senderId:"peer"},
      {id:"m2",sequenceNumber:2,body:"second",senderId:"me"}]},
    {status:500,value:{error:"internal_error"}},
    {status:201,value:{id:"m3",sequenceNumber:3,body:"Hello laptop"}},
    {status:200,value:[{id:"m3",sequenceNumber:3,body:"Hello laptop"}]}
  ];
  const client=new BridgeLabDesktopClient({fetchImpl:fake(responses,requests)});
  client.token="temporary.jwt";
  client.conversationId="c1";
  assert.deepEqual((await client.messages()).map(x=>x.sequenceNumber),[1,2]);
  await assert.rejects(client.send("Hello laptop"),/Bridge API 500/);
  assert.equal((await client.send("Hello laptop")).sequenceNumber,3);
  assert.equal(requests[1].body.clientMessageId,requests[2].body.clientMessageId);
  assert.equal(requests[1].headers["Idempotency-Key"],requests[2].headers["Idempotency-Key"]);
  assert.equal((await client.messages()).length,1);
  assert.equal(client.cursor,3);
});

test("rejects skipped message sequence rather than silently losing chat history",async()=>{
  const requests=[], responses=[
    {status:200,value:[{id:"m1",sequenceNumber:5,body:"gap"}]}
  ];
  const client=new BridgeLabDesktopClient({fetchImpl:fake(responses,requests)});
  client.token="test";
  client.conversationId="c1";
  await assert.rejects(client.messages(),/cursor gap/);
  assert.equal(client.cursor,0);
});

test("unrecognized language catalog fails rather than inventing a match",async()=>{
  const requests=[], responses=[
    {status:200,value:{languages:[{code:"zz"}],featureFlags:{}}}
  ];
  const client=new BridgeLabDesktopClient({fetchImpl:fake(responses,requests)});
  client.token="test";
  await assert.rejects(client.prepareEnglish(),/English is not enabled/);
  assert.equal(requests.length,1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { generateKeyPairSync, createSign } from "node:crypto";
import { createHandler } from "../src/http.mjs";
import { createLiveHub } from "../src/live.mjs";
import { ApiError } from "../src/auth.mjs";

const CONVO="c04a2ecc-df58-4b5f-8c17-2bf0bdf040ed";
const KEY_ID="49f2d6b1-5056-4f7d-b24b-3af8b517dc98";
const keyPair=generateKeyPairSync("rsa",{modulusLength:2048});
const auth={
  publicKeyPem:keyPair.publicKey.export({type:"spki",format:"pem"}),
  issuer:"bridge-lab",audience:"bridge-api"
};
function token(subject) {
  const now=Math.floor(Date.now()/1000);
  const parts=[
    {typ:"JWT",alg:"RS256"},
    {sub:subject,iss:auth.issuer,aud:auth.audience,iat:now,exp:now+300}
  ].map(x=>Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  const signer=createSign("RSA-SHA256");
  signer.update(parts);signer.end();
  return parts+"."+signer.sign(keyPair.privateKey).toString("base64url");
}
function openSse(port,subject) {
  return new Promise((resolve,reject)=>{
    const req=httpRequest({
      host:"127.0.0.1",port,method:"GET",
      path:"/v1/conversations/"+CONVO+"/events",
      headers:{Authorization:"Bearer "+token(subject),Accept:"text/event-stream"}
    },res=>{
      const received=[];
      let buffer="",pending=[];
      res.on("data",chunk=>{
        buffer+=chunk.toString();
        let end;
        while((end=buffer.indexOf("\n\n"))>=0){
          const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
          const eventLine=frame.split("\n").find(x=>x.startsWith("event: "));
          const dataLine=frame.split("\n").find(x=>x.startsWith("data: "));
          if(!eventLine||!dataLine)continue;
          const event={type:eventLine.slice(7),data:JSON.parse(dataLine.slice(6))};
          received.push(event);
          for(const waiter of [...pending])if(waiter.type===event.type){
            clearTimeout(waiter.timer);
            pending=pending.filter(x=>x!==waiter);
            waiter.resolve(event);
          }
        }
      });
      resolve({
        status:res.statusCode,
        received,
        wait(type,timeout=2500){
          const found=received.find(x=>x.type===type);
          if(found)return Promise.resolve(found);
          return new Promise((done,fail)=>{
            const waiter={type,resolve:done};
            waiter.timer=setTimeout(()=>{
              pending=pending.filter(x=>x!==waiter);
              fail(new Error("Timed out waiting for "+type));
            },timeout);
            pending.push(waiter);
          });
        },
        close(){req.destroy();res.destroy();}
      });
    });
    req.on("error",reject);
    req.end();
  });
}
async function serve(service,hub) {
  const server=createServer(createHandler(service,auth,hub));
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {port:server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}

test("two separate authenticated streams receive a message-available hint and support REST replay",async()=>{
  const messages=[];
  const denied=new Set(["outsider"]);
  const service={
    async authorizeEvents(subject,conversationId){
      if(conversationId!==CONVO||denied.has(subject))throw new ApiError(404,"not_found");
      return true;
    },
    async messages(subject,conversationId,afterSequence){
      await this.authorizeEvents(subject,conversationId);
      return messages.filter(m=>m.sequenceNumber>afterSequence);
    }
  };
  const hub=createLiveHub({heartbeatMs:1000});
  const server=await serve(service,hub);
  let a,b,reconnected;
  try{
    const stranger=await openSse(server.port,"outsider");
    assert.equal(stranger.status,404);stranger.close();
    a=await openSse(server.port,"person-a");
    b=await openSse(server.port,"person-b");
    await Promise.all([a.wait("ready"),b.wait("ready")]);
    assert.equal(hub.size,2);
    const msg={id:KEY_ID,conversationId:CONVO,sequenceNumber:1,
      senderId:"person-a",body:"hello",sentAt:new Date().toISOString()};
    messages.push(msg);
    const count=await hub.publish({
      type:"conversation.message.accepted",conversationId:CONVO,
      payload:{messageId:KEY_ID,sequenceNumber:1}
    });
    assert.equal(count,2);
    const [fromA,fromB]=await Promise.all([a.wait("message-available"),b.wait("message-available")]);
    assert.deepEqual(fromA.data,fromB.data);
    assert.equal(fromA.data.messageId,KEY_ID);
    assert.equal(fromA.data.body,undefined);
    a.close();b.close();
    // Missed stream delivery while offline does not delete committed messages.
    messages.push({...msg,id:"second",sequenceNumber:2,body:"later"});
    reconnected=await openSse(server.port,"person-b");
    await reconnected.wait("ready");
    const recovered=await fetch("http://127.0.0.1:"+server.port+
      "/v1/conversations/"+CONVO+"/messages?afterSequence=1",
      {headers:{Authorization:"Bearer "+token("person-b")}});
    assert.equal(recovered.status,200);
    assert.deepEqual((await recovered.json()).map(x=>x.sequenceNumber),[2]);
    denied.add("person-b");
    assert.equal(await hub.publish({
      type:"conversation.message.accepted",conversationId:CONVO,
      payload:{messageId:"third",sequenceNumber:3}
    }),0);
  }finally{
    a?.close();b?.close();reconnected?.close();
    hub.closeAll();await server.close();
  }
});
test("slow or excessive subscribers cannot grow without bound",async()=>{
  const hub=createLiveHub({maxTotal:1,maxPerSubject:1,heartbeatMs:1000});
  const service={authorizeEvents:async()=>true};
  const server=await serve(service,hub);
  let a,b;
  try{
    a=await openSse(server.port,"a");
    await a.wait("ready");
    b=await openSse(server.port,"b");
    assert.equal(b.status,429);
    assert.equal(hub.size,1);
  }finally{
    a?.close();b?.close();hub.closeAll();await server.close();
  }
});

/**
 * Bridge internal, single-process authenticated SSE notification hub.
 * Notification contains no message text. Clients must fetch durable messages
 * by sequence *after* receiving the 'ready' event and on every reconnect.
 * Not a multi-instance broker and not a replacement for PostgreSQL.
 */
export function createLiveHub({maxTotal = 100,maxPerSubject = 2,heartbeatMs = 20_000}={}) {
  if (![maxTotal,maxPerSubject,heartbeatMs].every(Number.isInteger) ||
      maxTotal < 1 || maxPerSubject < 1 || heartbeatMs < 1000) {
    throw new TypeError("Invalid SSE configuration");
  }
  const rooms = new Map();
  const bySubject = new Map();
  const subscribers = new Set();
  const remove = item => {
    if (!subscribers.delete(item)) return;
    clearInterval(item.heartbeat);
    const inRoom = rooms.get(item.conversationId);
    if(inRoom){inRoom.delete(item);if(!inRoom.size)rooms.delete(item.conversationId);}
    const inAccount = bySubject.get(item.subject);
    if(inAccount){inAccount.delete(item);if(!inAccount.size)bySubject.delete(item.subject);}
  };
  const close = item => {
    remove(item);
    if (!item.res.writableEnded && !item.res.destroyed) item.res.end();
  };
  const write = (item, type, data) => {
    if (!subscribers.has(item) || item.res.writableEnded || item.res.destroyed) {
      close(item);
      return false;
    }
    try {
      const frame = "event: "+type+"\ndata: "+JSON.stringify(data)+"\n\n";
      if (!item.res.write(frame)) {
        // Do not hold unbounded streams open when clients stop reading.
        close(item);
        return false;
      }
      return true;
    } catch {
      close(item);
      return false;
    }
  };
  const allowed = async item => {
    try {await item.authorize();return true;}
    catch {close(item);return false;}
  };
  return {
    get size(){return subscribers.size;},
    async open({subject,conversationId,req,res,authorize}) {
      if (!subject || !conversationId || typeof authorize!=="function") throw new TypeError("Invalid subscription");
      await authorize(); // MUST authorize before response headers are written.
      if(subscribers.size>=maxTotal || (bySubject.get(subject)?.size||0)>=maxPerSubject) {
        res.statusCode=429;
        res.setHeader("Content-Type","application/json");
        res.setHeader("Cache-Control","no-store");
        res.end(JSON.stringify({error:"stream_limit"}));
        return false;
      }
      res.writeHead(200,{
        "Content-Type":"text/event-stream; charset=utf-8",
        "Cache-Control":"no-cache, no-store, must-revalidate",
        "Connection":"keep-alive",
        "X-Content-Type-Options":"nosniff",
        "X-Accel-Buffering":"no"
      });
      const item={subject,conversationId,res,authorize,heartbeat:null};
      subscribers.add(item);
      if(!rooms.has(conversationId))rooms.set(conversationId,new Set());
      rooms.get(conversationId).add(item);
      if(!bySubject.has(subject))bySubject.set(subject,new Set());
      bySubject.get(subject).add(item);
      res.on("close",()=>remove(item));
      req.on("aborted",()=>close(item));
      // 'ready' always precedes a REST fetch by the client. Subscribing BEFORE
      // fetching closes the race between the replay and live notifications.
      write(item,"ready",{conversationId,replay:"GET /v1/conversations/:id/messages?afterSequence=<cursor>"});
      item.heartbeat=setInterval(async()=>{
        if (!subscribers.has(item))return;
        if(!await allowed(item))return;
        write(item,"heartbeat",{});
      },heartbeatMs);
      item.heartbeat.unref?.();
      return true;
    },
    async publish(event){
      if(event?.type!=="conversation.message.accepted" ||
         !event.conversationId || typeof event.payload?.messageId!=="string" ||
         !Number.isSafeInteger(event.payload?.sequenceNumber) ||
         event.payload.sequenceNumber<1) throw new TypeError("Invalid delivery event");
      // Publishing with zero live subscribers is safe: the messages API is the
      // durable recovery channel. Events are hints only.
      const clients=[...(rooms.get(event.conversationId)||[])];
      let pushed=0;
      for(const item of clients){
        if(!await allowed(item))continue;
        if(write(item,"message-available",{
          conversationId:event.conversationId,
          messageId:event.payload.messageId,
          sequenceNumber:event.payload.sequenceNumber
        }))pushed++;
      }
      return pushed;
    },
    closeAll(){
      for(const item of [...subscribers])close(item);
    }
  };
}

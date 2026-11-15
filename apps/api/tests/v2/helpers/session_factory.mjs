/** Synthetic V2 contract fixtures, NOT implementation data structures. */
export function randomSession({
  id = "random-room", a = "a", b = "b", activatedAt = 0,
  lastAcceptedAt = activatedAt, state = "active", seenIds = [],
  messageIds = ["original-stranger-1", "original-stranger-2"]
} = {}) {
  return { id, kind: "random", participants: [a,b], state,
    activatedAt, lastAcceptedAt, seenIds: [...seenIds],
    messageIds: [...messageIds] };
}
export function relationship({
  id = "connection-1", a = "a", b = "b",
  state = "active"
} = {}) {
  return { id, members:[a,b], state };
}
export function directSession({
  id = "direct-1", connectionId = "connection-1",
  a = "a", b = "b", lastAcceptedAt = 0,
  state = "active", messageIds = []
} = {}) {
  return {id, connectionId, kind:"direct", participants:[a,b],
    state, lastAcceptedAt, messageIds:[...messageIds]};
}
export function delivery({
  id="envelope-1", messageId="direct-msg-1", recipientId="b",
  acceptedAt=0, acknowledgedAt=null, status="unread",
  connectionId="connection-1", recoveryNonce="nonce-1"
}={}) {
  return {id,messageId,recipientId,acceptedAt,acknowledgedAt,
    status,connectionId,recoveryNonce};
}
export function reportToken({
  reporterId="a", sessionId="random-room", endedAt=0,
  valid=true, scope="report", opaqueId="token-1"
}={}) {
  return {reporterId,sessionId,endedAt,valid,scope,opaqueId};
}
export function legacyQaFixture() {
  return {
    accounts: [{id:"qa-a"}, {id:"qa-b"}],
    sessions: [randomSession({
      id:"legacy-random",a:"qa-a",b:"qa-b",
      messageIds:["msg-1","msg-2","msg-3","msg-4"]
    })],
    activeSlots:[{accountId:"qa-a",sessionId:"legacy-random"},
                 {accountId:"qa-b",sessionId:"legacy-random"}],
    messages:[{id:"msg-1",body:"SYNTHETIC_1"},
              {id:"msg-2",body:"SYNTHETIC_2"},
              {id:"msg-3",body:"SYNTHETIC_3"},
              {id:"msg-4",body:"SYNTHETIC_4"}]
  };
}

import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/limiter.mjs";
import { ApiError } from "../src/auth.mjs";

test("reports and match requests have independently bounded lab limits", () => {
  let clock=1000;
  const limit=createLimiter(()=>clock);
  for(let i=0;i<5;i++)limit("user-a","POST","/v1/reports");
  assert.throws(()=>limit("user-a","POST","/v1/reports"),e=>e instanceof ApiError&&e.status===429);
  for(let i=0;i<12;i++)limit("user-a","POST","/v1/matches/search");
  assert.throws(()=>limit("user-a","POST","/v1/matches/search"),e=>e instanceof ApiError&&e.status===429);
  limit("user-b","POST","/v1/reports");
  clock+=3600000;
  limit("user-a","POST","/v1/reports");
  limit("user-a","POST","/v1/matches/search");
});
test("request groups are distinct, default GET has its own budget", () => {
  const limit=createLimiter(()=>0);
  for(let i=0;i<90;i++)limit("a","POST","/v1/conversations/id/messages");
  assert.throws(()=>limit("a","POST","/v1/conversations/id/messages"),ApiError);
  limit("a","GET","/v1/bootstrap");
});

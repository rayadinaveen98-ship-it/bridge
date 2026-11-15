import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Test reads checked-in SQL text ONLY. No DB connections and no writes.
const root=new URL("../../../../",import.meta.url);
const migration=name=>readFileSync(new URL(
  "database/migrations/"+name,root),"utf8");
const oldSchema=[
  migration("0001_bridge_foundation.sql"),
  migration("0002_message_outbox.sql"),
  migration("0003_lab_credentials.sql")
].join("\n");

const EXPECTED=[
  "bridge_accounts","bridge_profiles","bridge_supported_languages",
  "bridge_account_languages","bridge_preferences","bridge_blocks",
  "bridge_match_sessions","bridge_active_match_slots","bridge_match_queue",
  "bridge_conversations","bridge_conversation_participants",
  "bridge_messages","bridge_connection_votes","bridge_connections",
  "bridge_reports","bridge_enforcement_actions","bridge_audit_events",
  "bridge_privacy_requests","bridge_event_outbox",
  "bridge_lab_credentials"
].sort();

test("schema inventory: checked-in 0001–0003 define exactly 20 Bridge tables",()=>{
  const tables=[...oldSchema.matchAll(/CREATE TABLE\s+(bridge_[a-z_]+)\s*\(/g)]
    .map(x=>x[1]).sort();
  assert.deepEqual(tables,EXPECTED);
  for(const name of tables) {
    assert.match(oldSchema,new RegExp(
      "ALTER TABLE\\s+"+name+"\\s+ENABLE ROW LEVEL SECURITY","i"));
  }
});

test("schema inventory: current message body is in legacy table, no V2 payload split yet",()=>{
  assert.match(oldSchema,/CREATE TABLE bridge_messages\s*\([\s\S]*?body text NOT NULL/);
  assert.match(oldSchema,/CREATE TABLE bridge_conversations\s*\([\s\S]*?kind bridge_conversation_kind/);
  assert.doesNotMatch(oldSchema,/CREATE TABLE bridge_(?:unread_deliveries|history_consents|message_payloads|report_evidence)/);
  assert.doesNotMatch(oldSchema,/idle_expires_at/);
  assert.match(oldSchema,/CREATE UNIQUE INDEX bridge_active_connections_pair_idx/);
});

test("schema inventory: old match reservation lease is not a random chat idle timer",()=>{
  assert.match(oldSchema,/lease_expires_at timestamptz NOT NULL/);
  assert.match(oldSchema,/activated_at timestamptz/);
  assert.match(oldSchema,/expires_at timestamptz/);
  assert.doesNotMatch(oldSchema,/last_accepted_at timestamptz/);
  // Actual V2 body retention and expiry migrations are NOT part of V2-01.
});

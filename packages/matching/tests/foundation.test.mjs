import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fromRoot = path => readFileSync(new URL("../../../" + path, import.meta.url), "utf8");

test("every core table explicitly enables row level security", () => {
  const sql = fromRoot("database/migrations/0001_bridge_foundation.sql");
  const tables = [...sql.matchAll(/CREATE TABLE (bridge_[a-z_]+)/g)].map(match => match[1]);
  assert.ok(tables.length >= 15, "expected substantial normalized schema");
  for (const table of tables) {
    assert.ok(sql.includes("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY;"), table);
  }
});
test("database defines unique active match slots and idempotent messages", () => {
  const sql = fromRoot("database/migrations/0001_bridge_foundation.sql");
  assert.match(sql,/CREATE TABLE bridge_active_match_slots \(\s*account_id uuid PRIMARY KEY/s);
  assert.match(sql,/UNIQUE \(conversation_id,sender_id,client_message_id\)/);
  assert.match(sql,/bridge_supported_languages/);
  assert.match(sql,/moderation_ready boolean NOT NULL DEFAULT false/);
  assert.match(sql,/bridge_connection_votes/);
});
test("design tokens have themes and accessible-motion hook", () => {
  const tokens = JSON.parse(fromRoot("design/tokens/bridge.v1.json"));
  assert.ok(tokens.color.dark.background.$value);
  assert.ok(tokens.color.light.background.$value);
  assert.equal(tokens.motion.reduced.$value,"0ms");
});
test("M1 contract lists authorization and safety routes", () => {
  const contract = fromRoot("docs/engineering/M1_API.md");
  for (const path of ["/matches/search","/conversations/:id/messages","/blocks/:targetId","/reports"]) {
    assert.ok(contract.includes(path),path);
  }
});

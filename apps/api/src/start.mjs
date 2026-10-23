import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHandler } from "./http.mjs";
import { createPostgresService } from "./postgres.mjs";

const required=["BRIDGE_DATABASE_URL","BRIDGE_AUTH_PUBLIC_KEY_FILE","BRIDGE_AUTH_ISSUER","BRIDGE_AUTH_AUDIENCE"];
for(const key of required) if(!process.env[key])throw new Error("Missing required configuration: "+key);
const host=process.env.BRIDGE_BIND_HOST||"127.0.0.1";
if(host!=="127.0.0.1" && host!=="::1")throw new Error("Bridge M1 must listen on loopback only");
const port=Number(process.env.BRIDGE_PORT||"8787");
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid BRIDGE_PORT");
// Require pg only when starting the real database-backed service, not running offline tests.
const { Pool }=await import("pg");
const pool=new Pool({
  connectionString:process.env.BRIDGE_DATABASE_URL,
  max:5,
  connectionTimeoutMillis:5000,
  idleTimeoutMillis:30000,
  statement_timeout:5000
});
await pool.query("SELECT 1");
const service=createPostgresService(pool,error=>console.error("Bridge backend error",error?.code||error?.name||"unknown"));
const server=createServer(createHandler(service,{
  publicKeyPem:readFileSync(process.env.BRIDGE_AUTH_PUBLIC_KEY_FILE,"utf8"),
  issuer:process.env.BRIDGE_AUTH_ISSUER,
  audience:process.env.BRIDGE_AUTH_AUDIENCE
}));
server.requestTimeout=15000;
server.headersTimeout=10000;
server.keepAliveTimeout=5000;
server.maxRequestsPerSocket=100;
server.listen(port,host,()=>console.log("Bridge internal API listening on "+host+":"+port));
for(const sig of ["SIGINT","SIGTERM"])process.once(sig,()=>server.close(()=>pool.end()));

#!/usr/bin/env node
/**
 * Bridge two-account lab: Windows laptop is tester_b; Android phone tester_a.
 * This script never provisions accounts, bypasses age gates, or logs tokens.
 * Requires the existing private Bridge backend at 127.0.0.1:8787.
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { BridgeLabDesktopClient } from "../src/lab_desktop_client.mjs";

function readHiddenPassphrase(label) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run from an interactive Windows PowerShell terminal");
  }
  return new Promise((resolve,reject) => {
    let secret = "";
    const oldRaw = Boolean(stdin.isRaw);
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    function finish(error) {
      stdin.removeListener("data", onData);
      stdin.setRawMode(oldRaw);
      stdout.write("\n");
      if (error) reject(error); else resolve(secret);
    }
    function onData(bytes) {
      const chars = bytes.toString("utf8");
      for (const char of chars) {
        if (char === "\u0003") return finish(new Error("Stopped by user"));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\b" || char === "\u007f") {
          if (secret.length) {
            secret = secret.slice(0,-1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (/^[A-Za-z0-9_-]$/.test(char) && secret.length < 256) {
          secret += char;
          stdout.write("*");
        }
      }
    }
    stdin.on("data", onData);
  });
}

const api = new BridgeLabDesktopClient();
let rl, refreshTimer, running = true;
async function main() {
  console.log("\nBRIDGE | One-phone messaging lab");
  console.log("Phone: tester_a       Windows laptop: tester_b");
  console.log("Everything stays local. No public users or personal credentials.\n");
  await api.health();
  console.log("Bridge backend healthy at http://127.0.0.1:8787");
  console.log("Use the randomly generated tester_b passphrase from the FIRST lab setup.");
  let secret = await readHiddenPassphrase("tester_b passphrase (hidden): ");
  try {
    await api.login("tester_b",secret);
  } finally { secret = ""; }
  console.log("Laptop tester_b signed in.");
  await api.prepareEnglish();
  console.log("English enabled for tester_b.");
  console.log("\nON YOUR PHONE NOW:");
  console.log("1. Open Bridge as tester_a.");
  console.log("2. Select English + Chat.");
  console.log("3. Tap 'Find a conversation'.");
  console.log("Desktop matching retries automatically when the 2-minute queue expires.\n");

  let status=await api.search();
  let checks=0;
  while (!api.conversationId) {
    await sleep(2000);
    status=await api.searchStatus();
    if (status.state === "expired" || status.state === "cancelled" ||
        status.state === "unmatched") {
      status=await api.search();
      console.log("Search renewed. Tap Find on phone if its search expired.");
    } else if (++checks % 10 === 0) {
      console.log("Waiting for tester_a to start searching on the phone...");
    }
  }
  console.log("\nMATCHED! You can now chat between phone and laptop.");
  const peer=await api.peer();
  console.log("Peer:",peer.pseudonym,"(tester_a phone)");
  console.log("Type any message and Enter to send. Incoming messages appear automatically.");
  console.log("Commands: /keep  /refresh  /report  /block  /end  /quit\n");

  let refreshing=false;
  const refresh=async()=>{
    if(refreshing||!running)return;
    refreshing=true;
    try {
      // A maximum of 50 messages per API page. Continue until all fetched.
      for(let p=0;p<10;p++){
        const messages=await api.messages();
        for(const m of messages){
          const who=m.senderId===peer.accountId?"PHONE":"LAPTOP";
          console.log("\n"+who+": "+m.body);
          rl?.prompt(true);
        }
        if(messages.length<50)break;
      }
    } catch (e) {
      console.log("\nMessage refresh:",e.message);
      if(e.status===401||e.status===403||e.status===404)running=false;
    } finally {refreshing=false;}
  };
  rl=readline.createInterface({input:stdin,output:stdout,terminal:true,prompt:"tester_b > "});
  await refresh();
  refreshTimer=setInterval(()=>{void refresh()},1500);
  rl.prompt();
  for await(const line of rl){
    const entered=line.trim();
    if (!running)break;
    try {
      if(entered === "/quit") {
        console.log("Desktop session ended. The chat may remain open; use /end to close it.");
        break;
      } else if(entered === "/end") {
        await api.endChat();
        console.log("Conversation ended and active match slots released.");
        break;
      } else if(entered === "/keep") {
        const result=await api.vote("accept");
        console.log(result.status==="connected" ?
          "Both users accepted. Connection saved." : "Your request saved; phone must also accept.");
      } else if(entered === "/report") {
        const result=await api.report(peer.accountId,"other");
        console.log("Synthetic report queued:",result.state);
      } else if(entered === "/block") {
        const confirm=await rl.question("Block the test peer and stop this chat? (type YES): ");
        if(confirm==="YES"){
          await api.block(peer.accountId);
          console.log("Block applied server-side; new messages should be denied.");
          break;
        }
      } else if(entered === "/refresh"||!entered) {
        await refresh();
      } else if(entered === "/help"){
        console.log("Type a message, or /keep /refresh /report /block /end /quit");
      } else if(entered.startsWith("/")) {
        console.log("Unknown command. Type /help");
      } else {
        const sent=await api.send(entered);
        console.log("Sent as message #"+sent.sequenceNumber);
        await refresh();
      }
    } catch(e) {
      console.log("Request failed:",e.message);
      console.log("If a send timed out, enter the SAME text again to retry safely.");
    }
    if(running)rl.prompt();
  }
}

try { await main(); }
catch (error) {
  console.error("\nBridge laptop test failed:",error.message);
  console.error("Check backend, USB reverse and tester_b passphrase. Do not share secrets.");
  process.exitCode=1;
} finally {
  running=false;
  if(refreshTimer)clearInterval(refreshTimer);
  rl?.close();
}

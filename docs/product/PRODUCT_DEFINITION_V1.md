# Product definition V1

## Vision
Help adults discover interesting people through low-pressure, pseudonymous conversations and continue a relationship only when both choose to.

## Pillars
1. **Discover:** Quick Chat plus Topic Match; fast, honest matching without fake people.
2. **Converse:** clean messaging, optional prompts, easy leave/block/report.
3. **Connect:** double-opt-in requests create persistent conversations with clear withdrawal/block controls.

## Primary loop
Eligibility → policy acknowledgment → nickname/avatar → explicitly selected conversation languages and optional interests → Discover → searching → server-authorized session → exchange messages → leave or request → mutual consent → reconnect.

## V1 inventory (18 destinations)
Welcome; age eligibility; safety agreement; identity; preferences; Discover; topics; matchmaking; active chat; chat actions; end-of-chat; connections; direct messages; profile; settings; safety/help; report; account management.

## V1 boundaries
- No live users, authentication, verified age gate or moderation exist in the HTML prototype.
- Production must handle timeout, unmatched queue, reconnect, duplicate matching prevention, message ordering, skipped users, blocks, abuse and network failures.
- Languages are explicitly chosen and never covertly ranked; production supports only languages with verified safety and accessible user support.
- Topic/interest is a soft compatibility signal; a shared selected language and restrictions are hard constraints.

## Prototype test questions
- Can a first-time user understand anonymous-to-peers versus accountable-to-platform?
- Is language selection accessible and free of implied hierarchy?
- How quickly can someone start/leave a chat or report abuse?
- Are saved connections understood as explicitly mutual?
- Which of Quick Chat or Topic Match produces better completed conversations?

## Core pilot metrics (hypotheses, not benchmarks)
Matching success and median/p90 waiting time; conversation completion; D1/D7/D30 retention; double-opt-in conversion; report rates; response latency; paid-conversion/cost-of-service.

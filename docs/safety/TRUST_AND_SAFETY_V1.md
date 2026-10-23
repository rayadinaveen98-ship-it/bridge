# Trust, privacy and moderation requirements V1

**No public real-user chat before these foundations are working and staffed.** The offline HTML demonstration does not implement security measures.

## Adult access and policy
- Provide a compliant adult-eligibility/age-assurance method; the demo checkbox is not verification.
- Obtain actual review of applicable Google Play content-safety, UGC and child-safety requirements and local law.
- Avoid assuming any iOS approval: Apple's published rules create heightened risk for primarily random/anonymous chat.

## Abuse prevention
- Rate limits, bot friction, incident reporting, block enforcement, repeat offender prevention.
- Reports available in active chat, persistent DMs and settings; clearly communicate outcomes and appeal processes.
- Human moderation dashboard with role boundaries, investigation audit logs, defined urgent response/escalation coverage and reviewer training.
- No unsolicited media, open links or video until a separate risk assessment passes.

## Privacy
- Public pseudonyms separate from internal account identifiers; collect only necessary data.
- A documented retention schedule for ephemeral conversations and report evidence; honor legal preservation requirements and disclose them.
- Secure recovery/deletion/export processes, access logging and privacy request tracking.
- Avoid private message-body analytics; use aggregate event telemetry where practical.
- No unreviewed AI conversation profiling or deceptive impersonation.

## Security gate
- OWASP MASVS/mobile threat review; pen test scoped to auth/session/chat/authorization; resilience testing; audit of privileged admin actions.
- Server-side block and age restriction enforcement; no client-only checks.
- Incident response plan and explicit owner of safety operations.

## Important claim boundary
A report submitted in the offline prototype is not received by moderators. Pseudonymous chat is not inherently E2EE. No production safety guarantee exists yet.

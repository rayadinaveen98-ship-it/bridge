# Laboratory abuse controls — initial baseline

The M1 HTTP gateway applies per-verified-subject in-memory limits: match attempts 12/minute, messages 90/minute, reports 5/hour, other calls 240/minute.

These limits only protect a **single local process**. They do not protect against account farms, app restarts, distributed deployment, stolen credentials, signup abuse, scraping, or denial-of-service. Because /healthz is intentionally unauthenticated, deploy behind a private firewall.

**Production requirement:** centrally enforced quotas and bot-risk evaluation, per-account and device abuse controls, trusted ingress limits, observed counters and appeal workflows. Moderator availability and child-safety compliance are not yet implemented. No public launch is authorized.

# Prototype test suite

These are **offline browser interaction tests**, not security, backend or production compliance tests.

## Run locally

```bash
python -m pip install -r tests/requirements.txt
python -m playwright install chromium
python -m pytest -q tests/
```

Tests cover the welcome/age checkbox *demo*, screen navigation, matching simulation, message simulation, dummy reporting, mutual reconnect, block edge case, multilingual selection, and mobile layout.

Screenshots are generated under `tests/artifacts/` (gitignored). Source files are in `prototype/bridge-v1.html`.

Do not interpret these passes as proof of live age verification, real chat, secure accounts, moderation, production store eligibility, or real user retention.

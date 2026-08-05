# OpenCode peer

OpenCode participates like any peer: the **instruction path** (a one-liner in
its `AGENTS.md` pointing at the mesh's `manifest.md` + the protocol) plus the
[portable watcher](../watch/) for the wake. It reads `AGENTS.md` natively and
runs `sp`, so no bespoke hook is needed.

- Non-interactive runs need `opencode run --auto` (auto-approve tool
  permissions) — without it, opencode blocks on approval that never comes.
- Feed `</dev/null` on stdin for headless runs so nothing waits on input.
- Sandboxed writes are handled by [option B](../../SPEC.md) (`sp flush` at the
  edge) like any other agent.
- **Use a provider that streams.** opencode's google provider reads its key from
  `GOOGLE_GENERATIVE_AI_API_KEY` (not `GEMINI_API_KEY`) — alias it if needed:
  `export GOOGLE_GENERATIVE_AI_API_KEY="$GEMINI_API_KEY"`.

## UAT note (2026-08-05) — proven headless; watch the provider, not opencode

`opencode run` (non-interactive) drives the **full swarmpost loop autonomously**
— `sp inbox` → `sp read` → compute → `sp reply` — verified end-to-end with
`-m google/gemini-2.5-flash` in ~10s.

Earlier runs *appeared* to hang, but it was **per-model provider health**, not
opencode and not swarmpost. Verified end-to-end headless: `kimi-k2.7-code`,
`glm-5.2`, and `google/gemini-2.5-flash` all drive the full loop. What actually
went wrong, model by model, confirmed by probing the gateway
(`https://opencode.ai/zen/go/v1/chat/completions`) directly:

- **`opencode-go/grok-4.5`** → gateway returns **HTTP 503** in ~0.3s:
  *"Upstream request failed: Endpoint is unavailable."* The grok backend is down.
  opencode treats 503 as retryable and **retries with backoff**, so from the
  outside it looks like an indefinite hang (process idle in `epoll_wait` between
  retries) when it's really a provider outage. Pick a different model.
- **`opencode-go/glm-5.2`** → gateway returns **HTTP 200** in ~2.4s and the loop
  completes headless. The earlier "glm hang" was a **misdiagnosis** — it was
  mid-`reasoning_content` (glm spends its whole budget reasoning before emitting
  content) and got killed too early. Give reasoning models time.
- **`google/*`** direct works once `GOOGLE_GENERATIVE_AI_API_KEY` is set.

Lesson: a "hang" can be a fast upstream **503 being retried**. Probe the
provider endpoint directly (`curl` the `/chat/completions` route) before blaming
the client or the transport.

Diagnosis rule: when a headless agent looks stuck, check the **mail-branch
commits** and the process's open sockets — never the (buffered, non-streaming)
terminal.

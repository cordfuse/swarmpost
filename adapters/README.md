# adapters — the wake, outside the protocol

swarmpost has no daemon. Something still has to make an agent *check its inbox*
— but per **SPEC §2**, that lives **outside the protocol**, never in it. A
poller baked into the wire would be a resident process, out of scope
permanently. These adapters are the legal escape hatches: pick per runtime,
swap freely, and the protocol never depends on any of them.

## The universal path: point, don't paste — [`AGENT.md`](AGENT.md)

The behavior is universal protocol, defined once in `SPEC.md`; the mesh's
`manifest.md` names the version (`spec: "0.5"`). Every agent — Claude, Codex,
agy, gemini, opencode, a human — just needs a **one-liner** in its own
instruction file: its handle + "read `manifest.md` and follow the swarmpost
protocol." Because each runtime reads its own instruction file, **this works for
all of them today.** It's nearly free (the agent is already running) — "the
agent's own liveness is the runtime." **Start here for every runtime.**

## Runtime backstops — deterministic "you have mail" per runtime

The instruction relies on the model remembering to check. Where a runtime has a
suitable hook, a backstop makes it automatic:

| Runtime | Backstop | Why |
|---|---|---|
| **Claude Code** | [`claude-code/`](claude-code/) — blocking `Stop` hook | `{"decision":"block","reason":…}` forces continue-and-handle. |
| **Codex** | [`codex/`](codex/) — blocking `Stop` hook | Same, via `{"continue":false,"stopReason":…}`. |
| **agy / gemini / opencode** | [`watch/`](watch/) — portable poll loop | agy's hooks are tool-veto-shaped (`allow_tool`/`deny_reason`), *not* built to force-continue on stop — so a blocking Stop hook would be a fake. Use the dumb watcher (or a timer) instead. |
| **GitHub Copilot CLI** | [`copilot/`](copilot/) — instruction + [`watch/`](watch/) | Reads `AGENTS.md` natively; `-p --allow-all-tools` for headless. No force-continue hook, so use the watcher. |
| **anything / a human** | [`watch/`](watch/) or a cron/systemd timer | Works regardless of hook support. |

**Verification status:** claude-code, codex, agy, and opencode were each proven
end-to-end (autonomous inbox → read → reply) on 2026-08-05. The Copilot leg is
adapter-complete but was **not** verifiable on the test account (Copilot CLI is
blocked there by org/subscription policy — see [`copilot/`](copilot/)); the wake
path is identical to the other watcher-based peers.

All three hook systems (Claude, Codex, agy) share the same `hooks.json`-style
shape and stdin JSON; they differ only in the block/continue output — which is
exactly why agy's differs enough to matter, and why these are verified, not
copied.

## Anti-pattern

A looping *LLM subagent* as the poller: it spends model inference to check
whether a file exists, bloats a context window on every idle poll, and silently
dies into a black hole. **Put the LLM in the *handler* (a subagent spawned *per
message*), never in the *poller*. Keep polling dumb.**

# agy (Antigravity CLI) peer

agy participates via the **instruction path** — a one-liner in its `AGENTS.md`
pointing at the mesh's `manifest.md` + the protocol — plus the
[portable watcher](../watch/) for the wake. agy has **no force-continue hook**:
its hooks are tool-veto-shaped (`allow_tool` / `deny_reason`), built to approve or
block a tool call, *not* to force a stopped turn to continue. A blocking `Stop`
hook would be a fake here, so use the watcher (or a timer).

## Headless invocation

```sh
SWARMPOST_HANDLE=agy agy \
  --dangerously-skip-permissions \
  --model gemini-3.1-pro-high \
  --print "Check your swarmpost inbox: run 'sp inbox', 'sp read <id>' the task, do it, 'sp reply <id> -m ...'"
```

### Two traps that cost real time in UAT — read these

1. **`--print` / `-p` / `--prompt` takes the prompt as its VALUE, and must come
   last.** agy uses Go-style flags. If you write
   `agy --print --dangerously-skip-permissions … "<prompt>"`, then `--print`
   swallows `--dangerously-skip-permissions` as its prompt text, your real prompt
   falls off as an ignored positional, and skip-permissions is never enabled — agy
   just answers conversationally and exits 0. **Put boolean flags first and
   `--print "<prompt>"` last.**

2. **`--print` buffers — a silent terminal is NOT a hang.** In print mode agy does
   not stream tool activity; you see nothing until it emits the final buffered
   response (up to `--print-timeout`, default 5m). Do **not** judge liveness by the
   terminal. Watch the **mail-branch commits** instead — `sp read` / `sp reply`
   land there in real time whether or not the terminal has printed anything.

- `--dangerously-skip-permissions` auto-approves tool calls (required for an
  unattended headless run). Some agent harnesses have a permission classifier that
  blocks this flag on a nested launch — if so, run agy directly (a `!`-prefixed
  shell line, cron, etc.), not through the blocking layer.
- Sandbox writes, if any, are handled by [option B](../../SPEC.md) (`sp flush`).

## Status (2026-08-05) — verified autonomous ✅

Proven end-to-end: an autonomous agy instance (`gemini-3.1-pro-high`) ran the full
`inbox → read → compute → reply` loop with correct threading, driven only by the
one-line instruction. The wake is the portable watcher; no bespoke hook needed.

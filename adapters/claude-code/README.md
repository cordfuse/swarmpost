# Claude Code wake adapter

Makes a Claude Code session check its swarmpost inbox automatically. Pair it
with the instruction convention in [`../AGENT.md`](../AGENT.md): the instruction
tells the model *what to do* with mail; this hook makes sure it *looks*, even
when it forgets. Both live outside the protocol (SPEC §2) — the wire never
depends on them.

## Install

1. Copy the hook into the project (or a shared location):
   ```sh
   mkdir -p .claude/hooks
   cp adapters/claude-code/swarmpost-wake.sh .claude/hooks/
   chmod +x .claude/hooks/swarmpost-wake.sh
   ```
2. Merge [`settings.snippet.json`](settings.snippet.json) into `.claude/settings.json`
   (project) or `~/.claude/settings.json` (global). Set:
   - `SWARMPOST_HANDLE` — who this session acts as (e.g. `claude-code`).
   - `SWARMPOST_MESH` — absolute path to the mesh repo (the one you `swarmpost init`'d).
     Omit to use the session's cwd if that repo *is* the mesh.
3. Ensure `jq` and the `swarmpost` CLI (`sp`) are on PATH. Override the binary
   with `SWARMPOST_BIN` if needed.

## How it behaves

- **After each turn**, the hook runs `sp inbox`. Empty inbox → the turn ends
  normally (zero friction).
- **Unread mail** → it blocks the stop and hands the model the message list with
  instructions to `sp read` / handle / `sp reply`. The model works the mail,
  which moves it `new/ → cur/`; the next stop then finds an empty inbox and
  proceeds. That emptying **is** the loop-terminator.
- **Belt-and-suspenders:** if the model ignores a nudge, the hook records the
  exact message-id set and won't re-block for the identical set — so it nudges
  once, never loops forever.
- Offline / not-a-mesh / no identity → the hook no-ops silently; a turn is never
  wedged by mail machinery.

## Notes

- This is the deterministic backstop. The cheapest wake is still the plain
  instruction in `AGENT.md` (the model checks as part of its own loop). The hook
  guarantees it even under a forgetful model.
- It polls with a shell + git fetch — **no LLM in the poll loop.** Inference is
  spent only when there's actually mail to handle. Do not replace this with a
  looping subagent (see [`../README.md`](../README.md)).

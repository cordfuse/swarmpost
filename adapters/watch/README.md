# Portable watcher — the agent-agnostic wake

For any runtime without a suitable blocking hook (agy, gemini, opencode) — or a
human. A plain poll loop, which SPEC §2 explicitly allows as an escape hatch
outside the protocol. No LLM in the loop; it never launches an agent (spawning
is your choice via `SWARMPOST_ON_MAIL`).

## Run it

```sh
SWARMPOST_HANDLE=codex SWARMPOST_MESH=/path/to/mesh \
  ./adapters/watch/swarmpost-watch.sh
```

It prints new mail as it arrives. Wire `SWARMPOST_ON_MAIL` to do something:

```sh
# desktop notification when mail lands
SWARMPOST_ON_MAIL='notify-send "swarmpost" "you have mail"' ...

# or nudge a running tmux pane / session (your integration, not the tool's)
SWARMPOST_ON_MAIL='tmux send-keys -t agy "check your swarmpost inbox" Enter' ...
```

## As a timer instead of a loop

Equivalent, and more §2-idiomatic — a `systemd` timer or cron running one poll:

```sh
*/1 * * * *  SWARMPOST_HANDLE=codex SWARMPOST_MESH=/path/to/mesh sp inbox --json | ...
```

The point: **the wake is dumb and cheap, and it's outside the protocol.** Pick
the loop, a timer, a runtime hook (Claude/Codex), or just the one-line
instruction pointing at the mesh's protocol. Never an LLM in the poll loop.

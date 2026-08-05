#!/usr/bin/env bash
# Portable swarmpost watcher — the agent-agnostic wake (SPEC §2 escape hatch:
# a plain poll loop, like cron/systemd). Works for ANY runtime — agy, gemini,
# opencode, a human — regardless of whether it has a hook system.
#
# Loops: sync + inbox. On a NEW set of unread mail it prints the summary and,
# if you set SWARMPOST_ON_MAIL, runs that command. It NEVER launches or
# supervises an agent itself — spawning is the operator's choice via
# SWARMPOST_ON_MAIL, kept outside the tool (SPEC §2: delivery, never behavior).
# No LLM runs in this loop; inference happens only in whatever you wire up.
#
# Env:
#   SWARMPOST_HANDLE    who to poll for (required)
#   SWARMPOST_MESH      mesh repo path (default: cwd)
#   SWARMPOST_BIN       swarmpost binary (default: sp)
#   SWARMPOST_INTERVAL  seconds between polls (default: 30)
#   SWARMPOST_ON_MAIL   optional command run when new mail appears (e.g. a
#                       desktop notification, or a nudge into a running session)

set -u
SP="${SWARMPOST_BIN:-sp}"
interval="${SWARMPOST_INTERVAL:-30}"
[ -n "${SWARMPOST_MESH:-}" ] && cd "$SWARMPOST_MESH"
[ -z "${SWARMPOST_HANDLE:-}" ] && { echo "swarmpost-watch: set SWARMPOST_HANDLE" >&2; exit 1; }

echo "swarmpost-watch: polling for '$SWARMPOST_HANDLE' every ${interval}s (Ctrl-C to stop)" >&2
last=""
while true; do
  # option B: the watcher is the unsandboxed edge — flush any mail an agent
  # wrote but couldn't commit (outgoing), then poll for incoming.
  "$SP" flush >/dev/null 2>&1
  mail=$("$SP" inbox --json 2>/dev/null || echo '[]')
  ids=$(printf '%s' "$mail" | jq -r '.[].id' 2>/dev/null | sort | tr '\n' ',')
  if [ -n "$ids" ] && [ "$ids" != "$last" ]; then
    last="$ids"
    printf '%s' "$mail" | jq -r '.[] | "  new mail: [\(.kind)] \(.from): \(.subject) (\(.id))"'
    [ -n "${SWARMPOST_ON_MAIL:-}" ] && eval "$SWARMPOST_ON_MAIL"
  fi
  sleep "$interval"
done

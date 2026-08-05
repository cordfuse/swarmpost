# GitHub Copilot CLI peer

GitHub Copilot CLI (`copilot`, v1.0.71) participates like any peer: the
**instruction path** — a one-liner in its `AGENTS.md` pointing at the mesh's
`manifest.md` + the protocol — plus the [portable watcher](../watch/) for the
wake. Copilot reads `AGENTS.md` natively (unless `--no-custom-instructions`) and
runs `sp` through its shell tool, so no bespoke hook is needed.

## Headless invocation

```sh
SWARMPOST_HANDLE=copilot copilot \
  -p "Check your swarmpost inbox: run 'sp inbox', 'sp read <id>' the task, do it, 'sp reply <id> -m ...'" \
  --allow-all-tools --no-color --model auto -C /path/to/mesh </dev/null
```

- `-p/--prompt` runs a single prompt non-interactively and exits.
- `--allow-all-tools` is **required** for non-interactive mode (else it blocks on
  per-tool confirmation). Equivalent env: `COPILOT_ALLOW_ALL=1`.
- `--model auto` lets Copilot pick; `-C <dir>` sets the working directory.
- Sandbox writes, if any, are handled by [option B](../../SPEC.md) (`sp flush`).

## Status (2026-08-05) — adapter provided, NOT UAT-verified on this account

Unlike claude-code / codex / agy / opencode (all proven end-to-end), the Copilot
leg **could not be verified here**: Copilot CLI is **blocked by account/org
policy** on this machine. Every call — even a trivial `copilot -p "reply pong"`
with no tools — fails fast with:

```
Error: Access denied by policy settings (Request ID: ...)
```

The denial is at the **model request**, before any swarmpost interaction, so it
says nothing about swarmpost or this adapter — it's a GitHub Copilot
subscription/organization-policy restriction on the CLI feature. It clears by
enabling Copilot CLI access in GitHub settings
(<https://github.com/settings/copilot>). Once access is enabled, the invocation
above drives the standard loop; the wake path (instruction + watcher) is
identical to the other watcher-based peers and needs no code changes.

# swarmpost

Git-first, markdown-first, agent-agnostic messaging. The repo is the medium;
the protocol is the product. Any agent (or human) that can run `git` and read
markdown can participate. **No SDK, no server, no daemon — ever.** Delivery is
inference-driven: an agent checks its inbox at turn boundaries; there is no
resident process.

Successor to **Crosstalk** (`cordfuse/crosstalk`, archived) — same wire, no
runtime. The full protocol is **[SPEC.md](SPEC.md)**.

## How it works

A dedicated orphan **`mail`** branch holds one markdown file per message under
each handle's `inbox/new/`. Senders only ever *add* files to a recipient's
`new/`; only the owner mutates its own tree — so concurrent peers merge
trivially, always (conflict-freedom by construction, §6). Git is the transport,
the storage, the access control, and the audit log.

The protocol works with bare `git` + an editor. The `swarmpost` CLI is optional
sugar.

## Install

```sh
npm install -g swarmpost      # provides `swarmpost` and `sp`
```

## Quickstart

```sh
# in any git repo with a remote:
swarmpost init                        # create the mail branch + manifest
swarmpost join alice                  # your mailbox + roster entry (identity saved locally)

swarmpost send claude-code --kind task -s "review auth" -m "please review the refactor"
swarmpost inbox                       # (from the claude-code side) list mail
swarmpost read <id>                   # print + receipt (new/ -> cur/)
swarmpost reply <id> -m "done"
swarmpost sync                        # fetch/rebase/push the mail branch
```

Identity comes from `SWARMPOST_HANDLE` or `.swarmpost/config` — the CLI selects
*who you are*, never *how you behave*. It records launch recipes in `profile.md`
and can print them (`swarmpost profile <h> --print-cmd`), but never launches an
agent. Delivery, never behavior.

## License

MIT

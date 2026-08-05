#!/usr/bin/env node
// swarmpost / sp — thin CLI over git-first markdown messaging (§14).
// The protocol works with bare git + an editor; this is sugar. Identity, not
// behavior: it never launches or supervises an agent.

import { readFileSync } from 'fs';
import { paths } from '../src/mesh.js';
import * as ops from '../src/ops.js';

const USAGE = `swarmpost — git-first, markdown-first agent messaging

  swarmpost init                     create the orphan mail branch + manifest
  swarmpost join <handle> [--provider p --model m --argv a,b --env KEY1,KEY2 --notes "..."]
                                     create your mailbox + roster entry (+ optional §5.1 profile)
  swarmpost whoami                   print the handle you're acting as
  swarmpost send <to> [flags]        send a message (to = handle, or a,b,c fan-out)
  swarmpost inbox [--all]            list your mail (ULID order); --all includes read
  swarmpost read <id|--all>          print + receipt (new/ -> cur/)
  swarmpost reply <id> [flags]       reply to a message
  swarmpost claim <id> [flags]       claim a task (kind: claim)
  swarmpost ack <id>                 acknowledge a message
  swarmpost sync                     fetch/rebase/push the mail branch
  swarmpost flush                    commit + push mail an agent wrote but couldn't (run unsandboxed)
  swarmpost profile <handle> [--print-cmd]   show profile; --print-cmd emits (never runs) the launch command

send/reply/claim flags:
  --kind <k>   --subject <s>   --thread <id>   --ref <id> (repeatable)
  --reply-to <id>   --priority <low|normal|high>   --provider <p>   --model <m>
  -m <body>    -f <file.md | -=stdin>
global: --json   |   identity via SWARMPOST_HANDLE or .swarmpost/config`;

function parse(argv) {
  const flags = { _: [], ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => argv[++i];
    switch (a) {
      case '--json': flags.json = true; break;
      case '--all': flags.all = true; break;
      case '--new': flags.new = true; break;
      case '--print-cmd': flags.printCmd = true; break;
      case '--kind': flags.kind = take(); break;
      case '--subject': case '-s': flags.subject = take(); break;
      case '--thread': flags.thread = take(); break;
      case '--ref': flags.ref.push(take()); break;
      case '--reply-to': flags.reply_to = take(); break;
      case '--priority': flags.priority = take(); break;
      case '--provider': flags.provider = take(); break;
      case '--model': flags.model = take(); break;
      case '--argv': flags.argv = take().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--env': flags.env = take().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--notes': flags.notes = take(); break;
      case '-m': flags.body = take(); break;
      case '-f': flags.file = take(); break;
      case '-h': case '--help': flags.help = true; break;
      default: flags._.push(a);
    }
  }
  return flags;
}

function resolveBody(flags) {
  if (typeof flags.body === 'string') return flags.body;
  if (flags.file) return flags.file === '-' ? readFileSync(0, 'utf8') : readFileSync(flags.file, 'utf8');
  return undefined;
}

function out(flags, human, obj) {
  if (flags.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  else if (human) process.stdout.write(human + '\n');
}

function sendOpts(flags) {
  return {
    kind: flags.kind, subject: flags.subject, thread: flags.thread,
    references: flags.ref.length ? flags.ref : undefined, reply_to: flags.reply_to,
    priority: flags.priority, provider: flags.provider, model: flags.model,
    body: resolveBody(flags), all: flags.all,
  };
}

async function main() {
  const flags = parse(process.argv.slice(2));
  const verb = flags._[0];
  if (!verb || flags.help) { process.stdout.write(USAGE + '\n'); process.exit(verb ? 0 : 1); }
  const p = paths();

  switch (verb) {
    case 'init': {
      const r = ops.init(p);
      out(flags, `Initialized mesh on '${r.branch}' branch.`, r); break;
    }
    case 'join': {
      const r = ops.join_(p, flags._[1], {
        provider: flags.provider, model: flags.model,
        argv: flags.argv, env: flags.env, notes: flags.notes,
      });
      out(flags, `Joined as '${r.handle}'. (identity saved to .swarmpost/config)`, r); break;
    }
    case 'whoami': {
      const r = ops.who(p);
      out(flags, r.handle, r); break;
    }
    case 'send': {
      const r = ops.send(p, flags._[1], sendOpts(flags));
      out(flags, r.ids.map((id) => `Sent: ${id}`).join('\n'), r); break;
    }
    case 'inbox': {
      const r = ops.inbox(p, { all: flags.all });
      out(flags, r.length ? r.map((m) => `${m.id}  [${m.kind}] ${m.from}: ${m.subject}${flags.all ? `  (${m.state})` : ''}`).join('\n') : '(no mail)', r); break;
    }
    case 'read': {
      const r = ops.read(p, flags._[1] ?? (flags.all ? '--all' : undefined), { all: flags.all });
      out(flags, r.map((m) => m.text).join('\n---\n'), r.map((m) => ({ file: m.file }))); break;
    }
    case 'reply': { const r = ops.reply(p, flags._[1], sendOpts(flags)); out(flags, r.ids.map((id) => `Sent: ${id}`).join('\n'), r); break; }
    case 'claim': { const r = ops.claim(p, flags._[1], sendOpts(flags)); out(flags, `Claimed via ${r.ids[0]}`, r); break; }
    case 'ack':   { const r = ops.ack(p, flags._[1], sendOpts(flags)); out(flags, `Ack sent: ${r.ids[0]}`, r); break; }
    case 'sync':  { const r = ops.sync(p); out(flags, r.pushed ? 'synced (pushed)' : 'synced (local only — no relay/offline)', r); break; }
    case 'flush': { const r = ops.flush(p); out(flags, r.committed ? `flushed${r.pushed ? ' (pushed)' : ' (local only)'}` : 'nothing to flush', r); break; }
    case 'profile': {
      const r = ops.profile(p, flags._[1], { printCmd: flags.printCmd });
      if (flags.printCmd) out(flags, r.cmd, r); else out(flags, r.text, r); break;
    }
    default:
      process.stderr.write(`swarmpost: unknown verb '${verb}'\n\n${USAGE}\n`); process.exit(1);
  }
}

main().catch((err) => { process.stderr.write(`swarmpost: ${err.message}\n`); process.exit(1); });

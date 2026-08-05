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
  swarmpost inbox [--all]            list your mail (fetches first); --all includes read
  swarmpost status                   one-call dashboard: unread, threads, roster (no receipt)
  swarmpost thread <id>              full threaded transcript across all mailboxes (no receipt)
  swarmpost read <id|--all>          print + receipt (fetches first; new/ -> cur/)
  swarmpost wait [--reply-to id|--kind k|--from h|--thread id] [--timeout s] [--interval s]
                                     block until matching mail arrives, then print it (bounded; no receipt)
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
kinds: task  claim  review-request  review-complete  ack  error  info  question  (+ any the mesh manifest adds)
global: --json   |   --mesh <dir> / SWARMPOST_MESH (run from anywhere, e.g. inside a code repo)
        identity via SWARMPOST_HANDLE or .swarmpost/config`;

function parse(argv) {
  const flags = { _: [], ref: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const take = () => argv[++i];
    switch (a) {
      case '--json': flags.json = true; break;
      case '--mesh': flags.mesh = take(); break;
      case '--all': flags.all = true; break;
      case '--new': flags.new = true; break;
      case '--print-cmd': flags.printCmd = true; break;
      case '--kind': flags.kind = take(); break;
      case '--subject': case '-s': flags.subject = take(); break;
      case '--thread': flags.thread = take(); break;
      case '--ref': flags.ref.push(take()); break;
      case '--reply-to': flags.reply_to = take(); break;
      case '--from': flags.from = take(); break;
      case '--timeout': flags.timeout = Number(take()); break;
      case '--interval': flags.interval = Number(take()); break;
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

// A message committed locally but not pushed is NOT visible to peers yet. Never
// let that pass silently — warn (human mode) so it isn't mistaken for delivered.
// (--json already carries `pushed`.) Not an error: `sp sync` will deliver it.
function warnIfLocal(flags, r) {
  if (r && r.pushed === false && !flags.json) {
    process.stderr.write("note: committed locally but NOT delivered to the relay yet — run 'sp sync' to deliver\n");
  }
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
  const p = paths(flags.mesh);

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
      out(flags, r.ids.map((id) => `Sent: ${id}`).join('\n'), r); warnIfLocal(flags, r); break;
    }
    case 'inbox': {
      const r = ops.inbox(p, { all: flags.all });
      out(flags, r.length ? r.map((m) => `${m.id}  [${m.kind}] ${m.from}: ${m.subject}${flags.all ? `  (${m.state})` : ''}`).join('\n') : '(no mail)', r); break;
    }
    case 'read': {
      const r = ops.read(p, flags._[1] ?? (flags.all ? '--all' : undefined), { all: flags.all });
      out(flags, r.map((m) => m.text).join('\n---\n'), r.map((m) => ({ file: m.file }))); break;
    }
    case 'status': {
      const r = ops.status(p);
      const human = [
        `handle: ${r.handle}`,
        `unread: ${r.unread.length}${r.unread.length ? '\n' + r.unread.map((m) => `  ${m.id}  [${m.kind}] ${m.from}: ${m.subject}`).join('\n') : ''}`,
        `read:   ${r.readCount}    threads: ${r.threads}`,
        `roster: ${r.roster.join(', ')}`,
      ].join('\n');
      out(flags, human, r); break;
    }
    case 'thread': {
      const r = ops.thread(p, flags._[1]);
      const human = `thread ${r.thread} — ${r.messages.length} message${r.messages.length === 1 ? '' : 's'}\n\n` +
        r.messages.map((m) => `─ ${m.id}  [${m.kind}] ${m.from} → ${m.to}${m.subject ? `  «${m.subject}»` : ''}\n  ${(m.body || '').trim().replace(/\n/g, '\n  ')}`).join('\n\n');
      out(flags, human, r); break;
    }
    case 'wait': {
      const r = ops.wait(p, {
        reply_to: flags.reply_to, kind: flags.kind, from: flags.from, thread: flags.thread,
        timeout: flags.timeout, interval: flags.interval,
      });
      if (!r.matched) { out(flags, '(timed out — no matching mail)', r); process.exit(3); }
      out(flags, r.messages.map((m) => `${m.id}  [${m.kind}] ${m.from}: ${m.subject}`).join('\n'), r); break;
    }
    case 'reply': { const r = ops.reply(p, flags._[1], sendOpts(flags)); out(flags, r.ids.map((id) => `Sent: ${id}`).join('\n'), r); warnIfLocal(flags, r); break; }
    case 'claim': { const r = ops.claim(p, flags._[1], sendOpts(flags)); out(flags, `Claimed via ${r.ids[0]}`, r); warnIfLocal(flags, r); break; }
    case 'ack':   { const r = ops.ack(p, flags._[1], sendOpts(flags)); out(flags, `Ack sent: ${r.ids[0]}`, r); warnIfLocal(flags, r); break; }
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

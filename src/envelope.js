// envelope.js — message identity + serialization (§7, §8).

import { randomBytes } from 'crypto';
import { parse, stringify } from 'yaml';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// ULID: 10-char millisecond timestamp + 16 chars of randomness, Crockford
// base32. Globally unique + lexicographically time-ordered (§8).
export function ulid(time = Date.now()) {
  let ts = '';
  let t = time;
  for (let i = 0; i < 10; i++) {
    ts = CROCKFORD[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  let rand = '';
  const b = randomBytes(16);
  for (let i = 0; i < 16; i++) rand += CROCKFORD[b[i] % 32];
  return ts + rand;
}

// <ulid>.<from>.md  — sender suffix makes `grep -l` triage instant (§8).
export function filename(id, from) {
  return `${id}.${from}.md`;
}

// Frontmatter fields are emitted in a stable, human-scannable order.
const ORDER = [
  'spec', 'id', 'from', 'to', 'subject', 'kind',
  'thread', 'references', 'reply_to', 'ts', 'priority', 'provider', 'model',
];

export function serialize(fm, body) {
  const ordered = {};
  for (const k of ORDER) if (fm[k] !== undefined) ordered[k] = fm[k];
  for (const k of Object.keys(fm)) if (!(k in ordered)) ordered[k] = fm[k];
  return `---\n${stringify(ordered).trimEnd()}\n---\n\n${(body || '').trim()}\n`;
}

export function parseMessage(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('missing frontmatter');
  const data = parse(m[1]) || {};
  return { data, body: m[2].replace(/^\n+/, '') };
}

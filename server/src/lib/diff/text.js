import crypto from 'node:crypto';

/** All text is stored with \n line endings, so Windows (\r\n) and Unix edits compare equal. */
export const normalize = (s) => String(s ?? '').replace(/\r\n?/g, '\n');

/** "" -> [] ; "a\nb" -> ["a","b"] ; "a\n" -> ["a",""]  (join() reverses it exactly). */
export const splitLines = (s) => {
  const t = normalize(s);
  return t === '' ? [] : t.split('\n');
};

export const joinLines = (lines) => lines.join('\n');

export const hashText = (s) => crypto.createHash('sha256').update(normalize(s)).digest('hex');

export const wordCount = (s) => (normalize(s).match(/\S+/g) || []).length;

export const byteSize = (s) => Buffer.byteLength(normalize(s), 'utf8');

export const arraysEqual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

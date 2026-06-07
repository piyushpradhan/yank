import type { ReactNode } from 'react';
import { Mark } from 'ember-design-system';
import type { ClipItem, Theme } from './types';

// Characters that count as word delimiters — matches before these positions
// score higher because they correspond to user-meaningful boundaries.
const WORD_BOUNDARY_RE = /[\s\-_/.,;:!?(){}[\]@'"`]/;

function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  return WORD_BOUNDARY_RE.test(text[i - 1]);
}

// Returns a score >= 0 for a match, or -1 for no match. Higher = better.
// Substring hits dominate; sparse scattered subsequence matches are rejected
// so things like "hello" stop matching "happy elephant loved oranges".
function scoreText(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (!t) return -1;

  const idx = t.indexOf(q);
  if (idx >= 0) {
    let s = 10000;
    if (idx === 0) s += 1000;
    else if (isWordStart(t, idx)) s += 500;
    s -= Math.min(idx, 200);
    return s;
  }

  // Single-char queries must substring match — subsequence is meaningless.
  if (q.length < 2) return -1;

  let qi = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let consecutive = 0;
  let maxConsecutive = 1;
  let wordStarts = 0;

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (firstMatch < 0) firstMatch = i;
      if (lastMatch === i - 1) consecutive++;
      else consecutive = 1;
      if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      if (isWordStart(t, i)) wordStarts++;
      lastMatch = i;
      qi++;
    }
  }

  if (qi < q.length) return -1;

  const span = lastMatch - firstMatch + 1;
  const density = q.length / span;

  // Reject loose scattered matches for 3+ char queries. Accept if the
  // match is dense, has a run of consecutive chars, or aligns with word
  // starts (acronym-style: "vsc" → "Visual Studio Code").
  if (q.length >= 3) {
    const dense = density >= 0.5;
    const hasRun = maxConsecutive >= 3;
    const hasAcronym = wordStarts >= q.length - 1;
    if (!dense && !hasRun && !hasAcronym) return -1;
  }

  let s = 1000;
  s += maxConsecutive * 100;
  s += wordStarts * 200;
  s += Math.round(density * 500);
  s -= Math.min(firstMatch, 200);
  return s;
}

// Score an item across its fields and return the best field score. Label
// gets a boost so a title hit beats an incidental match in the preview body.
function scoreItem(query: string, item: ClipItem): number {
  const labelS = scoreText(query, item.label);
  const previewS = scoreText(query, item.preview);
  const sourceS = scoreText(query, item.source);
  const catS = scoreText(query, item.category);

  let best = -1;
  if (labelS >= 0 && labelS + 200 > best) best = labelS + 200;
  if (previewS > best) best = previewS;
  if (sourceS >= 0 && sourceS - 100 > best) best = sourceS - 100;
  if (catS >= 0 && catS - 200 > best) best = catS - 200;
  return best;
}

export function fuzzyMatch(query: string, item: ClipItem): boolean {
  const q = query.trim();
  if (!q) return true;
  return scoreItem(q, item) >= 0;
}

export function searchItems(items: ClipItem[], query: string): ClipItem[] {
  const q = query.trim();
  if (!q) return items;
  const scored: { item: ClipItem; score: number; i: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const score = scoreItem(q, items[i]);
    if (score >= 0) scored.push({ item: items[i], score, i });
  }
  // Best score first; ties fall back to original order so the input
  // ranking (pinned-then-recent) breaks ties predictably.
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((x) => x.item);
}

export function groupByTime(items: ClipItem[]): Record<string, ClipItem[]> {
  // Pinned items live in their own bucket at the top instead of being scattered
  // across day buckets — the whole point of pinning is "always at the top."
  const buckets: Record<string, ClipItem[]> = {
    Pinned: [],
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  };
  for (const i of items) {
    if (i.pinned) buckets['Pinned'].push(i);
    else if (i.minutesAgo < 1440) buckets['Today'].push(i);
    else if (i.minutesAgo < 2880) buckets['Yesterday'].push(i);
    else if (i.minutesAgo < 10080) buckets['This week'].push(i);
    else buckets['Earlier'].push(i);
  }
  return buckets;
}

export function highlightMatch(_t: Theme, text: string, query: string): ReactNode {
  if (!query || !query.trim()) return text;
  const q = query.trim().toLowerCase();
  const txt = String(text);
  const idx = txt.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {txt.slice(0, idx)}
      <Mark>{txt.slice(idx, idx + q.length)}</Mark>
      {txt.slice(idx + q.length)}
    </>
  );
}

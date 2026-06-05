import type { ReactNode } from 'react';
import { Mark } from 'ember-design-system';
import type { ClipItem, Theme } from './types';

export function fuzzyMatch(query: string, item: ClipItem): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const hay = `${item.label} ${item.preview} ${item.source} ${item.category}`.toLowerCase();
  if (hay.includes(q)) return true;
  let j = 0;
  for (const ch of hay) {
    if (ch === q[j]) j++;
    if (j === q.length) return true;
  }
  return false;
}

export function searchItems(items: ClipItem[], query: string): ClipItem[] {
  if (!query.trim()) return items;
  return items.filter((i) => fuzzyMatch(query, i));
}

export function groupByTime(items: ClipItem[]): Record<string, ClipItem[]> {
  const buckets: Record<string, ClipItem[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  };
  for (const i of items) {
    if (i.minutesAgo < 1440) buckets['Today'].push(i);
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

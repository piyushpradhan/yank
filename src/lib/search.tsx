import type { ReactNode } from 'react';
import { Mark } from 'ember-design-system';
import type { ClipItem, SearchMode, Theme } from './types';

const SEM_CONCEPTS: Record<string, string[]> = {
  error: ['code:error', 'mismatched', 'E0308', 'terminal'],
  terminal: ['terminal', 'error', 'cargo'],
  phone: ['phone', 'number', 'mobile', 'atisha'],
  flight: ['number', 'confirmation', 'UA-'],
  address: ['address', 'office', 'HackerRank'],
  price: ['pricing', 'paragraph', 'launch'],
  pricing: ['pricing', 'paragraph', 'launch'],
  css: ['code:css', 'grid', 'clamp'],
  brand: ['color', 'rose', 'indigo'],
  confirmation: ['number', 'flight', 'UA-'],
  docs: ['url', 'tauri', 'clipboard'],
  ideas: ['text'],
  snippet: ['code'],
  color: ['color'],
  config: ['path', 'tauri'],
  useeffect: ['code:react', 'cleanup'],
  react: ['code:react'],
  schema: ['code:sql', 'fts'],
  database: ['code:sql'],
};

export function semanticScore(query: string, item: ClipItem): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  let score = 0;
  const words = q.split(/\s+/).filter(Boolean);
  const hay = `${item.label} ${item.preview} ${item.source} ${item.category}`.toLowerCase();
  for (const w of words) {
    if (hay.includes(w)) score += 10;
    const concepts = SEM_CONCEPTS[w];
    if (concepts) {
      for (const c of concepts) {
        if (hay.includes(c.replace('code:', '').toLowerCase())) score += 5;
        if (c.startsWith('code:') && item.category === 'code') score += 4;
        if (c === 'url' && item.category === 'url') score += 4;
        if (c === 'phone' && item.category === 'phone') score += 4;
        if (c === 'color' && item.category === 'color') score += 4;
        if (c === 'number' && item.category === 'number') score += 4;
        if (c === 'path' && item.category === 'path') score += 4;
        if (c === 'text' && item.category === 'text') score += 3;
      }
    }
  }
  score += Math.max(0, 3 - Math.log2(item.minutesAgo + 2));
  return score;
}

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

export function searchItems(items: ClipItem[], query: string, mode: SearchMode): ClipItem[] {
  if (!query.trim()) return items;
  if (mode === 'semantic') {
    return items
      .map((i) => ({ i, s: semanticScore(query, i) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.i);
  }
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

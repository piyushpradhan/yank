import { describe, it, expect } from 'vitest';
import { fuzzyMatch, searchItems, groupByTime, highlightMatch } from './search';
import type { ClipItem, Theme } from './types';

const stubTheme: Theme = { dark: false, dense: false, rowH: 0, rowHTall: 0, pad: 0, radius: 0, radiusLg: 0 };

const makeItem = (overrides: Partial<ClipItem> = {}): ClipItem => ({
  id: '1',
  category: 'text',
  label: 'Hello world',
  source: 'Notes',
  minutesAgo: 5,
  content: 'hello world content',
  preview: 'hello world content',
  ...overrides,
});

describe('fuzzyMatch', () => {
  it('matches exact text', () => {
    expect(fuzzyMatch('hello', makeItem())).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('HELLO', makeItem())).toBe(true);
  });

  it('fuzzy matches subsequence', () => {
    expect(fuzzyMatch('hlo', makeItem({ label: 'hello', preview: '' }))).toBe(true);
  });

  it('returns false for non-matching query', () => {
    expect(fuzzyMatch('xyz', makeItem())).toBe(false);
  });

  it('returns true for empty query', () => {
    expect(fuzzyMatch('', makeItem())).toBe(true);
  });

  it('matches across label, preview, source, and category', () => {
    const item = makeItem({ label: '', preview: '', source: 'Slack', category: 'text' });
    expect(fuzzyMatch('slack', item)).toBe(true);
  });
});

describe('searchItems', () => {
  const items: ClipItem[] = [
    makeItem({ id: '1', label: 'React snippet', category: 'code', minutesAgo: 2 }),
    makeItem({ id: '2', label: 'Meeting notes', category: 'text', minutesAgo: 10 }),
    makeItem({ id: '3', label: 'https://example.com', category: 'url', minutesAgo: 30 }),
  ];

  it('returns all items for empty query', () => {
    expect(searchItems(items, '')).toHaveLength(3);
  });

  it('filters by fuzzy match', () => {
    expect(searchItems(items, 'react')).toHaveLength(1);
    expect(searchItems(items, 'react')[0].id).toBe('1');
  });

  it('returns empty for no match', () => {
    expect(searchItems(items, 'xyz')).toHaveLength(0);
  });
});

describe('groupByTime', () => {
  it('groups items into time buckets', () => {
    const items: ClipItem[] = [
      makeItem({ id: '1', minutesAgo: 60 }),
      makeItem({ id: '2', minutesAgo: 1500 }),
      makeItem({ id: '3', minutesAgo: 5000 }),
      makeItem({ id: '4', minutesAgo: 20000 }),
    ];
    const groups = groupByTime(items);
    expect(groups['Today']).toHaveLength(1);
    expect(groups['Yesterday']).toHaveLength(1);
    expect(groups['This week']).toHaveLength(1);
    expect(groups['Earlier']).toHaveLength(1);
  });

  it('handles empty array', () => {
    const groups = groupByTime([]);
    expect(groups['Today']).toHaveLength(0);
    expect(groups['Earlier']).toHaveLength(0);
  });

  it('separates pinned items into a Pinned bucket regardless of age', () => {
    const items: ClipItem[] = [
      makeItem({ id: '1', minutesAgo: 60, pinned: true }),
      makeItem({ id: '2', minutesAgo: 20000, pinned: true }),
      makeItem({ id: '3', minutesAgo: 60 }),
      makeItem({ id: '4', minutesAgo: 20000 }),
    ];
    const groups = groupByTime(items);
    expect(groups['Pinned']).toHaveLength(2);
    expect(groups['Today']).toHaveLength(1);
    expect(groups['Earlier']).toHaveLength(1);
    expect(groups['Pinned'].map((i) => i.id)).toEqual(['1', '2']);
  });

  it('lists Pinned first so it renders at the top', () => {
    const groups = groupByTime([]);
    expect(Object.keys(groups)[0]).toBe('Pinned');
  });
});

describe('highlightMatch', () => {
  it('returns text unchanged when query is empty', () => {
    expect(highlightMatch(stubTheme, 'hello world', '')).toBe('hello world');
  });

  it('returns text unchanged when no match found', () => {
    const result = highlightMatch(stubTheme, 'hello world', 'xyz');
    expect(result).toBe('hello world');
  });

  it('returns a React fragment when match found', () => {
    const result = highlightMatch(stubTheme, 'hello world', 'hello');
    expect(result).not.toBe('hello world');
  });
});

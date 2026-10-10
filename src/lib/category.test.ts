import { describe, it, expect } from 'vitest'
import { CATEGORY_META, CATEGORIES, catStyle, knownCategory } from './category'
import type { Theme } from './types'

describe('CATEGORY_META', () => {
  it('has metadata for all categories', () => {
    CATEGORIES.forEach((cat) => {
      const meta = CATEGORY_META[cat]
      expect(meta).toBeDefined()
      expect(meta.label).toBeTruthy()
      expect(meta.mono).toBeTruthy()
      expect(meta.icon).toBeTruthy()
    })
  })

  it('contains expected categories', () => {
    expect(CATEGORIES).toContain('code')
    expect(CATEGORIES).toContain('url')
    expect(CATEGORIES).toContain('email')
    expect(CATEGORIES).toContain('phone')
    expect(CATEGORIES).toContain('color')
    expect(CATEGORIES).toContain('path')
    expect(CATEGORIES).toContain('text')
    expect(CATEGORIES).toContain('address')
    expect(CATEGORIES).toContain('number')
  })

  it('has a unique mono code per category', () => {
    const monos = CATEGORIES.map((cat) => CATEGORY_META[cat].mono)
    expect(new Set(monos).size).toBe(CATEGORIES.length)
  })
})

describe('knownCategory', () => {
  it('falls back to text for unknown categories', () => {
    expect(knownCategory('category-from-an-older-build')).toBe('text')
    expect(knownCategory('toString')).toBe('text')
  })

  it('passes known categories through', () => {
    expect(knownCategory('url')).toBe('url')
  })
})

describe('catStyle', () => {
  const stubTheme = { dark: false, dense: false } as Theme

  it('exposes the category mono and icon', () => {
    const style = catStyle(stubTheme, 'code')
    expect(style.label).toBe('Code')
    expect(style.mono).toBe('CODE')
    expect(style.icon).toBe('{ }')
  })

  it('resolves colours via ember CSS custom properties (no raw oklch)', () => {
    const style = catStyle(stubTheme, 'url')
    expect(style.ink).toMatch(/var\(--/)
    expect(style.bg).toMatch(/var\(--|color-mix/)
  })

  it('maps code to ember accent and color to status-danger', () => {
    expect(catStyle(stubTheme, 'code').ink).toContain('accent-ember')
    expect(catStyle(stubTheme, 'color').ink).toContain('status-danger')
  })
})

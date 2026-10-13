import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { generate, mergeChangelog, sections } from './changelog.mjs'

const cwd = mkdtempSync(join(tmpdir(), 'yank-changelog-test-'))
const script = fileURLToPath(new URL('./changelog.mjs', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
git('init', '-b', 'main')
git('config', 'user.name', 'Changelog test')
git('config', 'user.email', 'test@example.com')
git('config', 'commit.gpgsign', 'false')
git('config', 'tag.gpgsign', 'false')

function release(tag, message) {
  git('commit', '--allow-empty', '-m', message)
  git('tag', '-a', tag, '-m', `Release ${tag}`)
}

release('v0.9.9', 'feat: add clipboard history')
release('v0.10.0', 'fix(palette): restore focus before paste')
release('v1.0.0', 'feat!: change storage format\n\nBREAKING CHANGE: Export your history before upgrading.')
release('v1.0.1', 'chore: bump version to 1.0.1 [skip ci]')
release('v1.1.0', 'chore: sync version storage\n\nBREAKING CHANGE: Reconfigure shortcuts after upgrading.')
git('switch', '-c', 'other-history', 'v0.9.9')
release('v9.0.0', 'feat: unrelated branch feature')
git('switch', 'main')
git('tag', '-a', 'v1.2.0', 'v1.1.0', '-m', 'Release v1.2.0')
after(() => rmSync(cwd, { recursive: true, force: true }))

test('an older tag excludes future releases and unrelated branch tags', async () => {
  const changelog = await generate('v0.10.0', cwd)
  assert.deepEqual([...sections(changelog).keys()], ['0.10.0', '0.9.9'])
  const notes = sections(changelog).get('0.10.0')
  assert.match(notes, /Restore focus before paste/)
  assert.doesNotMatch(notes, /Add clipboard history|unrelated branch|storage format/)
  assert.match(notes, /compare\/v0\.9\.9\.\.\.v0\.10\.0/)
})

test('major releases retain breaking descriptions', async () => {
  const notes = sections(await generate('v1.0.0', cwd)).get('1.0.0')
  assert.match(notes, /### Breaking Changes/)
  assert.match(notes, /\*\*BREAKING:\*\*/)
  assert.match(notes, /Export your history before upgrading/)
})

test('breaking maintenance changes are never skipped', async () => {
  const notes = sections(await generate('v1.1.0', cwd)).get('1.1.0')
  assert.match(notes, /### Breaking Changes/)
  assert.match(notes, /Sync version storage/)
  assert.match(notes, /Reconfigure shortcuts after upgrading/)
})

test('each requested version gets notes when two tags share a commit', async () => {
  for (const tag of ['v1.1.0', 'v1.2.0']) {
    const entries = sections(await generate(tag, cwd))
    assert.ok(entries.has(tag.slice(1)))
    assert.match(entries.get(tag.slice(1)), /Sync version storage/)
  }
})

test('tags containing only version bumps still get a versioned entry', async () => {
  const notes = sections(await generate('v1.0.1', cwd)).get('1.0.1')
  assert.match(notes, /No user-facing changes in this release/)
  assert.doesNotMatch(notes, /bump version|\[skip ci\]/)
})

test('merging preserves curated entries and stays identical on retries', () => {
  const existing = '# Changelog\n\n## [0.9.9] - 2026-01-01\n\nHandwritten release notes.\n'
  const generated = '## [0.10.0] - 2026-01-02\n\nFix focus.\n\n## [0.9.9] - 2026-01-01\n\nGenerated summary.\n'
  const merged = mergeChangelog(existing, generated)
  assert.deepEqual([...sections(merged).keys()], ['0.10.0', '0.9.9'])
  assert.match(merged, /Handwritten release notes/)
  assert.doesNotMatch(merged, /Generated summary/)
  assert.equal(mergeChangelog(merged, generated), merged)
  assert.equal(sections(mergeChangelog('# Changelog\n', generated)).size, 2)
})

test('notes CLI publishes only the requested version and merge preserves newer versions', () => {
  const existing = '# Changelog\n\n## [2.0.0] - 2026-02-01\n\nNewer release.\n\n## [0.10.0] - 2026-01-01\n\nCurated palette fix.\n'
  writeFileSync(join(cwd, 'CHANGELOG.md'), existing)
  execFileSync(process.execPath, [script, 'notes', 'v0.10.0', 'notes.md'], { cwd })
  const notes = readFileSync(join(cwd, 'notes.md'), 'utf8')
  assert.deepEqual([...sections(notes).keys()], ['0.10.0'])
  assert.match(notes, /Curated palette fix/)
  execFileSync(process.execPath, [script, 'merge', 'notes.md'], { cwd })
  assert.equal(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8'), existing)
  execFileSync(process.execPath, [script, 'notes', 'v1.0.0', 'notes.md'], { cwd })
  assert.deepEqual([...sections(readFileSync(join(cwd, 'notes.md'), 'utf8')).keys()], ['1.0.0'])
  execFileSync(process.execPath, [script, 'merge', 'notes.md'], { cwd })
  const merged = sections(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8'))
  assert.deepEqual([...merged.keys()], ['2.0.0', '1.0.0', '0.10.0'])
  assert.equal(merged.get('2.0.0'), sections(existing).get('2.0.0'))
})

test('duplicate entries, invalid tags, and missing tags fail clearly', async () => {
  assert.throws(() => sections('## [1.0.0]\n\n## [1.0.0]\n'), /Duplicate changelog entry/)
  await assert.rejects(generate('main', cwd), /Expected a stable release tag/)
  await assert.rejects(generate('v4.0.0', cwd), /Command failed/)
})

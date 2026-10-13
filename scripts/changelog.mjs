import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const config = fileURLToPath(new URL('../cliff.toml', import.meta.url))
const stableTag = /^v\d+\.\d+\.\d+$/

export function sections(markdown) {
  const entries = new Map()
  const matches = [...markdown.matchAll(/^## \[(\d+\.\d+\.\d+)\].*$/gm)]
  for (const [index, match] of matches.entries()) {
    if (entries.has(match[1])) throw new Error(`Duplicate changelog entry: ${match[1]}`)
    entries.set(match[1], markdown.slice(match.index, matches[index + 1]?.index).trim())
  }
  return entries
}

export function mergeChangelog(existing, generated) {
  // Existing entries win so maintainers can curate notes without losing edits.
  const entries = new Map([...sections(generated), ...sections(existing)])
  const versions = [...entries.keys()].sort((a, b) => {
    const left = a.split('.').map(Number)
    const right = b.split('.').map(Number)
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2]
  })
  const start = existing.search(/^## /m)
  const header = existing.slice(0, start < 0 ? existing.length : start).trim()
  return `${header}\n\n${versions.map((version) => entries.get(version)).join('\n\n')}\n`
}

export async function generate(tag, cwd = process.cwd()) {
  if (!stableTag.test(tag)) throw new Error(`Expected a stable release tag such as v0.8.0: ${tag}`)
  // Resolve to a commit SHA: git-cliff's single-revision range expects an OID.
  const commit = execFileSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  const aliases = execFileSync('git', ['tag', '--points-at', commit], { cwd, encoding: 'utf8' })
    .trim().split('\n').filter((value) => stableTag.test(value) && value !== tag)
  // git-cliff selects one tag per commit; keep the requested tag when tags share a commit.
  const args = ['--config', config]
  if (aliases.length) {
    const pattern = `^(${aliases.map((value) => value.replaceAll('.', '\\.')).join('|')})$`
    args.push('--ignore-tags', pattern, '--tag', tag)
  }
  const { runGitCliff } = await import('git-cliff')
  const { stdout } = await runGitCliff([...args, commit], { cwd, stdio: 'pipe' })
  if (!sections(stdout).has(tag.slice(1))) throw new Error(`No changelog generated for ${tag}`)
  return stdout
}

async function main() {
  const [command, argument, output] = process.argv.slice(2)
  const path = resolve('CHANGELOG.md')
  const existing = readFileSync(path, 'utf8')
  if (command === 'merge' && argument) {
    const notes = readFileSync(argument, 'utf8')
    if (sections(notes).size !== 1) throw new Error('Release notes must contain exactly one version')
    writeFileSync(path, mergeChangelog(existing, notes))
  } else if (command === 'generate' || command === 'notes') {
    const tag = argument ?? execFileSync('git', ['tag', '--list', 'v*', '--sort=-version:refname'], {
      encoding: 'utf8',
    }).split('\n').find((value) => stableTag.test(value))
    const generated = await generate(tag)
    if (command === 'generate') {
      const header = generated.slice(0, generated.search(/^## /m))
      const start = existing.search(/^## /m)
      const entries = start < 0 ? '' : existing.slice(start)
      writeFileSync(path, mergeChangelog(`${header}${entries}`, generated))
    } else {
      if (!output) throw new Error('Usage: changelog.mjs notes <tag> <output.md>')
      const version = tag.slice(1)
      const notes = sections(existing).get(version) ?? sections(generated).get(version)
      writeFileSync(output, `${notes}\n`)
    }
  } else {
    throw new Error('Usage: changelog.mjs generate [tag] | notes <tag> <output.md> | merge <notes.md>')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}

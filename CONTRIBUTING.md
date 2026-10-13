# Contributing to Yank

Thanks for your interest in contributing! This guide will help you set up your development environment and follow our code standards.

## Quick Start

```sh
# Clone and install dependencies
git clone https://github.com/piyushpradhan/recall.git
cd recall
npm install

# Run development mode
npm run dev          # Frontend only
npm run app:dev      # Full Tauri app
```

## Prerequisites

- **Node.js** 18+ with npm
- **Rust** stable (install via [rustup](https://rustup.rs))
- **Platform-specific tools**:
  - Windows: Visual Studio Build Tools + WebView2 Runtime
  - macOS: Xcode Command Line Tools
  - Linux: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)

## Project Structure

```
yank/
├── src/                 # React frontend (TypeScript)
│   ├── components/      # UI components
│   ├── hooks/          # React hooks
│   ├── lib/            # Utilities and types
│   ├── windows/        # Window components (Library, Palette)
│   └── test/           # Test setup
├── src-tauri/          # Rust backend
│   ├── src/            # Rust source files
│   │   ├── main.rs     # Entry point
│   │   ├── commands.rs # Tauri commands
│   │   ├── categorize.rs # Content categorization
│   │   └── ...
│   └── Cargo.toml      # Rust dependencies
└── package.json        # Node dependencies
```

## Code Standards

### TypeScript

- Strict mode enabled
- Run `npm run typecheck` before committing
- Use ESLint: `npm run lint`
- Auto-format on save (VS Code with Prettier extension)

### Rust

- Run `cargo clippy --all-targets` before committing
- Prefer explicit error handling over `unwrap()`
- Document public APIs with doc comments

### Testing

```sh
# Run all tests
npm test              # Frontend (Vitest)
cargo test           # Backend (Rust)

# Watch mode
npm run test:watch
```

### Chaos Monkey

Seeded fault injection: hostile clipboard text, malformed images, FTS-breaking
queries, corrupt/half-migrated SQLite files, panics under the DB lock, and a UI
driven by random input against a backend that rejects, hangs and lags.

```sh
npm run chaos          # both suites
npm run chaos:rust     # src-tauri/src/chaos.rs  (also part of `cargo test`)
npm run chaos:ui       # src/test/app.chaos.tsx  (opt-in, not in `npm test`)

# Replay a failure — the seed is printed with the findings
CHAOS_SEED=1337 npm run chaos
CHAOS_ITERS=800 npm run chaos:rust    # Rust: iterations per scenario (default 400)
CHAOS_STEPS=300 npm run chaos:ui      # UI: random actions per session (default 120)
```

When a scenario fails it lists every finding at once. Fix the bug, keep the
scenario; add a small unit test next to the code for the exact input.

### Git Commits

- Use clear, descriptive commit messages
- Prefix with type: `feat:`, `fix:`, `quality:`, `chore:`
- Example: `feat: add semantic search toggle` or `fix: clipboard polling race condition`

### Changelogs and releases

Every stable `vX.Y.Z` tag gets its own changelog entry, including patch,
minor, and major releases. [git-cliff](https://git-cliff.org) groups commit
messages using `cliff.toml`; use descriptions that explain the change to users.
Mark breaking changes with `!` (for example `feat!: change storage format`) and
include a `BREAKING CHANGE:` footer with upgrade instructions.

The release workflow generates notes for the exact tag, publishes only that
version's entry on GitHub, and saves it to `CHANGELOG.md` alongside the version
bump. GitHub's generated PR notes and contributor credits are appended. Merge
commits and routine version bumps are excluded. Tags without notable changes
still get a maintenance entry. Existing entries are preserved, so you can edit
generated summaries or write a version's notes before tagging it.

```sh
git fetch origin --tags
npm run changelog                 # Backfill through the latest stable tag
npm run changelog -- v0.7.69       # Backfill through a specific tag
npm run test:changelog            # Check generation and release isolation
```

Historical dates come from Git tags; backfilled summaries come from commit
messages and may need editorial cleanup. A tag from a separate Git history can
be backfilled explicitly with the same command. Regeneration preserves edits.

Pushes to `main` continue to create patch releases automatically. To release a
minor or major version, tag the intended commit and push that tag (replace the
example with the intended version):

```sh
git tag -a v0.8.0 -m "Release v0.8.0"
git push origin v0.8.0
```

If pushing a commit and its release tag together, use `git push --atomic origin
main v0.8.0` so auto-tagging sees the manual tag and skips its patch bump.

## Building

```sh
# Build for current platform
npm run app:build    # Full Tauri app
make build           # Same as above

# Or use platform-specific scripts
./build.sh build     # Linux/macOS
.\build.ps1 build    # Windows
```

## Common Tasks

### Adding a new Tauri command

1. Add handler in `src-tauri/src/commands.rs`
2. Register in `src-tauri/src/lib.rs`
3. Call from frontend via `@tauri-apps/api/core`

### Adding a frontend component

1. Create component in `src/components/`
2. Add tests in `src/**/*.test.ts`
3. Use existing component patterns (see `Primitives.tsx`)

### Running specific tests

```sh
# Frontend
npm test -- src/lib/time.test.ts

# Backend
cargo test categorize
```

## Questions?

- Open an issue for bugs or feature requests
- Disucss in GitHub Discussions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

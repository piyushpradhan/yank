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

### Git Commits

- Use clear, descriptive commit messages
- Prefix with type: `feat:`, `fix:`, `quality:`, `chore:`
- Example: `feat: add semantic search toggle` or `fix: clipboard polling race condition`

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
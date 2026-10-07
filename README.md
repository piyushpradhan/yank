<div align="center">

<img src="public/mark.png" alt="Yank" width="128" height="128">

# Yank

**Your clipboard, with natural-language search.**

<sub>"that CSS snippet from yesterday" · "the phone number I copied last week" · "the error from the terminal earlier"</sub>

---

**Yank is in early development** — we're building in public. Try it, break it, tell us what to fix next.

</div>

---

## What's Yank?

Yank is a local-first clipboard history manager for **Windows, Linux, and macOS**. It captures everything you copy, categorizes it automatically, and lets you find it again with either fuzzy search or AI-powered semantic search.

The entire "find → paste" loop takes under five seconds. Semantic search runs on-device out of the box; optionally a TypeSafe Jev (cloud) or Laya (local) model re-ranks the top matches.

## Why Yank?

| Problem | Yank's Solution |
|--------|-------------------|
| "I know I copied that link but can't find it" | Semantic search — describe what you remember, not what you copied |
| "Clipboard managers are cluttered / slow" | 500ms capture, SQLite+FTS5, keyboard-first UI |
| "I want AI but don't trust cloud with my data" | Semantic search runs on-device; the cloud re-ranker is opt-in |
| "I want AI search that understands meaning" | Local embeddings find paraphrases; Jev or Laya re-ranks for precision |
| "I want AI labels but not monthly fees" | Optional Anthropic key — you control your usage and spend |

## Features

- **Silent auto-capture** — every copy lands in history within 500ms
- **Image capture & paste** — screenshots and images captured automatically; full-resolution preview and one-key paste-back
- **Auto-categorization** — clips sorted into `code`, `url`, `email`, `phone`, `color`, `path`, `text`, `address`, `number`, or `image`
- **Semantic search** — on-device EmbeddingGemma embeddings find clips by meaning, no key needed (~200 MB model, downloaded once)
- **Fuzzy search** — keystroke-level fast, SQLite FTS5 with BM25 ranking
- **Re-ranked results (optional)** — TypeSafe Jev (cloud) or Laya (local MLX) picks the best of the top 50
- **Raycast-style palette** — `Ctrl+Shift+Space` from anywhere, type, paste
- **Pin, rename, soft-delete with undo** — 4-second grace window
- **Native tray + global shortcut + launch-at-startup**
- **Mica-blur on Windows 11**, light/dark themes, adjustable accent, density, fonts
- **Keyboard-first** — every action has a shortcut; press `?` for cheatsheet

## Install

Pre-built installers are attached to every [GitHub Release](../../releases). macOS builds available via source.

### Windows

| File | What it is |
|---|---|
| `Yank_<version>_x64-setup.exe` | NSIS installer — recommended |
| `Yank_<version>_x64_en-US.msi`  | MSI installer — for managed environments |

### Linux

| File | What it is |
|---|---|
| `yank_<version>_amd64.AppImage` | Portable binary — works on most distros |
| `yank_<version>_amd64.deb`      | Debian/Ubuntu/PopOS package |

Notes:

- **GNOME? Use the `.deb`.** The tray icon needs the AppIndicator extension on stock GNOME, and the `.deb` installs the right integration.
- **Wayland?** Global shortcuts are X11-only on Linux. Bind a keyboard shortcut in your desktop settings to run `yank --palette` instead — it toggles the palette through the running app.
- **AppImage won't launch?** Install FUSE (`sudo apt install libfuse2`) or use the `.deb`.

### macOS

Build from source: `make build` (produces `.dmg`)

## Quick Start

1. Install and launch — app runs in system tray
2. Copy anything — text, links, code, images
3. Press `Ctrl+Shift+Space` — palette opens
4. Type what you're looking for — fuzzy or semantic
5. `Enter` to paste

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Space` | Toggle palette (rebindable) |
| `?` | Keyboard cheatsheet |
| `↑` `↓` or `J` `K` | Navigate |
| `Enter` | Paste selected |
| `Tab` | Toggle fuzzy ↔ semantic |
| `Ctrl+P` | Pin / unpin |
| `Ctrl+Backspace` | Delete |

## Configuring AI

Click the **AI** button in the top-right. Two independent features:

1. **Semantic search** — on by default, fully on-device. Optionally add a re-ranker: **Jev** (paste a TypeSafe API key) or **Laya** (run `uv run --with laya-mlx scripts/laya_server.py` on an Apple Silicon Mac). Both get the same request; on a 1,845-clip / 559-query eval, top-1 accuracy is 0.82 on-device, 0.84 with Laya, 0.96 with Jev (was 0.60). See `src-tauri/examples/bench/`.
2. **AI intent labels** — paste an Anthropic key for one-line summaries ("Stripe webhook debug snippet", "login URL"). Off by default.

## Status: Early Alpha

Yank is being built in public. Things may break. Features may change. We're shipping fast and listening to feedback.

**Current limitations:**
- macOS builds require building from source
- Some polish items (animations, edge cases) in progress
- Documentation improving daily

**Coming soon:**
- Sync across devices (local network option)
- More category heuristics
- Plugin/extension API

## Architecture

| Concern | Implementation |
|---|---|
| Framework | **Tauri v2** — Rust backend, React + TypeScript frontend |
| Storage | SQLite + FTS5 |
| Clipboard | `arboard` crate, 500ms polling + dedupe |
| Semantic search | EmbeddingGemma-300M (4-bit ONNX via fastembed) cosine + small BM25 nudge |
| Re-ranking (optional) | One System One Choice over the top 50 — TypeSafe Jev or local Laya |

## Building from Source

```sh
# Linux
./build.sh install && ./build.sh build

# Windows
.\build.ps1 install; .\build.ps1 build

# macOS (via make)
make install && make build
```

## Privacy

- All data stored locally in SQLite — never leaves your machine
- Fuzzy and semantic search are fully local; only the opt-in Jev re-ranker sends your query and top matches to TypeSafe
- Network calls: one-time model download, plus TypeSafe or Anthropic only if you configure them
- No telemetry, no analytics, no accounts

## Let's Build Together

- ⭐ Star us on GitHub
- 🐛 Report bugs
- 💡 Request features
- 🗣️ Spread the word

**Yank** — find anything you ever copied.
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

The entire "find → paste" loop takes under five seconds. Semantic search runs on-device out of the box; TypeSafe's Jev re-ranking is an opt-in upgrade if you bring your own API key.

## Why Yank?

| Problem | Yank's Solution |
|--------|-------------------|
| "I know I copied that link but can't find it" | Semantic search — describe what you remember, not what you copied |
| "Clipboard managers are cluttered / slow" | 500ms capture, SQLite+FTS5, keyboard-first UI |
| "I want AI but don't trust cloud with my data" | Default semantic search runs on-device; cloud re-ranking is opt-in |
| "I want AI search that understands meaning" | Local embeddings + keyword search, fused by rank; optionally TypeSafe Jev |
| "I want AI labels but not monthly fees" | Optional Anthropic key — you control your usage and spend |

## Features

- **Silent auto-capture** — copied text and images are captured automatically, with sensitive-copy filtering
- **Skip sensitive copies** — on-device checks for card numbers, Social Security numbers, and recognizable credentials; honors confidential clipboard markers
- **Image capture & paste** — screenshots and images captured automatically; full-resolution preview and one-key paste-back
- **Auto-categorization** — clips sorted into `code`, `url`, `email`, `phone`, `color`, `path`, `text`, `address`, `number`, or `image`
- **Semantic search** — on-device ONNX embeddings (BGE Small / MiniLM), no key or network needed after the first model download.
- **TypeSafe Jev (opt-in)** — paste your own TypeSafe API key to re-rank a keyword shortlist with Jev instead.
- **Fuzzy search** — keystroke-level fast, SQLite FTS5 with BM25 ranking
- **Hybrid ranking** — vector and BM25 pools fused with reciprocal rank fusion (or Jev scores with TypeSafe)
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

1. **Semantic search** — on by default with a local embedding model. Optionally switch to TypeSafe's Jev by pasting your own API key.
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
| Semantic search | fastembed ONNX (local, default) or TypeSafe Jev (opt-in) |
| Search | BM25 (FTS5) + cosine, fused via RRF; or BM25 → Jev re-rank |

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

- Clipboard history is stored locally in SQLite
- **Skip sensitive copies** is on by default in **Tweaks → shield icon → Privacy & usage**. It excludes recognized card numbers, formatted or labeled US Social Security numbers, labeled credentials, supported token patterns, and private-key headers before saving. Copies marked confidential or excluded from history by their source app are always skipped, even when text detection is off
- Normal paste still works. Detection cannot identify every unmarked password or sensitive image, and enabling it does not remove existing history. See [the sensitive-copy policy](docs/sensitive-copies.md) for exact rules, platform support, and limitations
- Fuzzy and default semantic search are fully local; only the opt-in TypeSafe provider sends your query and matching clip contents off-device
- Network calls support model downloads, updates, optional TypeSafe/Anthropic features, and usage sharing if you enable it
- Usage sharing through Umami is **off by default**. A one-time prompt asks for permission; change your choice in **Tweaks → shield icon → Privacy & usage**
- Usage statistics contain feature names, coarse result counts, timings, app version, OS, and a random installation ID. No clipboard content, images, search terms, titles, source apps, file paths, or API keys are sent in telemetry
- Turning sharing off stops pending telemetry and resets the random ID. No account is required

See [the telemetry guide](docs/telemetry.md) for events, privacy boundaries, and reading desktop insights in Umami.

## Let's Build Together

- ⭐ Star us on GitHub
- 🐛 Report bugs
- 💡 Request features
- 🗣️ Spread the word

**Yank** — find anything you ever copied.

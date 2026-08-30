# Changelog

All notable changes to this project are documented in this file.

## [0.7.61] - 2026-08-30

### Fixed

- **Auto-paste now works on Windows and Linux.** Previously only macOS returned focus to the previous app and synthesized the paste keystroke; on Windows and Linux the palette only copied to the clipboard and closed. Both platforms now restore focus and send `Ctrl+V`:
  - Windows remembers the foreground window before the palette opens and hands focus back to it with `SetForegroundWindow` before pasting.
  - Linux synthesizes input through pure-Rust backends (`x11rb` XTest on X11, the wlroots/KDE virtual-keyboard protocol on Wayland), removing the need for a native `libxdo` dependency at build or run time.
- **Graceful copy-only fallback on Wayland.** Where the compositor exposes no virtual-keyboard protocol (e.g. GNOME/Mutter), auto-paste is skipped and the item is left on the clipboard for a manual `Ctrl+V`; the palette still closes cleanly instead of erroring.

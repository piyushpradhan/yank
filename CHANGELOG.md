# Changelog

Notable changes for each stable release of Yank. Generated with
[git-cliff](https://git-cliff.org); existing entries can be edited for clarity.
Historical entries were backfilled from Git tags and commit messages.

## [0.7.75](https://github.com/piyushpradhan/yank/releases/tag/v0.7.75) - 2026-10-22

### Added

- Let users allow sensitive copies in clipboard history (#66) ([f27cbdb](https://github.com/piyushpradhan/yank/commit/f27cbdbc36d3fdae19bbfe00ed330d93b5a66a0b))

**Full changelog:** [v0.7.74...v0.7.75](https://github.com/piyushpradhan/yank/compare/v0.7.74...v0.7.75)

## [0.7.74](https://github.com/piyushpradhan/yank/releases/tag/v0.7.74) - 2026-10-21

### Added

- Skip sensitive copies before saving clipboard history, with on-device detection enabled by default in Tweaks → Privacy & usage.
- Recognize card numbers, formatted or labeled US Social Security numbers, labeled credentials, supported token patterns, and private-key headers. Respect confidential clipboard markers on macOS, Windows, X11, and supported native Wayland compositors.
- Document the exact exclusions and detection limits in the [sensitive-copy policy](https://github.com/piyushpradhan/yank/blob/main/docs/sensitive-copies.md). Normal paste still works; existing history is unchanged.

### Fixed

- Bind native Wayland privacy checks and text/image reads to the same clipboard offer, preventing a backend mismatch from bypassing sensitive-copy protection.

**Full changelog:** [v0.7.72...v0.7.74](https://github.com/piyushpradhan/yank/compare/v0.7.72...v0.7.74)

## [0.7.73](https://github.com/piyushpradhan/yank/releases/tag/v0.7.73) - 2026-10-21

Release canceled before publication after a Wayland privacy issue was found. Included in 0.7.74.

## [0.7.72](https://github.com/piyushpradhan/yank/releases/tag/v0.7.72) - 2026-10-14

### Added

- Add opt-in Umami usage telemetry ([e99fe6f](https://github.com/piyushpradhan/yank/commit/e99fe6f3b5131aa2b89f18890f3f2340dce18fdd))

**Full changelog:** [v0.7.71...v0.7.72](https://github.com/piyushpradhan/yank/compare/v0.7.71...v0.7.72)

## [0.7.71](https://github.com/piyushpradhan/yank/releases/tag/v0.7.71) - 2026-10-13

### Maintenance

- **release:** Generate versioned changelogs ([d581a9c](https://github.com/piyushpradhan/yank/commit/d581a9c55c8ea95c6a5d9f4ae0bdfc12b996bed1))

**Full changelog:** [v0.7.70...v0.7.71](https://github.com/piyushpradhan/yank/compare/v0.7.70...v0.7.71)

## [0.7.70](https://github.com/piyushpradhan/yank/releases/tag/v0.7.70) - 2026-10-13

### Fixed

- Stop the linux appimage bundling libwayland-client ([5066f49](https://github.com/piyushpradhan/yank/commit/5066f497f5b9428ddc324a39a13fffdcc12a01af))

**Full changelog:** [v0.7.69...v0.7.70](https://github.com/piyushpradhan/yank/compare/v0.7.69...v0.7.70)

## [0.7.69](https://github.com/piyushpradhan/yank/releases/tag/v0.7.69) - 2026-10-13

### Added

- Add monochrome tray icon option ([c45adac](https://github.com/piyushpradhan/yank/commit/c45adac2fca6417f5066e5bcb243ce523e22bfcb))

### Fixed

- Pick monochrome tray glyph from the tray theme, add icon mode submenu ([b309841](https://github.com/piyushpradhan/yank/commit/b309841af2908bc4546a9007db6f728515546315))

**Full changelog:** [v0.7.68...v0.7.69](https://github.com/piyushpradhan/yank/compare/v0.7.68...v0.7.69)

## [0.7.68](https://github.com/piyushpradhan/yank/releases/tag/v0.7.68) - 2026-10-10

### Fixed

- Harden backend and UI against chaos monkey findings ([16d0b58](https://github.com/piyushpradhan/yank/commit/16d0b5818ae894d41ac08994a028a0d7d2a220a7))

**Full changelog:** [v0.7.67...v0.7.68](https://github.com/piyushpradhan/yank/compare/v0.7.67...v0.7.68)

## [0.7.67](https://github.com/piyushpradhan/yank/releases/tag/v0.7.67) - 2026-10-08

### Added

- Restore on-device semantic search as default, make Jev opt-in ([502bb2d](https://github.com/piyushpradhan/yank/commit/502bb2d428d1ef00ab78999dcb6983c5309d0190))

**Full changelog:** [v0.7.66...v0.7.67](https://github.com/piyushpradhan/yank/compare/v0.7.66...v0.7.67)

## [0.7.66](https://github.com/piyushpradhan/yank/releases/tag/v0.7.66) - 2026-10-08

### Maintenance

- Update palette semantic test mock for Jev provider ([73ab4f2](https://github.com/piyushpradhan/yank/commit/73ab4f22065132d8e44e140d60071aee12d99776))

**Full changelog:** [v0.7.65...v0.7.66](https://github.com/piyushpradhan/yank/compare/v0.7.65...v0.7.66)

## [0.7.65](https://github.com/piyushpradhan/yank/releases/tag/v0.7.65) - 2026-10-08

### Added

- Replace embedding search with TypeSafe Jev re-ranking ([aeb43ee](https://github.com/piyushpradhan/yank/commit/aeb43ee9a60044d24195d2c8cfb6649a78a00641))

- Rename clipboard items from the palette and Library ([180fe5e](https://github.com/piyushpradhan/yank/commit/180fe5ebad7b74f74da8447b6e4bee01e07f2131))

- Edit item text permanently, in the palette and Library ([3bb767b](https://github.com/piyushpradhan/yank/commit/3bb767bb95598d3d8725a36c427c7fad8e89b674))

### Changed

- Single-row action bars with one primary and calm icon buttons ([86f5736](https://github.com/piyushpradhan/yank/commit/86f57366d0f6e73288bb0ed8722236fcbee0f394))

### Fixed

- Toast renders as a fixed, padded, centred pill ([476cfbc](https://github.com/piyushpradhan/yank/commit/476cfbc9e2f109c2d02b43112bfce2d990e3eb21))

- Show Cmd on macOS and Ctrl elsewhere in shortcut hints ([640cc41](https://github.com/piyushpradhan/yank/commit/640cc41fa4190004174c2a83d9d0f55fe5245bd5))

**Full changelog:** [v0.7.64...v0.7.65](https://github.com/piyushpradhan/yank/compare/v0.7.64...v0.7.65)

## [0.7.64](https://github.com/piyushpradhan/yank/releases/tag/v0.7.64) - 2026-10-07

### Added

- Option to open the palette in semantic search mode by default (#59) ([ddb753a](https://github.com/piyushpradhan/yank/commit/ddb753a8a3a4ea2c49424861fffc182a1601227c))

### Fixed

- Start-in-semantic on first open, apply to library search, switch toggles ([01bb4ed](https://github.com/piyushpradhan/yank/commit/01bb4ed0eef540746d8f0c15b3a7f6cec0405308))

**Full changelog:** [v0.7.63...v0.7.64](https://github.com/piyushpradhan/yank/compare/v0.7.63...v0.7.64)

## [0.7.63](https://github.com/piyushpradhan/yank/releases/tag/v0.7.63) - 2026-09-19

### Added

- **linux:** Tell users when auto-paste fell back to copy-only ([1d800f8](https://github.com/piyushpradhan/yank/commit/1d800f8987c00e443cebabc3cf413b7aa36b3f62))

- **linux:** Tell Wayland users to bind yank --palette as a DE shortcut ([d1ba1ff](https://github.com/piyushpradhan/yank/commit/d1ba1ff8a33e54f6448ed2ee156d994b5a9c594a))

- Start minimized on launch (--minimized) + settings toggle (#56) ([833b4c8](https://github.com/piyushpradhan/yank/commit/833b4c8fae6123ee3b97c47ed4af199572dfddc3))

### Documentation

- Linux install caveats (Wayland, GNOME tray, FUSE) ([686d8ed](https://github.com/piyushpradhan/yank/commit/686d8edfe05bafb39fdf580c4ee938b00e8310e7))

### Fixed

- **linux:** Make library window opaque to stop WebKitGTK ghosting ([e081777](https://github.com/piyushpradhan/yank/commit/e0817771b118e20648ea8990b6e6cb413fca7e0b))

- Buttons on quick palette getting cut off ([72f8c6a](https://github.com/piyushpradhan/yank/commit/72f8c6a1cc8ef4f367fa7a0da7d0761b7a320031))

### Maintenance

- **linux:** Remove stale libxdo installs (enigo replaced it) ([1b0ba96](https://github.com/piyushpradhan/yank/commit/1b0ba96eb2da8c512463ab28b6db1a927e4ab57c))

**Full changelog:** [v0.7.62...v0.7.63](https://github.com/piyushpradhan/yank/compare/v0.7.62...v0.7.63)

## [0.7.62] - 2026-08-30

### Fixed

- **macOS: `yank --palette` no longer crashes the app (#58).** Invoking the documented CLI toggle while Yank was running hit `EXC_BREAKPOINT (SIGTRAP)` in AppKit: the single-instance plugin delivers second-instance arguments on its listener thread (a tokio worker), and `show_palette` performs raw AppKit window ordering (`makeKeyAndOrderFront:`) on whatever thread called it — which modern AppKit traps on. The single-instance callback now marshals its dispatch onto the main thread before touching any window, so `toggle_palette` / `show_palette` / `focus_library` always execute there. The global-hotkey and tray paths were already main-thread and are unaffected. This was a pre-existing latent bug (present since the `--palette` CLI fallback shipped), not a regression from 0.7.61 — recent macOS builds simply started asserting where they used to tolerate off-main-thread ordering.

## [0.7.61] - 2026-08-30

### Fixed

- **Auto-paste now works on Windows and Linux.** Previously only macOS returned focus to the previous app and synthesized the paste keystroke; on Windows and Linux the palette only copied to the clipboard and closed. Both platforms now restore focus and send `Ctrl+V`:
  - Windows remembers the foreground window before the palette opens and hands focus back to it with `SetForegroundWindow` before pasting.
  - Linux synthesizes input through pure-Rust backends (`x11rb` XTest on X11, the wlroots/KDE virtual-keyboard protocol on Wayland), removing the need for a native `libxdo` dependency at build or run time.
- **Graceful copy-only fallback on Wayland.** Where the compositor exposes no virtual-keyboard protocol (e.g. GNOME/Mutter), auto-paste is skipped and the item is left on the clipboard for a manual `Ctrl+V`; the palette still closes cleanly instead of erroring.

## [0.7.60](https://github.com/piyushpradhan/yank/releases/tag/v0.7.60) - 2026-08-14

### Fixed

- **linux:** Stop WebKitGTK ghosting rows in the palette ([f4e7a33](https://github.com/piyushpradhan/yank/commit/f4e7a3377e6714f3721e012c80028aa12d21c793))

**Full changelog:** [v0.7.59...v0.7.60](https://github.com/piyushpradhan/yank/compare/v0.7.59...v0.7.60)

## [0.7.59](https://github.com/piyushpradhan/yank/releases/tag/v0.7.59) - 2026-08-13

### Added

- **landing:** Add interactive query trace ([a1c0882](https://github.com/piyushpradhan/yank/commit/a1c08825277d629911fd3af69ef3982ef108f579))

**Full changelog:** [v0.7.58...v0.7.59](https://github.com/piyushpradhan/yank/compare/v0.7.58...v0.7.59)

## [0.7.58](https://github.com/piyushpradhan/yank/releases/tag/v0.7.58) - 2026-08-09

### Fixed

- **palette:** Restore native focus before paste ([f334780](https://github.com/piyushpradhan/yank/commit/f334780707f75a7d4d5bd96fa5005d200cc46c69))

**Full changelog:** [v0.7.57...v0.7.58](https://github.com/piyushpradhan/yank/compare/v0.7.57...v0.7.58)

## [0.7.57](https://github.com/piyushpradhan/yank/releases/tag/v0.7.57) - 2026-08-09

### Fixed

- **linux:** Resolve scrolling, shortcut and package issues ([f8df391](https://github.com/piyushpradhan/yank/commit/f8df3911e0593706443af44b4550769073e40fcb))

**Full changelog:** [v0.7.56...v0.7.57](https://github.com/piyushpradhan/yank/compare/v0.7.56...v0.7.57)

## [0.7.56](https://github.com/piyushpradhan/yank/releases/tag/v0.7.56) - 2026-08-08

### Added

- **palette:** Reset, edit and auto-paste ([2ef638b](https://github.com/piyushpradhan/yank/commit/2ef638b8c3964df5e8a57e9b970aeea924d2d014))

**Full changelog:** [v0.7.55...v0.7.56](https://github.com/piyushpradhan/yank/compare/v0.7.55...v0.7.56)

## [0.7.55](https://github.com/piyushpradhan/yank/releases/tag/v0.7.55) - 2026-07-20

### Added

- **landing:** Redesign with friendly light, rounded, Inter-led system ([8ff33e0](https://github.com/piyushpradhan/yank/commit/8ff33e02955a0495748481e4342aa33bcf6a7641))

**Full changelog:** [v0.7.54...v0.7.55](https://github.com/piyushpradhan/yank/compare/v0.7.54...v0.7.55)

## [0.7.54](https://github.com/piyushpradhan/yank/releases/tag/v0.7.54) - 2026-07-13

### Fixed

- **watcher:** Dedup clipboard content to prevent duplicate entries ([f9f41e5](https://github.com/piyushpradhan/yank/commit/f9f41e5ba3bfa23c83af7d076c9928e7f49e8ae8))

- **palette:** Make palette a non-activating panel on macOS ([04b69ed](https://github.com/piyushpradhan/yank/commit/04b69ed32efdbcabd904c17c6f15c8e30cd8b4bd))

**Full changelog:** [v0.7.53...v0.7.54](https://github.com/piyushpradhan/yank/compare/v0.7.53...v0.7.54)

## [0.7.53](https://github.com/piyushpradhan/yank/releases/tag/v0.7.53) - 2026-07-02

### Added

- **landing:** Move Product Hunt badge into hero, drop "Watch it work" ([8f8beeb](https://github.com/piyushpradhan/yank/commit/8f8beebf5af73fd1448c6fdd68777da82d6d370b))

**Full changelog:** [v0.7.52...v0.7.53](https://github.com/piyushpradhan/yank/compare/v0.7.52...v0.7.53)

## [0.7.52](https://github.com/piyushpradhan/yank/releases/tag/v0.7.52) - 2026-06-30

### Fixed

- **palette:** Make search icon and placeholder visible in light mode ([fa0abbf](https://github.com/piyushpradhan/yank/commit/fa0abbf8cf26215c5ec69d6c7e8ee9c59796dd76))

**Full changelog:** [v0.7.51...v0.7.52](https://github.com/piyushpradhan/yank/compare/v0.7.51...v0.7.52)

## [0.7.51](https://github.com/piyushpradhan/yank/releases/tag/v0.7.51) - 2026-06-29

### Maintenance

- Remove the outdated favicon ([2a47232](https://github.com/piyushpradhan/yank/commit/2a47232f68b9e46f613fd10d6347b16b3a6416bd))

**Full changelog:** [v0.7.50...v0.7.51](https://github.com/piyushpradhan/yank/compare/v0.7.50...v0.7.51)

## [0.7.50](https://github.com/piyushpradhan/yank/releases/tag/v0.7.50) - 2026-06-26

### Added

- **landing:** Add Product Hunt badge to footer ([7c47410](https://github.com/piyushpradhan/yank/commit/7c47410f665ab99ee6adfac853f8d6de5a82cf31))

**Full changelog:** [v0.7.49...v0.7.50](https://github.com/piyushpradhan/yank/compare/v0.7.49...v0.7.50)

## [0.7.49](https://github.com/piyushpradhan/yank/releases/tag/v0.7.49) - 2026-06-24

### Fixed

- **landing:** Flag macOS as Apple Silicon only on install card ([268fc5d](https://github.com/piyushpradhan/yank/commit/268fc5d8b607b08aa94247f3a3c6018d0f2d9e38))

- **palette:** Reduce blur washout on list panel in light mode ([6358127](https://github.com/piyushpradhan/yank/commit/6358127d65537f7be2136b670cd64a5f1835af7a))

**Full changelog:** [v0.7.48...v0.7.49](https://github.com/piyushpradhan/yank/compare/v0.7.48...v0.7.49)

## [0.7.48](https://github.com/piyushpradhan/yank/releases/tag/v0.7.48) - 2026-06-24

### Fixed

- Stop semantic search empty-state flicker on failed search ([dfb9964](https://github.com/piyushpradhan/yank/commit/dfb9964039c075becb9d9ee4fe9f1ca1f3c9cfb0))

**Full changelog:** [v0.7.47...v0.7.48](https://github.com/piyushpradhan/yank/compare/v0.7.47...v0.7.48)

## [0.7.47](https://github.com/piyushpradhan/yank/releases/tag/v0.7.47) - 2026-06-13

### Added

- **semantic:** Rank colors by perceptual match on explicit color queries ([153083d](https://github.com/piyushpradhan/yank/commit/153083defa63eb10a3d189b1fa66369b3738aa51))

- **semantic:** Gate ambiguous color names; add Library swatch ([d716cc6](https://github.com/piyushpradhan/yank/commit/d716cc6f5863d64ad7ef7e8a0ae33498139f1c05))

### Maintenance

- Sync lockfile versions to 0.7.46 ([36cef5b](https://github.com/piyushpradhan/yank/commit/36cef5b20a7d81aba6416238e90a385fadf45ff4))

**Full changelog:** [v0.7.46...v0.7.47](https://github.com/piyushpradhan/yank/compare/v0.7.46...v0.7.47)

## [0.7.46](https://github.com/piyushpradhan/yank/releases/tag/v0.7.46) - 2026-06-12

### Added

- **semantic:** Color name enrichment for hex/rgb/hsl search ([6c98844](https://github.com/piyushpradhan/yank/commit/6c98844565bb51d1a2e100553033c58d86edb571))

### Maintenance

- **semantic:** Comprehensive color enrichment integration tests ([f4efab8](https://github.com/piyushpradhan/yank/commit/f4efab82bfd52294bdc5c8e53556fe4617e75a63))

**Full changelog:** [v0.7.45...v0.7.46](https://github.com/piyushpradhan/yank/compare/v0.7.45...v0.7.46)

## [0.7.45](https://github.com/piyushpradhan/yank/releases/tag/v0.7.45) - 2026-06-12

### Fixed

- **release:** Include windows-x86_64 in updater manifest (NSIS sig naming) (#47) ([3b473e0](https://github.com/piyushpradhan/yank/commit/3b473e0957e813e03bac4e3f5a051092e7b23d23))

**Full changelog:** [v0.7.44...v0.7.45](https://github.com/piyushpradhan/yank/compare/v0.7.44...v0.7.45)

## [0.7.44](https://github.com/piyushpradhan/yank/releases/tag/v0.7.44) - 2026-06-10

### Fixed

- **updater:** Treat check failures as up-to-date, not a red error ([d4926fe](https://github.com/piyushpradhan/yank/commit/d4926feccad9ac8f371999e990de47b323767fed))

**Full changelog:** [v0.7.43...v0.7.44](https://github.com/piyushpradhan/yank/compare/v0.7.43...v0.7.44)

## [0.7.43](https://github.com/piyushpradhan/yank/releases/tag/v0.7.43) - 2026-06-10

### Added

- **tweaks:** Subtler updates row, drop plain-text-only, surface feedback on landing ([3e55be8](https://github.com/piyushpradhan/yank/commit/3e55be8cbcfc24ead97e81749fc34e853134387b))

**Full changelog:** [v0.7.42...v0.7.43](https://github.com/piyushpradhan/yank/compare/v0.7.42...v0.7.43)

## [0.7.42](https://github.com/piyushpradhan/yank/releases/tag/v0.7.42) - 2026-06-09

### Added

- **welcome:** Prompt for launch-at-login on first install ([b558eb8](https://github.com/piyushpradhan/yank/commit/b558eb8d3d104a6f3c7aa5cd132e6e841a3fc0c0))

**Full changelog:** [v0.7.41...v0.7.42](https://github.com/piyushpradhan/yank/compare/v0.7.41...v0.7.42)

## [0.7.41](https://github.com/piyushpradhan/yank/releases/tag/v0.7.41) - 2026-06-09

### Fixed

- **macos:** Hide dock icon when library window is closed ([2420caf](https://github.com/piyushpradhan/yank/commit/2420caf4991f50e996cea1f74bda8b01037d2bf6))

**Full changelog:** [v0.7.40...v0.7.41](https://github.com/piyushpradhan/yank/compare/v0.7.40...v0.7.41)

## [0.7.40](https://github.com/piyushpradhan/yank/releases/tag/v0.7.40) - 2026-06-09

### Fixed

- **release:** Re-sign macOS bundle ad-hoc in cask postflight ([3b469f1](https://github.com/piyushpradhan/yank/commit/3b469f13040d253bec75b1f5b405a350e7bbc56a))

**Full changelog:** [v0.7.39...v0.7.40](https://github.com/piyushpradhan/yank/compare/v0.7.39...v0.7.40)

## [0.7.39](https://github.com/piyushpradhan/yank/releases/tag/v0.7.39) - 2026-06-09

### Fixed

- **landing:** Label reads "Copied" after click, and lede says "Copy the command" ([71c0d1f](https://github.com/piyushpradhan/yank/commit/71c0d1fbb491ace1b4bd0e54d45b99caf0aab708))

**Full changelog:** [v0.7.38...v0.7.39](https://github.com/piyushpradhan/yank/compare/v0.7.38...v0.7.39)

## [0.7.38](https://github.com/piyushpradhan/yank/releases/tag/v0.7.38) - 2026-06-09

### Added

- **landing:** Brew install path + Install section, auto-update tap on release ([3069542](https://github.com/piyushpradhan/yank/commit/3069542cd74a4c32273ba6c6635bd266b7c73941))

**Full changelog:** [v0.7.37...v0.7.38](https://github.com/piyushpradhan/yank/compare/v0.7.37...v0.7.38)

## [0.7.37](https://github.com/piyushpradhan/yank/releases/tag/v0.7.37) - 2026-06-09

### Fixed

- **release:** Only upload installer artifacts, not bundler helpers ([363048a](https://github.com/piyushpradhan/yank/commit/363048a21f9ec37ee6610a519893739eb3ed5d24))

**Full changelog:** [v0.7.36...v0.7.37](https://github.com/piyushpradhan/yank/compare/v0.7.36...v0.7.37)

## [0.7.36](https://github.com/piyushpradhan/yank/releases/tag/v0.7.36) - 2026-06-07

### Maintenance

- **landing:** Drop hi@yankapp.io contact link from footer ([ba98780](https://github.com/piyushpradhan/yank/commit/ba987805cf21124db94d61e11394250e5491a3ac))

**Full changelog:** [v0.7.35...v0.7.36](https://github.com/piyushpradhan/yank/compare/v0.7.35...v0.7.36)

## [0.7.35](https://github.com/piyushpradhan/yank/releases/tag/v0.7.35) - 2026-06-07

### Added

- **tweaks:** Add subtle GitHub Issues link for feedback ([1462c1c](https://github.com/piyushpradhan/yank/commit/1462c1ca1e9d6bf1140ddc697401d42169557bd4))

**Full changelog:** [v0.7.34...v0.7.35](https://github.com/piyushpradhan/yank/compare/v0.7.34...v0.7.35)

## [0.7.34](https://github.com/piyushpradhan/yank/releases/tag/v0.7.34) - 2026-06-07

### Added

- **updater:** Silent auto-update on launch + manual check in Tweaks (#46) ([7140b76](https://github.com/piyushpradhan/yank/commit/7140b760c4b48c40a2fc45d280ed4e9bb73455ef))

**Full changelog:** [v0.7.33...v0.7.34](https://github.com/piyushpradhan/yank/compare/v0.7.33...v0.7.34)

## [0.7.33](https://github.com/piyushpradhan/yank/releases/tag/v0.7.33) - 2026-06-07

### Maintenance

- **landing:** Switch analytics from Vercel to Umami Cloud ([9b0b1b1](https://github.com/piyushpradhan/yank/commit/9b0b1b183f3e5b8e90f29d1cc4089cbda1d4022b))

**Full changelog:** [v0.7.32...v0.7.33](https://github.com/piyushpradhan/yank/compare/v0.7.32...v0.7.33)

## [0.7.32](https://github.com/piyushpradhan/yank/releases/tag/v0.7.32) - 2026-06-07

### Fixed

- **search:** Score-rank fuzzy matches and stabilize highlight position ([dc5055b](https://github.com/piyushpradhan/yank/commit/dc5055be1cde85314141d72cb01358886660b58d))

### Maintenance

- **landing:** Drop Pricing link from top nav ([5356b27](https://github.com/piyushpradhan/yank/commit/5356b27ee3e5634c1067c864f3f6a9ec386a9d06))

**Full changelog:** [v0.7.31...v0.7.32](https://github.com/piyushpradhan/yank/compare/v0.7.31...v0.7.32)

## [0.7.31](https://github.com/piyushpradhan/yank/releases/tag/v0.7.31) - 2026-06-06

### Maintenance

- **eval:** Expand dataset to 136 items + 56 diversified queries ([5c6e08e](https://github.com/piyushpradhan/yank/commit/5c6e08e0e8e823e5420dcb4c5bad14dedfe1282b))

**Full changelog:** [v0.7.30...v0.7.31](https://github.com/piyushpradhan/yank/compare/v0.7.30...v0.7.31)

## [0.7.30](https://github.com/piyushpradhan/yank/releases/tag/v0.7.30) - 2026-06-06

### Maintenance

- **eval:** Extend harness with hybrid v4 + v3/v4 comparison report ([8a18c52](https://github.com/piyushpradhan/yank/commit/8a18c52524c0b9a92659a9b1f65a4a9511e67b59))

**Full changelog:** [v0.7.29...v0.7.30](https://github.com/piyushpradhan/yank/compare/v0.7.29...v0.7.30)

## [0.7.29](https://github.com/piyushpradhan/yank/releases/tag/v0.7.29) - 2026-06-06

### Fixed

- Update the logo on titlebar ([57b1a13](https://github.com/piyushpradhan/yank/commit/57b1a135a208107d10faf337ef14690dc2588793))

- **search:** Soften category filter into RRF boost ([b6bfe73](https://github.com/piyushpradhan/yank/commit/b6bfe737f47d8cf0cc5b28927e543129459ad9be))

### Maintenance

- **assets:** Simplify mark.svg ([d20392c](https://github.com/piyushpradhan/yank/commit/d20392cf104fbd024a284c51a547fe00a9c04924))

**Full changelog:** [v0.7.28...v0.7.29](https://github.com/piyushpradhan/yank/compare/v0.7.28...v0.7.29)

## [0.7.28](https://github.com/piyushpradhan/yank/releases/tag/v0.7.28) - 2026-06-06

### Fixed

- **library:** Add breathing room between traffic lights and title-bar logo (#45) ([05438c1](https://github.com/piyushpradhan/yank/commit/05438c135369efc21a0743a8c3de43636f4d3497))

**Full changelog:** [v0.7.27...v0.7.28](https://github.com/piyushpradhan/yank/compare/v0.7.27...v0.7.28)

## [0.7.27](https://github.com/piyushpradhan/yank/releases/tag/v0.7.27) - 2026-06-06

### Added

- **library:** Swap title-bar dot+wordmark for the brand logo (#43) ([cc69fd6](https://github.com/piyushpradhan/yank/commit/cc69fd60159abd56d13973c1ae18974ff3155adc))

### Documentation

- Add seo-changes.html walkthrough (#44) ([7113a80](https://github.com/piyushpradhan/yank/commit/7113a80abd9b26a34389ff7c94909897d977efa1))

**Full changelog:** [v0.7.26...v0.7.27](https://github.com/piyushpradhan/yank/compare/v0.7.26...v0.7.27)

## [0.7.26](https://github.com/piyushpradhan/yank/releases/tag/v0.7.26) - 2026-06-06

### Fixed

- **palette:** Correct empty-state hint when semantic search has no matches (#42) ([bee4d27](https://github.com/piyushpradhan/yank/commit/bee4d273ca35115a6373af11f95ae79e999830bf))

**Full changelog:** [v0.7.25...v0.7.26](https://github.com/piyushpradhan/yank/compare/v0.7.25...v0.7.26)

## [0.7.25](https://github.com/piyushpradhan/yank/releases/tag/v0.7.25) - 2026-06-06

### Added

- **landing:** Optimize for Google search and AI-engine SEO ([da70be3](https://github.com/piyushpradhan/yank/commit/da70be3530cace88d512ebf08214d0ba898479e2))

**Full changelog:** [v0.7.24...v0.7.25](https://github.com/piyushpradhan/yank/compare/v0.7.24...v0.7.25)

## [0.7.24](https://github.com/piyushpradhan/yank/releases/tag/v0.7.24) - 2026-06-06

### Added

- **search:** Route semantic queries by content type and shed filler verbs ([7074181](https://github.com/piyushpradhan/yank/commit/7074181fec5067a58a938030ee97f9a62066d29b))

**Full changelog:** [v0.7.23...v0.7.24](https://github.com/piyushpradhan/yank/compare/v0.7.23...v0.7.24)

## [0.7.23](https://github.com/piyushpradhan/yank/releases/tag/v0.7.23) - 2026-06-06

### Fixed

- **library:** Tighten the semantic-search time-filter pill ([c95994f](https://github.com/piyushpradhan/yank/commit/c95994f7b5c1fbbbae631daed6ec84e6d69d01d0))

**Full changelog:** [v0.7.22...v0.7.23](https://github.com/piyushpradhan/yank/compare/v0.7.22...v0.7.23)

## [0.7.22](https://github.com/piyushpradhan/yank/releases/tag/v0.7.22) - 2026-06-06

### Added

- **palette:** Add native vibrancy so the quick palette feels like Raycast ([566374e](https://github.com/piyushpradhan/yank/commit/566374e3ee8849659ef775be062de7b6fa33c94d))

**Full changelog:** [v0.7.21...v0.7.22](https://github.com/piyushpradhan/yank/compare/v0.7.21...v0.7.22)

## [0.7.21](https://github.com/piyushpradhan/yank/releases/tag/v0.7.21) - 2026-06-06

### Fixed

- **library:** Mute day-bucket headers so they don't compete with category chips (#41) ([3e65ecf](https://github.com/piyushpradhan/yank/commit/3e65ecfaef3b70681f8276752c0629c4e72771ad))

**Full changelog:** [v0.7.20...v0.7.21](https://github.com/piyushpradhan/yank/compare/v0.7.20...v0.7.21)

## [0.7.20](https://github.com/piyushpradhan/yank/releases/tag/v0.7.20) - 2026-06-06

### Fixed

- **library:** Expand keyboard shortcuts to 0-9 for all categories ([cb023c7](https://github.com/piyushpradhan/yank/commit/cb023c75d71882fe96f44160ef0e2878928f74e0))

**Full changelog:** [v0.7.19...v0.7.20](https://github.com/piyushpradhan/yank/compare/v0.7.19...v0.7.20)

## [0.7.19](https://github.com/piyushpradhan/yank/releases/tag/v0.7.19) - 2026-06-06

### Fixed

- **library:** Pin items to their own bucket so they aren't scattered by day (#40) ([df32760](https://github.com/piyushpradhan/yank/commit/df32760aac8636aad8bac0df914c26fa5569ef02))

**Full changelog:** [v0.7.18...v0.7.19](https://github.com/piyushpradhan/yank/compare/v0.7.18...v0.7.19)

## [0.7.18](https://github.com/piyushpradhan/yank/releases/tag/v0.7.18) - 2026-06-06

### Fixed

- **library:** Limit numbered keyboard shortcuts to categories only ([50451b6](https://github.com/piyushpradhan/yank/commit/50451b623add52f4b94243afdcc0522ef7986d4c))

**Full changelog:** [v0.7.17...v0.7.18](https://github.com/piyushpradhan/yank/compare/v0.7.17...v0.7.18)

## [0.7.17](https://github.com/piyushpradhan/yank/releases/tag/v0.7.17) - 2026-06-06

### Fixed

- **landing:** Show correct download button label for mobile vs desktop ([73416d4](https://github.com/piyushpradhan/yank/commit/73416d48f0fe6f4c9f68bee234bfd231981cecce))

**Full changelog:** [v0.7.16...v0.7.17](https://github.com/piyushpradhan/yank/compare/v0.7.16...v0.7.17)

## [0.7.16](https://github.com/piyushpradhan/yank/releases/tag/v0.7.16) - 2026-06-06

### Changed

- Remove pricing section from landing page ([0bf4a29](https://github.com/piyushpradhan/yank/commit/0bf4a29b5d9dfab7ff2e1d535b338070d5a94c85))

**Full changelog:** [v0.7.15...v0.7.16](https://github.com/piyushpradhan/yank/compare/v0.7.15...v0.7.16)

## [0.7.15](https://github.com/piyushpradhan/yank/releases/tag/v0.7.15) - 2026-06-06

### Fixed

- **icons:** Apply safe-area padding so dock/taskbar size matches other apps ([3bd6cc8](https://github.com/piyushpradhan/yank/commit/3bd6cc892affb41e0ac6fc4d54d2c138d18e2666))

**Full changelog:** [v0.7.14...v0.7.15](https://github.com/piyushpradhan/yank/compare/v0.7.14...v0.7.15)

## [0.7.14](https://github.com/piyushpradhan/yank/releases/tag/v0.7.14) - 2026-06-05

### Fixed

- **library,palette:** Keep highlight at row index when delete/pin reorders the list ([6751b05](https://github.com/piyushpradhan/yank/commit/6751b0550532cf2624f30a8d9b5660fac6bd7c14))

**Full changelog:** [v0.7.13...v0.7.14](https://github.com/piyushpradhan/yank/compare/v0.7.13...v0.7.14)

## [0.7.13](https://github.com/piyushpradhan/yank/releases/tag/v0.7.13) - 2026-06-05

### Changed

- New logo mark — orange circle with abstract pull/extract bars ([4fe8f11](https://github.com/piyushpradhan/yank/commit/4fe8f11d49f9983ac16cdbfabf1097a859dcb2b6))

**Full changelog:** [v0.7.12...v0.7.13](https://github.com/piyushpradhan/yank/compare/v0.7.12...v0.7.13)

## [0.7.12](https://github.com/piyushpradhan/yank/releases/tag/v0.7.12) - 2026-06-05

### Fixed

- Prevent layout shift in hero typing animation when text is empty ([0a072b8](https://github.com/piyushpradhan/yank/commit/0a072b8d6501575ac6f8fceff1ded5f35ef5758d))

**Full changelog:** [v0.7.11...v0.7.12](https://github.com/piyushpradhan/yank/compare/v0.7.11...v0.7.12)

## [0.7.11](https://github.com/piyushpradhan/yank/releases/tag/v0.7.11) - 2026-06-05

### Added

- **watcher:** Enable image capture on macOS and Linux ([e544c38](https://github.com/piyushpradhan/yank/commit/e544c38df5346b66c43a9374fb00a432fb225f3b))

- Customizable global shortcut with first-run welcome modal ([9e4cead](https://github.com/piyushpradhan/yank/commit/9e4cead5a5280d7c8db7a95af1baac8974eb2d7c))

### Fixed

- **library:** Keep highlight at row index when pin/unpin reorders the list ([70823fb](https://github.com/piyushpradhan/yank/commit/70823fb30fc1151bb711c5d0342f58c75ee230bf))

**Full changelog:** [v0.7.10...v0.7.11](https://github.com/piyushpradhan/yank/compare/v0.7.10...v0.7.11)

## [0.7.10](https://github.com/piyushpradhan/yank/releases/tag/v0.7.10) - 2026-06-05

### Maintenance

- Drop stale screenshots, point link previews at brand mark ([19fd8ad](https://github.com/piyushpradhan/yank/commit/19fd8adb8f153c5e62c8efd8f5e64ab90a3228f9))

**Full changelog:** [v0.7.9...v0.7.10](https://github.com/piyushpradhan/yank/compare/v0.7.9...v0.7.10)

## [0.7.9](https://github.com/piyushpradhan/yank/releases/tag/v0.7.9) - 2026-06-05

### Changed

- Nine small UX fixes across library, palette, and tweaks ([474fe99](https://github.com/piyushpradhan/yank/commit/474fe993658021ca3d89a33f91f090c3991da1e2))

**Full changelog:** [v0.7.8...v0.7.9](https://github.com/piyushpradhan/yank/compare/v0.7.8...v0.7.9)

## [0.7.8](https://github.com/piyushpradhan/yank/releases/tag/v0.7.8) - 2026-06-05

### Changed

- Fix 7 unpolished areas across frontend and backend ([e27d827](https://github.com/piyushpradhan/yank/commit/e27d8278046226d70cf6b1b06db2f7536cd11a07))

**Full changelog:** [v0.7.7...v0.7.8](https://github.com/piyushpradhan/yank/compare/v0.7.7...v0.7.8)

## [0.7.7](https://github.com/piyushpradhan/yank/releases/tag/v0.7.7) - 2026-06-05

### Added

- **brand:** Introduce yank logo and point landing at tryyank.com ([68ea76a](https://github.com/piyushpradhan/yank/commit/68ea76a03e91841c8bcedfc08ab55dcd2fe6cfa1))

**Full changelog:** [v0.7.6...v0.7.7](https://github.com/piyushpradhan/yank/compare/v0.7.6...v0.7.7)

## [0.7.6](https://github.com/piyushpradhan/yank/releases/tag/v0.7.6) - 2026-06-05

### Fixed

- **landing:** Bundle inline scripts so OS icon injection runs ([1821373](https://github.com/piyushpradhan/yank/commit/1821373a4665845bbd239dd6c2e54510063b6ebe))

**Full changelog:** [v0.7.5...v0.7.6](https://github.com/piyushpradhan/yank/compare/v0.7.5...v0.7.6)

## [0.7.5](https://github.com/piyushpradhan/yank/releases/tag/v0.7.5) - 2026-06-04

### Fixed

- **landing:** Make download button OS icons visible ([c1a6996](https://github.com/piyushpradhan/yank/commit/c1a69965d04f74cf23d9758565c000f6439698c2))

**Full changelog:** [v0.7.4...v0.7.5](https://github.com/piyushpradhan/yank/compare/v0.7.4...v0.7.5)

## [0.7.4](https://github.com/piyushpradhan/yank/releases/tag/v0.7.4) - 2026-06-04

### Changed

- **palette:** Move enter-key and focus handling into Palette, add theme icons ([e0e9673](https://github.com/piyushpradhan/yank/commit/e0e967364d8443bea8de1c7790637f35177de944))

### Fixed

- **macos:** Add app menu so standard shortcuts work on chromeless windows ([24fa894](https://github.com/piyushpradhan/yank/commit/24fa8947f8d3b2e9d0eb146ddd98d713500be74f))

- **landing:** Update GitHub URLs from recall to yank, bump version to 0.7.2 ([f0639be](https://github.com/piyushpradhan/yank/commit/f0639be72d2bab820c860d2b42300c04b7b42748))

**Full changelog:** [v0.7.3...v0.7.4](https://github.com/piyushpradhan/yank/compare/v0.7.3...v0.7.4)

## [0.7.3](https://github.com/piyushpradhan/yank/releases/tag/v0.7.3) - 2026-06-04

### Maintenance

- **auto-tag:** Grant actions:write so dispatch can fire release.yml ([6d7e173](https://github.com/piyushpradhan/yank/commit/6d7e1734e71e69b5fd9af93a410bd651a67db729))

**Full changelog:** [v0.7.2...v0.7.3](https://github.com/piyushpradhan/yank/compare/v0.7.2...v0.7.3)

## [0.7.2](https://github.com/piyushpradhan/yank/releases/tag/v0.7.2) - 2026-06-04

### Maintenance

- **release:** Only run on tags and release branches, drop feature-branch CI ([8c6aad5](https://github.com/piyushpradhan/yank/commit/8c6aad54fdd9742ca31160c21775d552cecf2a76))

**Full changelog:** [v0.7.1...v0.7.2](https://github.com/piyushpradhan/yank/compare/v0.7.1...v0.7.2)

## [0.7.1](https://github.com/piyushpradhan/yank/releases/tag/v0.7.1) - 2026-06-04

### Added

- **landing:** Add Vercel Analytics with download event tracking ([21d3447](https://github.com/piyushpradhan/yank/commit/21d3447201bad5e00c058b16eb7ff2df466a7c04))

**Full changelog:** [v0.7.0...v0.7.1](https://github.com/piyushpradhan/yank/compare/v0.7.0...v0.7.1)

## [0.7.0](https://github.com/piyushpradhan/yank/releases/tag/v0.7.0) - 2026-06-04

### Added

- **chrome:** Platform-aware window radius, transparent bg + CI release dispatch ([2d821bb](https://github.com/piyushpradhan/yank/commit/2d821bb8d0570f8f1aad0ffd73af4d7403e6f00e))

- Add feature flag system for paywall gating ([8fdc2d8](https://github.com/piyushpradhan/yank/commit/8fdc2d8782262031e4372a5be2e8c9a37c59b3a1))

- Gate semantic search behind feature flag ([2701d9e](https://github.com/piyushpradhan/yank/commit/2701d9e6d3ee9c16968d10407474db2e27e170d8))

- Natural-language time parsing + hybrid semantic search improvements ([d97cb2f](https://github.com/piyushpradhan/yank/commit/d97cb2f926219344ae6eb8ce9e423da1693d5aec))

### Changed

- Add lockedMessage, useFeatureGate, and default locked indicator ([eac81c0](https://github.com/piyushpradhan/yank/commit/eac81c064757fd39d4574546ce40bde6be5794d9))

### Fixed

- Adjust spacing around the titlebar buttons ([83e7116](https://github.com/piyushpradhan/yank/commit/83e7116d64df4ac2ffcd31a2ca4eee9faf761b5d))

- Guard all semantic mode toggle points against locked feature ([a1ee57c](https://github.com/piyushpradhan/yank/commit/a1ee57c5621f9b5347174d8cb208d9a7e5cf304a))

- Remove keyboard shortcut from Download button on landing page ([28b95ff](https://github.com/piyushpradhan/yank/commit/28b95ff1d48c6dac053900cb6380b3b25be36d7b))

- Remove all keyboard shortcut displays from landing and app ([7191a58](https://github.com/piyushpradhan/yank/commit/7191a5866c389ce0e47cc45b428439f3cd3bd193))

- **landing:** Center version tag with logo, use pkg version as fallback ([ac9f31c](https://github.com/piyushpradhan/yank/commit/ac9f31cd9089931d320613bea3421bf029866d10))

- Multiple UI fixes and polishing ([e280449](https://github.com/piyushpradhan/yank/commit/e280449b55bac1b8f1c327d9712b04b5e22d6816))

### Maintenance

- Auto-publish patch releases on every push to main ([c866890](https://github.com/piyushpradhan/yank/commit/c866890fdf68c1d3abd7473ce73aa07ce6fcfe15))

**Full changelog:** [v0.6.9...v0.7.0](https://github.com/piyushpradhan/yank/compare/v0.6.9...v0.7.0)

## [0.6.9](https://github.com/piyushpradhan/yank/releases/tag/v0.6.9) - 2026-05-31

### Added

- **landing:** Redesign with OS-detected downloads, SEO/AI-friendly content, ember-design-system polish ([8b56a2e](https://github.com/piyushpradhan/yank/commit/8b56a2ee0600d3f3e795c28b0c89ffb7050118f9))

- **landing:** Self-host Geist via @fontsource instead of Google Fonts CDN ([6c9349a](https://github.com/piyushpradhan/yank/commit/6c9349aa3f9d28dc320235fe3f88051fc8c5e45a))

- **landing:** Rebuild landing on Yank design from Claude Design handoff ([2e07ab7](https://github.com/piyushpradhan/yank/commit/2e07ab730fce530b5ebe72a436c9542d22ba0f38))

- **titlebar:** Platform-aware custom titlebar + window chrome polish ([6f3d620](https://github.com/piyushpradhan/yank/commit/6f3d62085d9bae30979ad0bf59b01aa55683c890))

### Fixed

- **landing:** Declare Geist font custom properties on :root so they resolve at runtime ([63d3ac5](https://github.com/piyushpradhan/yank/commit/63d3ac52853c3ec9c005e548a7ef8ecef35727db))

- **landing:** Force Geist + Source Serif font vars to override ember tokens ([0c18832](https://github.com/piyushpradhan/yank/commit/0c1883275157b79ed4175b24465d6545051cdf68))

- **deps:** Bump ember-design-system to main HEAD with layout/text primitives (#28) ([ecaa5ad](https://github.com/piyushpradhan/yank/commit/ecaa5ad14d584e03e427e486a4f445e064bd18c9))

- **release:** Make in-place version rewrite portable to macOS (#29) ([3ee4c1f](https://github.com/piyushpradhan/yank/commit/3ee4c1fdc48c63c2be5a43cc3ceaf0abae57c8c9))

**Full changelog:** [v0.6.8...v0.6.9](https://github.com/piyushpradhan/yank/compare/v0.6.8...v0.6.9)

## [0.6.8](https://github.com/piyushpradhan/yank/releases/tag/v0.6.8) - 2026-05-27

### Added

- Update the keybinds to use not-so-common keybinds ([168435f](https://github.com/piyushpradhan/yank/commit/168435f2798186acc7b63a46d71df4147044a34d))

### Changed

- Build all UI from ember-design-system (#24) ([f4f10bb](https://github.com/piyushpradhan/yank/commit/f4f10bb160fff365b022b95fc7085f1b169217a8))

### Fixed

- Sync release version into built artifacts on manual dispatch (#23) ([273a2f2](https://github.com/piyushpradhan/yank/commit/273a2f2bc6301f5a0170de91b0b67b8cd2903096))

- Minor UI adjustments ([eeba19b](https://github.com/piyushpradhan/yank/commit/eeba19b4e7695da32c8f23ffc4faffb9fa43f20c))

### Maintenance

- Refactor code to use re-usable components ([401fc9c](https://github.com/piyushpradhan/yank/commit/401fc9c664e8cb97997c732fdb70f972ba198cac))

- Polish UI elements ([80764b5](https://github.com/piyushpradhan/yank/commit/80764b5bcd5404d4037cf8d4346442126623709c))

- UI revamp ([7ecbb3c](https://github.com/piyushpradhan/yank/commit/7ecbb3c8ab9cb850821956946ce30ea2c06a3ac3))

**Full changelog:** [v0.6.7...v0.6.8](https://github.com/piyushpradhan/yank/compare/v0.6.7...v0.6.8)

## [0.6.7](https://github.com/piyushpradhan/yank/releases/tag/v0.6.7) - 2026-05-23

### Added

- Dynamic shortcut recording, live hint display, better key fallback (#22) ([bdcafdf](https://github.com/piyushpradhan/yank/commit/bdcafdf2eb865550c214feab5ec067faa035c28d))

### Changed

- Redesign action bar buttons with grouping, separators, and tooltip shortcuts (#21) ([9db86a3](https://github.com/piyushpradhan/yank/commit/9db86a3284a742423deeee7c8e45eddadc79770e))

**Full changelog:** [v0.6.6...v0.6.7](https://github.com/piyushpradhan/yank/compare/v0.6.6...v0.6.7)

## [0.6.6](https://github.com/piyushpradhan/yank/releases/tag/v0.6.6) - 2026-05-23

### Added

- Use Kbd from ember-design-system, bump to latest HEAD (#20) ([0d467c6](https://github.com/piyushpradhan/yank/commit/0d467c69dad0c6f09b4a573c21b4eb2128993592))

### Changed

- Update font everywhere to Geist ([b9ca7ff](https://github.com/piyushpradhan/yank/commit/b9ca7ff5233033bebcae28fafe4f17866fd4010a))

### Maintenance

- Update lockfiles for yank rename + v0.6.5 ([e23bb2d](https://github.com/piyushpradhan/yank/commit/e23bb2d032f56478654d45ded254db078fd50f43))

**Full changelog:** [v0.6.5...v0.6.6](https://github.com/piyushpradhan/yank/compare/v0.6.5...v0.6.6)

## [0.6.5](https://github.com/piyushpradhan/yank/releases/tag/v0.6.5) - 2026-05-20

### Added

- Rebrand Recall → Yank + Tailwind v4 + react-icons ([7794bc9](https://github.com/piyushpradhan/yank/commit/7794bc9c19a8eeed1b2c4f7564354d33d168c585))

- UI grid audit — alignment, baselines, padding rhythm ([7744925](https://github.com/piyushpradhan/yank/commit/7744925a7c129ddd86dbbb36de2103d2a9b13897))

- Polish UI — ember-aligned categories, Geist font, refined Tweaks ([0996590](https://github.com/piyushpradhan/yank/commit/09965900e8ea3d99f4f85e54a106e050241382e3))

- **landing:** Adopt ember-design-system tokens ([6c7756f](https://github.com/piyushpradhan/yank/commit/6c7756fa289e47a8bdaee646fa017a17b6d34694))

- Migrate UI to ember-design-system ([93fe2a9](https://github.com/piyushpradhan/yank/commit/93fe2a9b5f1f83ffe8adabf4f5f4ffda3460326e))

### Changed

- Add image preview support and add the logo ([54ec25e](https://github.com/piyushpradhan/yank/commit/54ec25ea2ebf253cdbb940fb69a571382402014a))

### Fixed

- Use 'Geist Sans' font name, drop selection stripe, ember v0.2.2 ([9706d78](https://github.com/piyushpradhan/yank/commit/9706d7804d6dbbcba12d11f5e0ebadd025cbcf6f))

- Self-host Geist + pull ember v0.2.1 for centred button text ([9316ebd](https://github.com/piyushpradhan/yank/commit/9316ebd0fe1c79f5489075c29889b5d3b91602c2))

**Full changelog:** [v0.6.4...v0.6.5](https://github.com/piyushpradhan/yank/compare/v0.6.4...v0.6.5)

## [0.6.4](https://github.com/piyushpradhan/yank/releases/tag/v0.6.4) - 2026-05-19

### Fixed

- Use 'Geist Sans' font name, drop selection stripe, ember v0.2.2 (#19) ([6ffc737](https://github.com/piyushpradhan/yank/commit/6ffc73728530f2489fdbbf576df2afc31022a5f3))

**Full changelog:** [v0.6.3...v0.6.4](https://github.com/piyushpradhan/yank/compare/v0.6.3...v0.6.4)

## [0.6.3](https://github.com/piyushpradhan/yank/releases/tag/v0.6.3) - 2026-05-18

### Fixed

- Self-host Geist + pull ember v0.2.1 for centred button text (#18) ([e292f1d](https://github.com/piyushpradhan/yank/commit/e292f1d86f4b633dbc3be8867d48d01d95f680e9))

**Full changelog:** [v0.6.2...v0.6.3](https://github.com/piyushpradhan/yank/compare/v0.6.2...v0.6.3)

## [0.6.2](https://github.com/piyushpradhan/yank/releases/tag/v0.6.2) - 2026-05-18

### Added

- Polish UI — ember-aligned categories, Geist font, refined Tweaks (#15) ([a68a315](https://github.com/piyushpradhan/yank/commit/a68a3151b634e2887e50f3c305764adcb8ca5a24))

- **landing:** Adopt ember-design-system tokens (#16) ([93ea5a3](https://github.com/piyushpradhan/yank/commit/93ea5a30c411acba15d5da357ad0cf69bf424a79))

- UI grid audit — alignment, baselines, padding rhythm (#17) ([2ceb066](https://github.com/piyushpradhan/yank/commit/2ceb066ed4bfe21644aaa917f4535cdf06a947df))

**Full changelog:** [v0.6.1...v0.6.2](https://github.com/piyushpradhan/yank/compare/v0.6.1...v0.6.2)

## [0.6.1](https://github.com/piyushpradhan/yank/releases/tag/v0.6.1) - 2026-05-17

### Added

- Polish UI — ember-aligned categories, Geist font, refined Tweaks (#14) ([b0e882d](https://github.com/piyushpradhan/yank/commit/b0e882dcfee7e74c62960b1663adf98e5076a9fd))

**Full changelog:** [v0.6.0...v0.6.1](https://github.com/piyushpradhan/yank/compare/v0.6.0...v0.6.1)

## [0.6.0](https://github.com/piyushpradhan/yank/releases/tag/v0.6.0) - 2026-05-17

### Added

- Migrate UI to ember-design-system (#13) ([3d25d46](https://github.com/piyushpradhan/yank/commit/3d25d46b4ab23fbd02947e2e3520baec82912070))

**Full changelog:** [v0.5.2...v0.6.0](https://github.com/piyushpradhan/yank/compare/v0.5.2...v0.6.0)

## [0.5.2](https://github.com/piyushpradhan/yank/releases/tag/v0.5.2) - 2026-05-10

### Added

- **landing:** Add Astro landing page at landing/ + Pages deploy workflow (#5) ([23c97f1](https://github.com/piyushpradhan/yank/commit/23c97f1b5b489a0222f0a2e2a1461469bb37b06c))

- **palette:** Image thumbnails + fix double border on corners (#8) ([c1710a7](https://github.com/piyushpradhan/yank/commit/c1710a78dea4fb048af06425829ee9a66176997f))

### Changed

- Add image preview support and add the logo ([c968f4d](https://github.com/piyushpradhan/yank/commit/c968f4d0f837cfe5e989614e94c40b1c31af6997))

### Documentation

- Add screenshots and screen recording for image copy-paste feature (#3) ([8447c30](https://github.com/piyushpradhan/yank/commit/8447c30f2a45ed61f788e957377d3a9397b99e87))

### Fixed

- **image:** PNG compression, memory-safe previews, deduplicated fetches (#4) ([c0f8065](https://github.com/piyushpradhan/yank/commit/c0f8065d4645c0029a685dffa546a9a1c77d6453))

- **landing:** Switch to Vercel + hardcode root-relative asset paths (#7) ([a77d94a](https://github.com/piyushpradhan/yank/commit/a77d94a425a77765488e074eeff4812e696a9312))

- Responsive layout, button alignment, and fuzzy image search (#11) ([a9a1962](https://github.com/piyushpradhan/yank/commit/a9a1962de695be725b65fdbac344d6317a286694))

### Maintenance

- Support release/v\* branch trigger and workflow_dispatch for releases ([a9d6712](https://github.com/piyushpradhan/yank/commit/a9d67126be65f08505144095a8ad9913e556aafc))

- Auto-tag releases on version bump (#12) ([9ad9483](https://github.com/piyushpradhan/yank/commit/9ad948386e57df8b55b7d900f9a6409b90cadfc1))

**Full changelog:** [v0.4.5...v0.5.2](https://github.com/piyushpradhan/yank/compare/v0.4.5...v0.5.2)

## [0.4.5](https://github.com/piyushpradhan/yank/releases/tag/v0.4.5) - 2026-05-07

### Fixed

- Add insert_image_item db function and Cow conversion for image bytes ([4b6da67](https://github.com/piyushpradhan/yank/commit/4b6da67e54ec0fa766a1f40f9d060a8efd4cf009))

**Full changelog:** [v0.2.3...v0.4.5](https://github.com/piyushpradhan/yank/compare/v0.2.3...v0.4.5)

## [0.4.4](https://github.com/piyushpradhan/yank/releases/tag/v0.4.4) - 2026-05-06

### Fixed

- Resolve ESLint peer dependency conflicts ([fc31437](https://github.com/piyushpradhan/yank/commit/fc31437ceb95bf821fb42974c5c4f60bc08ed006))

**Full changelog:** [v0.4.3...v0.4.4](https://github.com/piyushpradhan/yank/compare/v0.4.3...v0.4.4)

## [0.4.3](https://github.com/piyushpradhan/yank/releases/tag/v0.4.3) - 2026-05-06

### Fixed

- Make image capture Windows-only to fix Linux CI ([6b3c8e5](https://github.com/piyushpradhan/yank/commit/6b3c8e5c4d109852e85f18119ea18ba4bd392630))

**Full changelog:** [v0.4.2...v0.4.3](https://github.com/piyushpradhan/yank/compare/v0.4.2...v0.4.3)

## [0.4.2](https://github.com/piyushpradhan/yank/releases/tag/v0.4.2) - 2026-05-06

### Fixed

- Add image preview and filter ([c838f65](https://github.com/piyushpradhan/yank/commit/c838f65c00606b4d1731a9c29a559e2517864529))

**Full changelog:** [v0.4.1...v0.4.2](https://github.com/piyushpradhan/yank/compare/v0.4.1...v0.4.2)

## [0.4.1](https://github.com/piyushpradhan/yank/releases/tag/v0.4.1) - 2026-05-06

### Added

- Add image paste back to clipboard ([472afbc](https://github.com/piyushpradhan/yank/commit/472afbcad7c1bf4d6aadc826b1058e5fa58e2797))

**Full changelog:** [v0.4.0...v0.4.1](https://github.com/piyushpradhan/yank/compare/v0.4.0...v0.4.1)

## [0.4.0](https://github.com/piyushpradhan/yank/releases/tag/v0.4.0) - 2026-05-06

### Added

- Add image capture, date filtering, and plain text option ([2007404](https://github.com/piyushpradhan/yank/commit/2007404a3c172f4d61e468a53d5af9da08710057))

**Full changelog:** [v0.3.1...v0.4.0](https://github.com/piyushpradhan/yank/compare/v0.3.1...v0.4.0)

## [0.3.1](https://github.com/piyushpradhan/yank/releases/tag/v0.3.1) - 2026-05-06

### Documentation

- Add CONTRIBUTING.md and editor config ([c502a7c](https://github.com/piyushpradhan/yank/commit/c502a7cfc2c0e105e31cb4df1ea7443040aa4c7e))

**Full changelog:** [v0.3.0...v0.3.1](https://github.com/piyushpradhan/yank/compare/v0.3.0...v0.3.1)

## [0.3.0](https://github.com/piyushpradhan/yank/releases/tag/v0.3.0) - 2026-05-06

### Added

- Polish release — fix shortcut persistence, expand tray, write product README ([c64b1f5](https://github.com/piyushpradhan/yank/commit/c64b1f567ade150df9bcf00b81804e53bac5a50b))

- Bundle local embeddings + Linux/Wayland support ([ca306f6](https://github.com/piyushpradhan/yank/commit/ca306f6cca69c69c990cad2e15a2b9ffe182ba58))

### Changed

- Initial commit ([2d64ba3](https://github.com/piyushpradhan/yank/commit/2d64ba37d4206b787f4eb10fd6a2f584b78d2b09))

- Complete the missing plan - opencode ([827667c](https://github.com/piyushpradhan/yank/commit/827667c4ece85f607a0e386933ea3e60387a2e06))

- Note Windows-only releases ([043c727](https://github.com/piyushpradhan/yank/commit/043c727fc00e9f805985ae1148978a053136ee7d))

- Smart Clipboard → Recall ([d818c55](https://github.com/piyushpradhan/yank/commit/d818c5552cd3a7e0127395d0e6996c7d1855d837))

- Add tests, linting, and CI checks ([5ab7dca](https://github.com/piyushpradhan/yank/commit/5ab7dcad317b7c6f70143a44890557c86b631517))

### Documentation

- Note Windows-only releases page (mac/linux builds via source) ([1b7193e](https://github.com/piyushpradhan/yank/commit/1b7193e471f4eaed01a29b89dbe5ac4c4ff28f76))

### Fixed

- Use MSI-compatible version (0.2.0-alpha1) ([c0e7ec8](https://github.com/piyushpradhan/yank/commit/c0e7ec88274f7ce829b1433a95be2a212c9db238))

### Maintenance

- One-command installer pipeline (Makefile + PowerShell + GH Actions) ([7774769](https://github.com/piyushpradhan/yank/commit/777476917dd86e1d81ace731372f5887bd0038bf))

- Skip MSI bundle on Windows for pre-release builds (#2) ([1a7c8e3](https://github.com/piyushpradhan/yank/commit/1a7c8e3d95b2fdcb942e7c1bb6c79d5766bcc80d))

**Full changelog:** [v0.2.0...v0.3.0](https://github.com/piyushpradhan/yank/compare/v0.2.0...v0.3.0)

## [0.2.3](https://github.com/piyushpradhan/yank/releases/tag/v0.2.3) - 2026-05-06

### Fixed

- Skip Rust clippy/test in CI since they can't run on Windows ([7f0ce9e](https://github.com/piyushpradhan/yank/commit/7f0ce9e65eddb57970f6950f56ecc8323ebeed9b))

**Full changelog:** [v0.2.2...v0.2.3](https://github.com/piyushpradhan/yank/compare/v0.2.2...v0.2.3)

## [0.2.2](https://github.com/piyushpradhan/yank/releases/tag/v0.2.2) - 2026-05-06

### Fixed

- Add rust-cache to check job for clippy ([067deed](https://github.com/piyushpradhan/yank/commit/067deed66dd6780d5e18b54c03a1f4ef241176ab))

**Full changelog:** [v0.2.1...v0.2.2](https://github.com/piyushpradhan/yank/compare/v0.2.1...v0.2.2)

## [0.2.1](https://github.com/piyushpradhan/yank/releases/tag/v0.2.1) - 2026-05-06

### Fixed

- Run cargo in src-tauri dir, update to v0.2.1 ([e850cf4](https://github.com/piyushpradhan/yank/commit/e850cf46a5c3195aeb4f43848189775b89b70175))

**Full changelog:** [v0.4.4...v0.2.1](https://github.com/piyushpradhan/yank/compare/v0.4.4...v0.2.1)

## [0.2.0](https://github.com/piyushpradhan/yank/releases/tag/v0.2.0) - 2026-04-26

### Added

- Bundle local embeddings + Linux/Wayland support ([688a069](https://github.com/piyushpradhan/yank/commit/688a069da7fd84bf0d5d25c4bbe43e3d88a7617e))

### Changed

- Note Windows-only releases ([53a8432](https://github.com/piyushpradhan/yank/commit/53a8432f902518ce7fda3b1be088681c76973e87))

### Documentation

- Note Windows-only releases page (mac/linux builds via source) ([e8c676c](https://github.com/piyushpradhan/yank/commit/e8c676c8681e4464350c5aae097a2d40b945a198))

**Full changelog:** [v0.1.0...v0.2.0](https://github.com/piyushpradhan/yank/compare/v0.1.0...v0.2.0)

## [0.1.0](https://github.com/piyushpradhan/yank/releases/tag/v0.1.0) - 2026-04-24

### Added

- Polish release — fix shortcut persistence, expand tray, write product README ([fd0a19d](https://github.com/piyushpradhan/yank/commit/fd0a19d70291b58f0618cdb82da67f580f555c37))

### Changed

- Initial commit ([fbab216](https://github.com/piyushpradhan/yank/commit/fbab21677f24f58a9a033ffcb37e221c449c4bdf))

- Complete the missing plan - opencode ([db886c4](https://github.com/piyushpradhan/yank/commit/db886c4265ef3bb9c60b33597f3afc69a0ab7269))

### Maintenance

- One-command installer pipeline (Makefile + PowerShell + GH Actions) ([3b54f5d](https://github.com/piyushpradhan/yank/commit/3b54f5d57ba7744368117340f7c33fb422c4fb62))

**Full changelog:** [v0.1.0](https://github.com/piyushpradhan/yank/commits/v0.1.0)

# Linux Stabilization Plan — Yank

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close out every known Linux gap so Yank is stable and self-explanatory on X11 *and* Wayland: verify the last open Linux bug report (#52), surface Wayland limitations instead of failing silently, ship "start minimized" (#56), and drop stale build cruft.

**Architecture:** Tauri v2 desktop app. Linux builds already produce `.AppImage` + `.deb` (ubuntu-22.04 in `release.yml`), auto-paste uses pure-Rust `enigo` (x11rb XTest on X11, wlroots/KDE virtual-keyboard on Wayland), and the global shortcut uses `tauri-plugin-global-shortcut` 2.3.1 → `global-hotkey` 0.7.0, which is **X11-only** on Linux. The single-instance plugin (`yank --palette` CLI dispatch) is the existing Wayland fallback for hotkeys but is invisible to users.

**Tech Stack:** Tauri 2, Rust (rusqlite, arboard, enigo, tokio), React + TS frontend, Vitest, cargo test.

**State snapshot (verified 2026-09-03):**
- Local `main` is 1 commit behind `origin/main` (version bump only — fast-forward first).
- Open issues: **#52** (WebKitGTK scrolling ghosting — fix shipped in v0.7.60, reporter never confirmed), **#56** (start minimized).
- No open PRs. Discussions disabled. No existing plan file.

---

## Findings: what is actually pending

| # | Item | Evidence | Severity |
|---|---|---|---|
| 1 | **#52 ghosting fix unverified** — reporter (starmiim, Linux Mint 22.3 Cinnamon 6.6.7 X11) still saw it on 0.7.59; fixes landed in 0.7.57 (`f8df391`) and 0.7.60 (`f4e7a33`, palette `transparent:false` + opaque surface). No confirmation since. Owner's last comment: "Time to spin up a VM and replicate this." | `gh issue view 52`; `src-tauri/tauri.linux.conf.json`; `src/windows/Palette.tsx:450` | High |
| 2 | **Library window still `transparent: true` on Linux** — the ghosting trigger was "transparent window surface"; the palette was fixed but the library wasn't (it scrolls a list too). Prime suspect if #52 reproduces. | `src-tauri/tauri.linux.conf.json:14` | High (if #52 repros) |
| 3 | **Global shortcut silently dead on Wayland** — `global-hotkey` 0.7.0 is X11-only; `register` failure is only `eprintln!`ed (`lib.rs:403-405`). Users on GNOME/KDE Wayland get no shortcut and no explanation. | `src-tauri/Cargo.lock:2004`; `src-tauri/src/lib.rs:403` | High |
| 4 | **GNOME Wayland auto-paste is silently copy-only** — Mutter exposes no virtual-keyboard protocol, so `paste_to_frontmost_app` falls back to copy-only with zero feedback; users think paste is broken. | `CHANGELOG.md` (0.7.61); `src-tauri/src/commands.rs:281-317` | Medium |
| 5 | **#56 Start minimized** — autostart plugin already passes `--minimized` (`lib.rs:330`) but `handle_cli_args` ignores it; library window is visible-by-default, so it pops up at every login. | `src-tauri/src/lib.rs:256-270,330` | Medium |
| 6 | **Stale libxdo dependency** — 0.7.61 removed libxdo at runtime, but `build.sh` (all 4 PM branches) and `.github/workflows/release.yml` still install `libxdo-dev`/`xdotool`/`xdotool-devel`. | `build.sh:63,77,92,105`; `release.yml` Linux deps step | Low |
| 7 | **Tray needs AppIndicator extension on stock GNOME** — environmental; nothing to fix in code, but users should be told (README + landing install notes). | `build.sh` installs `libayatana-appindicator3-dev` | Low |
| 8 | **AppImage needs FUSE** — users without `libfuse2` can't run the AppImage directly; `.deb` is the escape hatch. Document on landing Linux card. | `build.sh` (libfuse2 comment) | Low |

---

## Task 1: Fast-forward and baseline

**Objective:** Start from a clean, current tree and confirm the build is green before touching anything.

**Step 1:** `git pull --ff-only origin main` (expected: fast-forwards to `27259df`, v0.7.62).

**Step 2:** Baseline checks:
```sh
npm run test        # Vitest
npm run lint
npm run typecheck
cd src-tauri && cargo test && cargo clippy --all-targets
```
Expected: all green. Record any pre-existing failures separately — do not fix them in this plan.

## Task 2: Reproduce #52 in a Mint/Cinnamon X11 VM (verification, not code)

**Objective:** Prove whether v0.7.62 still ghosts on the reporter's exact setup, and get eyes on the library window's transparency.

**Files:** none (no code changes yet).

**Step 1:** Provision a VM: Linux Mint 22.3 Cinnamon, X11 session, all updates. (Prior art: build.sh already lists the Tauri prereqs for apt.)

**Step 2:** Install the v0.7.62 release from GitHub (the `.deb`, since AppImage + FUSE friction is orthogonal): download from `https://github.com/piyushpradhan/yank/releases/download/v0.7.62/`, `sudo apt install ./yank_0.7.62_amd64.deb`.

**Step 3:** Reproduce the reporter's scenario: copy several text rows, open the palette, scroll up/down rapidly with the mouse wheel. Watch for stale/ghosted rows.

**Step 4:** Repeat in the library window (it is still `transparent: true` on Linux — see Finding 2). Scroll a long history list.

**Step 5:** Record results as a comment on #52. If clean → ask reporter to confirm, close when confirmed. If it still ghosts → proceed to Task 3.

## Task 3 (conditional): De-transparency the library window on Linux

**Objective:** Remove the last "transparent surface" on Linux so the WebKitGTK ghosting class has no remaining trigger.

**Files:** Modify `src-tauri/tauri.linux.conf.json` (library window block, lines ~6-19).

**Step 1:** Set `"transparent": false` on the `library` window (matching the palette block) and remove the `windowEffects` mica entry (mica is Windows-only; it's a no-op on Linux and just confuses reviewers).

Resulting library block:
```json
{
  "label": "library",
  "title": "Yank",
  "width": 1080,
  "height": 720,
  "minWidth": 520,
  "minHeight": 400,
  "center": true,
  "decorations": false,
  "transparent": false,
  "resizable": true
}
```

**Step 2:** Grep the frontend for Linux library translucency that now sits on an opaque window: `src/styles/global.css` — any `background: transparent` / `color-mix(..., transparent)` behind the library shell should switch to an opaque `var(--bg-surface)`-style value guarded by `IS_LINUX`, same pattern as `Palette.tsx:450`. Only change what the library window actually paints.

**Step 3:** Re-run the Task 2 VM scroll test against a build from this branch. Expected: no ghosting in either window.

**Step 4:** Commit: `fix(linux): make library window opaque to stop WebKitGTK ghosting`.

## Task 4: Wayland — detect session type and surface honest guidance

**Objective:** Wayland users should be told the shortcut won't register and given the working path (`yank --palette` bound to a DE shortcut), instead of the current silent `eprintln!`.

**Files:**
- Modify: `src-tauri/src/lib.rs` (register block ~401-410; `invoke_handler` list ~348-375)
- Modify: `src-tauri/src/settings.rs` (add command) or new small module `src-tauri/src/platform_info.rs` (preferred: keep settings.rs about settings)
- Modify: `src/lib/types.ts`, `src/lib/shortcut.ts` (types), `src/components/TweaksPanel.tsx` (shortcut row) — verify actual file names first with `search_files`

**Step 1: Backend command.** New module `src-tauri/src/platform_info.rs`:
```rust
#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    let session = std::env::var("XDG_SESSION_TYPE")
        .or_else(|_| std::env::var("WAYLAND_DISPLAY").map(|_| "wayland".into()))
        .unwrap_or_default();
    let wayland = session.eq_ignore_ascii_case("wayland");
    PlatformInfo { wayland }
}

#[derive(serde::Serialize)]
pub struct PlatformInfo {
    pub wayland: bool,
}
```
Register `mod platform_info;` in `lib.rs` and add `platform_info::platform_info` to `invoke_handler`.

**Step 2: Surface the hint.** In `TweaksPanel`'s shortcut row: when `platformInfo.wayland === true`, show a muted line under the shortcut editor: "Wayland: global shortcuts aren't supported by your compositor. Bind a keyboard shortcut in your desktop settings to run `yank --palette` instead." Fetch once with `invoke('platform_info')` on mount.

**Step 3: Frontend test.** Follow the existing mock pattern in `src/windows/PaletteSurface.test.tsx` (hoisted `invoke` mock): assert the hint renders when `platform_info` resolves `{ wayland: true }` and stays hidden when `{ wayland: false }`.

**Step 4: Run tests:** `npm test` + `npm run typecheck`; `cargo test -p yank`.

**Step 5: Commit:** `feat(linux): tell Wayland users to bind yank --palette as a DE shortcut`.

## Task 5: Feedback for copy-only auto-paste (GNOME Wayland)

**Objective:** When the compositor can't receive synthesized input, tell the user the item is on the clipboard instead of silently closing.

**Files:**
- Modify: `src-tauri/src/commands.rs` — `paste_to_frontmost_app` (~301-317) and `send_paste_keystroke` (non-macOS branch, ~281-299)
- Modify: `src/windows/Palette.tsx` — where it invokes `paste_to_frontmost_app` (search for the invoke call site)

**Step 1: Return an outcome instead of `()`.** Change `paste_to_frontmost_app` to return `Result<String, String>` where the Ok value is `"pasted"` or `"copied"`. In the Linux/Win `send_paste_keystroke`, if `Enigo::new` fails (no virtual-keyboard backend on Mutter — this is the current failure path that triggers the fallback), return `Ok("copied")` instead of an `Err`; keep `Err` for genuine mid-paste failures.

**Step 2: Show feedback.** In `Palette.tsx`, when the result is `"copied"`, keep the palette open ~800ms with a transient "Copied — paste with Ctrl+V" pill (reuse the existing hint/toast styling in the palette; search for existing toast/status patterns first), then close. On `"pasted"`, close immediately as today.

**Step 3: Test.** Backend: a `cargo test` for a pure helper if you extract the decision logic (`fn paste_outcome(build_ok: bool) -> &'static str` — trivial but keeps the branch testable). Frontend: extend palette tests to assert the pill renders for the `"copied"` result.

**Step 4: Commit:** `feat(linux): tell users when auto-paste fell back to copy-only`.

## Task 6: Start minimized (#56)

**Objective:** Honor the `--minimized` launch arg the autostart plugin already passes, plus a user-facing toggle, so login doesn't pop the library.

**Files:**
- Modify: `src-tauri/src/lib.rs` — `handle_cli_args` (~256-270) and the autostart init (~328-331)
- Modify: `src-tauri/src/settings.rs` — add `minimized_on_start: bool` to the settings struct, command + persistence (follow existing settings shape exactly)
- Modify: frontend settings UI (`TweaksPanel.tsx` general section) — add a toggle wired to the new setting

**Step 1: Honor the flag.** In `handle_cli_args`, before the second-instance branch:
```rust
if args.iter().any(|a| a == "--minimized") {
    if let Some(w) = app.get_webview_window("library") {
        let _ = w.hide();
    }
    return; // first-launch autostart: stay out of the way
}
```
Watch the ordering: `--minimized` must not fall through to `focus_library` for second-instance bare invocations.

**Step 2: The setting.** Decide scope before coding: the issue asks for an *option*. Minimum honest scope = the autostart path honors `--minimized` (Task 6 Step 1 alone fixes the reported pain). If adding the toggle, extend the settings struct + `set_settings`/`get_settings` (check how settings are versioned/migrated in `settings.rs` first) and add the UI toggle; the autostart plugin arg list stays `["--minimized"]` since the *default* is now "start minimized".

**Step 3: Tests.** Rust: unit-test `handle_cli_args`'s new branch if the function shape permits (extract arg parsing into a testable `fn should_start_minimized(args) -> bool` if needed). Frontend: toggle test following existing settings-panel test patterns.

**Step 4: Commit:** `feat: start minimized on launch (--minimized) + settings toggle (#56)`.

## Task 7: Drop stale libxdo build cruft

**Objective:** The runtime no longer links libxdo (enigo is pure-Rust); stop installing it everywhere.

**Files:**
- Modify: `build.sh` — remove `libxdo-dev` (apt, ~line 63), `libxdo-devel` (dnf, ~77), `xdotool` (pacman, ~92), `xdotool-devel` (zypper, ~105)
- Modify: `.github/workflows/release.yml` — remove `libxdo-dev` from the Linux deps step

**Step 1:** Make both edits; keep everything else identical.

**Step 2:** Validate: `bash -n build.sh` and a workflow lint via `actionlint` if installed (otherwise eyeball YAML); confirm `grep -ri libxdo` returns nothing outside `Cargo.lock` history.

**Step 3: Commit:** `chore(linux): remove stale libxdo installs (enigo replaced it)`.

## Task 8: Document Linux caveats where users look

**Objective:** Tray-on-GNOME and FUSE/AppImage gotchas shouldn't be silent.

**Files:**
- Modify: `README.md` — add a "Linux" section: supported DEs, X11 vs Wayland shortcut note (see Task 4 wording), tray needs AppIndicator on GNOME, `sudo apt install libfuse2` if AppImage won't launch, `.deb` recommended for GNOME users.
- Modify: `landing/src/components/Install.astro` (Linux card) — one line: "GNOME? Use the .deb. Wayland? Bind `yank --palette` to a shortcut." Verify the exact component structure before editing.

**Step 1:** Edit both files; keep copy terse.

**Step 2:** `cd landing && npm run build` (expected: green) and `npm run build` at root.

**Step 3: Commit:** `docs: Linux install caveats (Wayland, GNOME tray, FUSE)`.

---

## Task 9: Release and verify end-to-end

**Objective:** Ship a v0.7.63 tag and verify the full Linux chain: CI bundle → install → shortcut → paste → update.

**Step 1:** Merge to main; tag `v0.7.63` (auto-tag.yml handles bump-on-main; follow the release playbook in `release.yml` header).

**Step 2:** After the release workflow completes, verify in the Task 2 VM:
- install `.deb` + `.AppImage`
- global shortcut works on X11; on Wayland the new hint appears
- auto-paste pastes on X11/KDE Wayland; pill appears on GNOME Wayland
- `--minimized` autostart stays out of the way
- updater sees latest (Tweaks panel)

**Step 3:** Comment on #52 with the v0.7.63 result and ask starmiim to confirm; close #56 when the toggle ships.

---

## Files likely to change

- `src-tauri/tauri.linux.conf.json` (Task 3)
- `src-tauri/src/lib.rs` (Tasks 4, 6)
- `src-tauri/src/platform_info.rs` (new, Task 4)
- `src-tauri/src/commands.rs` (Task 5)
- `src-tauri/src/settings.rs` (Task 6)
- `src/windows/Palette.tsx` (Task 5)
- `src/components/TweaksPanel.tsx` (Tasks 4, 6)
- `src/lib/types.ts` / `src/lib/shortcut.ts` (Tasks 4, 6 — verify names first)
- `build.sh`, `.github/workflows/release.yml` (Task 7)
- `README.md`, `landing/src/components/Install.astro` (Task 8)

## Tests / validation

- `npm test`, `npm run lint`, `npm run typecheck`, `cargo test -p yank`, `cargo clippy --all-targets` after every task.
- VM matrix for final sign-off (Task 9): Mint 22.3 Cinnamon X11 + one Wayland desktop (GNOME or KDE).
- Issue hygiene: #52 confirmed/closed with reporter input; #56 closed on ship.

## Risks, tradeoffs, open questions

- **We cannot test on this Mac.** Tasks 2 and 9 depend on a Linux VM. If no VM is available this session, ship code tasks and gate #52 closure on reporter confirmation instead — but then keep #52 open, honestly.
- **Task 3 is conditional** — only if #52 reproduces on 0.7.62. It is pre-written because it is the most likely culprit (library is the last transparent Linux surface).
- **Wayland shortcut "support" is guidance, not a real fix** — real global shortcuts need DE-specific portal APIs (xdg-desktop-portal GlobalShortcuts is not broadly shipped). The single-instance CLI bridge is the right architecture already; the gap was discoverability.
- **Task 6 scope decision**: honoring `--minimized` fixes the report; the toggle is scope creep unless the user wants the option (the issue explicitly asks for it — default recommendation is to ship both, they're small).
- **`send_paste_keystroke` is shared with Windows** (same `#[cfg(not(macos))]` branch) — Task 5 must not change Windows behavior; the `Ok("copied")` fallback is safe there too but verify with `cargo check --target x86_64-pc-windows-msvc` if the toolchain is installed.
- **Updater on `.deb` installs** will fail to write `/usr` (permission denied) — out of scope unless the user wants the "reinstall via AppImage" hint; flagged, not planned.

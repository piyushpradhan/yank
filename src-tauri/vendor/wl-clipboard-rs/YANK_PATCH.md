# Yank clipboard privacy patch

Source: wl-clipboard-rs 0.9.3, https://github.com/YaLTeR/wl-clipboard-rs (MIT / Apache-2.0).
Vendored from the crates.io source; license files are included.

Yank's clipboard plugin enables arboard's native Wayland backend through Cargo
feature unification. Checking X11 metadata cannot protect that backend.

Changes in src/paste.rs:
- Reject offers containing x-kde-passwordManagerHint before any receive request,
  including reads made through arboard. This marker is honored even with heuristic
  detection disabled.
- Add get_contents_snapshot to request PNG and plain text from one immutable offer
  after checking its metadata. This prevents a selection change between separate
  metadata/text/image reads from bypassing protection.
- Add protocol-level tests with a mock compositor, including zero payload requests
  for confidential offers. Test-server receive counters are test-only.

The root [patch.crates-io] applies this guard to both direct reads and arboard.
Keep the patch when updating dependencies; remove it only when upstream exposes an
API with equivalent offer-bound metadata and multi-representation guarantees.

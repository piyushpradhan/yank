# Keeping sensitive copies out of Yank history

Research date: 2026-10-21. This records the original source review and proposed design. The feature has since been implemented; [the sensitive-copy policy](../sensitive-copies.md) describes the current rules and scope. Repository links are pinned to the inspected revision where practical. No real credentials or personal clipboard contents were used.

## Recommendation

Add **“Skip sensitive copies”**, backed by a local Rust decision step **before anything reaches history, search, previews, events, or AI**. Use three kinds of evidence, in this order:

1. **Explicit source instructions:** sensitive clipboard markers and user-excluded applications.
2. **Recognizable data:** card numbers with validation, formatted or contextual SSNs, private keys, and known credential formats.
3. **Context-dependent guesses:** labeled passwords, bare numeric IDs, OTPs, and unstructured tokens. These need a more cautious policy and a separate evaluation set.

This can provide strong protection for marked password-manager copies and recognizable formats. **It cannot identify every arbitrary password from its text.** The same word, sentence, UUID, or number can be a password in one copy and ordinary content in another. No deterministic rule or model can recover missing information with certainty. This is a reasoning limit, not a missing library.

“Skip” should mean **do not retain in Yank**. The system clipboard already contains the copy by the time Yank observes it; normal paste should continue. Clearing it afterward cannot guarantee that another application or clipboard history did not already read it. Blocking the original copy everywhere would require a different scope and platform integrations.

## What the open source projects actually do

| Project | Source-level finding | Lesson for Yank |
| --- | --- | --- |
| [Maccy][maccy] | Checks pasteboard types before reading item data. Ignores concealed, transient, and auto-generated types; supports app and regex exclusions. | Start with metadata. Check the whole pasteboard, including types not repeated on an individual item. |
| [CopyQ][copyq-win] | Recognizes Windows history/monitoring opt-outs, the [macOS concealed format][copyq-mac], and [Linux password hints][copyq-security]. | Use platform-specific checks and decode flag values correctly. |
| [KeePassXC][keepassxc] | Its central copy routine deliberately writes a sensitive marker on each supported OS. The [macOS adapter][keepassxc-mac] maps the Qt MIME alias to the native concealed type. | Password managers generally know a copy is sensitive because of its origin; they do not discover passwords by analyzing arbitrary text. |
| [Bitwarden desktop][bitwarden-desktop] | Its Rust clipboard backend uses arboard’s OS-specific history-exclusion writers when `hide_from_history` is true. The [desktop IPC handler][bitwarden-ipc] supplies that boolean from `message.password`. | Markers depend on the copy path and caller. Test actual password, card, identity, and custom-field copies separately. |
| [Bitwarden browser service][bitwarden-browser] | The inspected path uses `navigator.clipboard.writeText`, with a textarea/`execCommand` fallback, and does not itself set these native sensitive markers. | Desktop support does not establish extension/browser support. Test each OS × browser × extension path. |
| [KDE Klipper][klipper] | Checks `x-kde-passwordManagerHint == "secret"` and returns before adding the data to history. | Respect Linux’s convention and distinguish selection from clipboard. |
| [wl-clipboard][wl-paste] | Treats presence of the KDE hint as sensitive; its comment says it does not yet distinguish `secret` from `public`. | Even mature implementations differ. Decide how to handle unreadable hint payloads explicitly. |
| [Ditto][ditto] | Checks `Clipboard Viewer Ignore` and monitoring-exclusion formats. Its app exclusion logic tries the clipboard owner before foreground-window fallback. | Copy ownership is better evidence than the app that happens to be focused 500 ms later. |
| [golang-design/clipboard][go-sensitive] | Exposes a separate sensitivity API, including unsupported/error outcomes. Its [design note][go-design] explicitly acknowledges a race between reading content and checking its successor’s markers. | Preserve “unknown” and bind metadata to the same clipboard generation as the content. Do not copy the race. |
| [1Password/arboard 3.6.1][arboard-api] | Yank’s installed version exposes text/image/HTML/file readers and OS-specific exclusion **writers**, but no public sensitivity/type-list reader in the inspected API. | Existing `get_text()`/`get_image()` calls are insufficient. Add a small native read adapter or an upstream reader extension. |

PII and developer-secret scanners provide complementary text rules: **Presidio, Gitleaks, detect-secrets, TruffleHog**, plus Rust candidates. Their source review, license inventory, synthetic checks, and adoption tradeoffs are in [the scanner appendix](sensitive-data-scanners.md).

An informative historical regression: KeePassXC [issue #6518][keepassxc-issue] reported that a copy button set markers while selection-copy paths did not. This is not proof the issue remains today. It is evidence that testing an application name alone misses copy-path differences.

## Platform signals to honor

### macOS

- `org.nspasteboard.ConcealedType`: explicit confidential-content signal.
- `org.nspasteboard.TransientType`: explicit request to omit temporary data from history.
- `org.nspasteboard.AutoGeneratedType`: omit generated copies as a history policy, but do not describe it as proof of a secret.
- Compatibility markers such as `com.agilebits.onepassword`, `net.antelle.keeweb`, and legacy transient types can supplement the universal types after interoperability tests.
- Inspect native pasteboard types. `application/x-nspasteboard-concealed-type` is the Qt MIME representation; KeePassXC converts it to the native UTI.

The community [pasteboard convention][nspasteboard] defines these semantics; [Maccy’s constants][maccy-types] show native spellings. The convention also defines `org.nspasteboard.source`, which may help source attribution but is self-reported and not an authenticated identity.

### Windows

- Presence of `ExcludeClipboardContentFromMonitorProcessing`: skip the copy.
- `CanIncludeInClipboardHistory`: skip when its serialized DWORD equals **zero**; presence alone is not an exclusion.
- `Clipboard Viewer Ignore`: respect the interoperability convention used by existing tools.
- `CanUploadToCloudClipboard = 0`: Microsoft defines this as a **cloud-sync** opt-out, not a local-history opt-out. CopyQ treats it conservatively as secret. I recommend the same conservative skip for this setting, explicitly recorded as Yank policy rather than Windows semantics.

These values are documented by [Microsoft][windows-formats] and implemented in [CopyQ][copyq-win]. A value of one never overrides another sensitive marker or a content detector. Malformed/unreadable values are “unknown,” not an implicit permission to save.

### Linux

- Inspect X11 selection targets or Wayland offer MIME types for `x-kde-passwordManagerHint`.
- Where the value is accessible, `secret` means skip; `public` is not proof the content is safe.
- If the hint exists but cannot be read, conservative skip follows wl-clipboard’s behavior, at the cost of possible false positives.
- Handle `CLIPBOARD` and `PRIMARY` independently if both are supported. Do not silently begin recording selection content as part of this feature.
- Wayland support depends on the compositor and available clipboard protocols. Yank currently declares `arboard = "3.6.1"` without its optional `wayland-data-control` feature; do not advertise universal Wayland coverage based on an X11 test.

Sources: [Klipper][klipper], [wl-paste][wl-paste], [arboard feature declarations][arboard-cargo].

**An absent marker means “unmarked,” not “safe.”** Markers are cooperative retention instructions; they neither validate the data nor form a security boundary against hostile applications.

## Detection policy for text

The following is a proposed initial policy, not a measured accuracy claim. Confidence refers to the available evidence, not a probability supplied by a library.

| Kind | Proposed normal-mode rule | What remains ambiguous |
| --- | --- | --- |
| Marked sensitive copy | Always skip, regardless of text or image representation. | Producers can omit or lose markers. |
| Payment card number | Extract bounded digit candidates; normalize recognized separators; enforce supported lengths, reject degenerate runs, and validate Luhn. Skip plausible complete numbers, including numbers embedded in prose. Treat issuer ranges as supporting evidence, not an unmaintained hard gate. | Some non-card IDs pass Luhn. Invalid/partial cards and card-like formats without Luhn need context or additional rules. |
| SSN | Skip structurally plausible `DDD-DD-DDDD` and supported equivalent grouping. For an unformatted nine-digit number, require a nearby SSN/social-security label in normal mode; offer broader skipping in strict mode. | No checksum proves an SSN was issued. Bare nine-digit order IDs look the same. |
| Password in a labeled assignment | Parse bounded structures such as `password=...`, JSON/YAML credential fields, connection strings, URL user-info, or authentication headers. Skip the complete clip if a value is present. | A lone password, a PIN, or a passphrase without context may be indistinguishable from benign text. |
| API/access tokens | Use selected provider-specific prefixes/structure/checksums where available; combine generic token rules with local assignment/header context. | Formats change. Random hashes, IDs, and base64 blobs resemble secrets. A detected format does not prove the token is active. |
| Private keys | Recognize private-key containers and validate structure locally where practical. | An isolated encoded fragment is ambiguous; public certificates/keys should not trigger a blanket private-key rule. |
| OTP/CVV/PIN | Use labels or trusted source metadata; avoid treating every 3–8 digit copy as secret. | Bare codes overlap ordinary numbers. |
| IBAN / other national IDs | Add named, tested country-specific validators as scope expands. For IBAN, use country structure/length plus mod-97 validation. | Country rules differ; checksum validity does not prove an account or identity exists. |
| Wallet recovery phrase | Optional later rule: BIP39 word count, wordlist, normalization, and checksum. | Non-BIP39 phrases and arbitrary passphrases remain outside that rule. |
| Email / phone / address | Keep in normal mode; make broader personal-data filtering a separate preference if needed. | Yank explicitly supports finding these kinds of clips. Blanket PII filtering would remove a core use case. |

For cards and SSNs, start with Presidio’s **candidate → validation → contextual evidence** architecture, while auditing the actual patterns. The scanner appendix documents synthetic failures in the inspected Presidio version, including a missing Mastercard 2-series candidate and incomplete SSN invalidation. Upstream scores such as `1.0` are not measured certainty.

For developer credentials, borrow a small reviewed rule set from the secret scanners. Do not run a repository crawler or online secret verifier on clipboard changes. [zxcvbn][zxcvbn] estimates the strength of an input already assumed to be a password; it does not determine whether clipboard text is a password. Entropy can support a contextual rule, but cannot be the universal detector.

Additional validator references: [python-stdnum’s IBAN implementation][iban] and [BIP39][bip39]. These are format checks, not identity/account verification. Evaluate licenses before copying implementations or rule data.

### Parsing details that affect reliability

- Scan the **entire retained text**, not only the preview or first few kilobytes. If a scan exceeds its size/time budget, skip that clip under the enabled protection instead of saving an unchecked remainder.
- Normalize a bounded view for detection while preserving the original representation only for accepted clips. Handle nonbreaking spaces and documented separators. Do not concatenate all digits in a document: that can manufacture a card from unrelated numbers.
- Require candidate boundaries. Do not find a “valid card” substring inside a longer account number or join unrelated fields.
- Scan nested JSON, environment variables, URLs, and multi-line text with bounded parsing. A single positive finding skips the whole item; storing a partially redacted record is a different product promise.
- Do not put broad placeholder/test-value allowlists in front of source markers. Users must be able to test the protection with synthetic cards or credentials. Narrow false-positive tuning should be explicit and tested.
- Language and country affect context labels. Describe the initial languages and ID formats supported instead of claiming all sensitive information.

## Where this belongs in Yank

At the time of this research, [watcher.rs](../../src-tauri/src/watcher.rs) polled every 500 ms, tried images first, read text, and kept a cloned `last_text` for deduplication. It then categorized, created a preview, and called SQLite dedup/insert. Afterward it emitted `clip-added` and kicked the label/embedding queues.

[db.rs](../../src-tauri/src/db.rs) uses WAL and automatically indexes inserted text into FTS5. [label_queue.rs](../../src-tauri/src/label_queue.rs) can send saved content to Anthropic when configured; [jev.rs](../../src-tauri/src/jev.rs) sends candidate content to the opt-in reranker. The current [PrivacyPanel](../../src/components/PrivacyPanel.tsx) controls usage sharing, not clipboard retention. Hiding an entry in React or deleting it after insertion would be too late for the proposed feature.

Proposed capture path:

```text
New clipboard generation / offer
  → native metadata + source policy, before reading text or images
  → sensitive / excluded / unresolved read error? skip
  → read supported payload from the same generation
  → local text detectors where applicable
  → positive match / incomplete scan? skip
  → generation and settings still valid?
  → accepted-content dedup → preview → SQLite/FTS → events → AI queues
```

Keep the text classifier pure and testable, returning a reason enum rather than a copy of the matched secret. The platform adapter should expose **marked / unmarked / unavailable**, a generation or offer identity, and only the source information it can actually establish. The final policy maps those states to retain/skip. Under the enabled protection, an inspection failure should skip the affected event, not silently fall through to persistence; show capability/setup errors without exposing content.

Implementation constraints:

1. **Check before both image and text branches.** A concealed item can offer multiple representations. Text detection alone does not inspect an unmarked screenshot; image OCR is a separate, unproven extension. Say so in feature copy.
2. **Bind checks to the same copy.** On Windows, read metadata and payload under a suitable clipboard-open interval. On macOS, compare `changeCount` around the read and retry/skip a changed snapshot. On Wayland/X11, associate types and content with the same offer/owner version. Separate “check marker” and arboard reads need race detection. [Windows sequence numbers][windows-sequence] and [Maccy’s change tracking][maccy] are relevant references.
3. **Reevaluate per generation.** Identical text can be unmarked in one event and concealed in the next. Content dedup must not replace metadata evaluation. Mark skipped events as seen using generation identity, without caching rejected plaintext in `last_text`.
4. **Do not retain diagnostic samples.** No rejected text, match substrings, previews, hashes of low-entropy secrets, or screenshots in logs/telemetry/fixtures. Do not claim memory erasure from dropping a Rust `String`; the practical promise is no intentional retention by Yank.
5. **Use source exclusions as a supplement.** Windows currently records a foreground title; non-Windows `active_window_title()` returns `None`. Add stable app/process identifiers where available, and expose unknown attribution. Browser extensions often appear as their browser, and a password manager may hide before polling runs.
6. **Handle policy transitions.** Use a settings generation or equivalent synchronization so a pending capture cannot persist under an outdated disabled policy after the user enables protection. Audit existing-item edits in [commands.rs](../../src-tauri/src/commands.rs) if the promise covers all newly saved sensitive content, not only OS copies.
7. **Treat existing history separately.** Enabling protection is prospective. A rescan/purge needs its own flow, including labels, vectors, FTS, WAL, and backups; do not promise that a soft delete erases every previous copy. Guard existing rows again before optional cloud processing while such a policy is enabled if historical protection is desired.

A small Rust classifier plus narrow native readers fits Yank better than a Python service, a bundled Go executable, or a second model. Retain arboard for ordinary payload operations where the adapter can guarantee a consistent snapshot. Investigate an upstream arboard reader contribution after proving the native behavior; changing libraries alone does not solve classification.

## Setting and rollout

Suggested label: **Skip sensitive copies**.

Suggested description: “Keep marked passwords and recognized cards, IDs, and credentials out of Yank history. Detection runs on this device. Some unmarked passwords and images cannot be recognized.”

Recommended defaults and controls:

- Respect explicit confidential/no-history markers as baseline behavior, including when heuristic scanning is off.
- Default local format detection on after the verification below. Offer an optional **strict** policy for ambiguous bare IDs/credentials, explaining that more ordinary copies will be skipped.
- Provide excluded apps and a pause-capture action. These give users deterministic control where automatic inference has no reliable signal.
- Avoid a numerical “sensitivity” slider or a “100% secure” claim. If explaining a skipped event, show only a reason such as “card-like number”; do not retain a recoverable rejected-content queue.

If browser-origin coverage becomes a priority, a cooperating extension could convey field semantics (`password`, payment/identity fields, explicit copy buttons) to a native adapter. This is a proposed integration, not an existing capability of Yank. It still needs custom-widget, copy-path, and browser testing.

## How to establish reliability before shipping

Use a local synthetic corpus and a separate negative set reflecting Yank’s actual use: code, CSS, hashes, UUIDs, logs, numeric order IDs, phone numbers, dates, addresses, and ordinary prose. Do not collect users’ secrets to build the corpus.

Measure **recall by category and copy path**, plus precision/false skips on ordinary clips. A single aggregate “accuracy” number hides both rare secrets and frequent ordinary copies. Report sample counts, test versions, and unsupported paths; reserve a holdout set for policy evaluation. No measured rate is established by this research.

Required checks:

| Area | Cases / acceptance condition |
| --- | --- |
| Native markers | Each marker individually, combinations, empty marker payloads, DWORD zero vs one, malformed/unavailable metadata, and ordinary unmarked copies. All marked cases are rejected before history side effects. |
| Real producers | 1Password, Bitwarden, KeePassXC: desktop vs extension, password vs username/card/identity/custom field, copy button vs selection shortcut. Record OS/browser/app versions. |
| Numeric formats | Cards with supported lengths and Mastercard 2-series, valid/invalid Luhn, separators including NBSP, boundaries, invalid and formatted/bare SSNs; IDs that resemble each. |
| Credential formats | Known token families, private vs public keys, labeled weak passwords, connection strings, values embedded far into a long clip, multilingual context where supported. |
| Lifecycle and races | Rapid successive copies, same text with changed markers, source app hiding, startup with existing clipboard content, enable/disable during capture, and clipboard inspection failures. |
| Persistence and network | Rejected items create no new/updated history row, FTS entry, preview, event, label/vector task, or network request. Use a temporary DB and mock outbound clients to prove it. |
| Images / representations | Marked image and mixed-format offers are skipped. Unmarked screenshots remain an explicitly documented coverage gap unless a separately evaluated image detector is added. |
| Performance | Measure local latency and worst-case memory at realistic and maximum clip sizes on all supported OS backends. Test deadline behavior; unchecked data must not be saved after timeout. |

The next implementation slice should prove the native metadata adapter and its capture gate first, then add audited text validators. That establishes a useful, testable privacy boundary before tuning ambiguous password guesses.

## Source references

[maccy]: https://github.com/p0deje/Maccy/blob/c700182f638d9d29bfa0aec9dc560422698854c6/Maccy/Clipboard.swift
[maccy-types]: https://github.com/p0deje/Maccy/blob/c700182f638d9d29bfa0aec9dc560422698854c6/Maccy/Extensions/NSPasteboard.PasteboardType%2BTypes.swift
[copyq-win]: https://github.com/hluk/CopyQ/blob/9d202b6fb8b977a5fad565c8dcb500f460af3ebe/src/platform/win/winplatformclipboard.cpp
[copyq-mac]: https://github.com/hluk/CopyQ/blob/9d202b6fb8b977a5fad565c8dcb500f460af3ebe/src/platform/mac/macclipboard.mm
[copyq-security]: https://github.com/hluk/CopyQ/blob/9d202b6fb8b977a5fad565c8dcb500f460af3ebe/docs/security.rst
[keepassxc]: https://github.com/keepassxreboot/keepassxc/blob/d5e43b779d5e23c23963d53b806dcda5dd38f50e/src/gui/Clipboard.cpp
[keepassxc-mac]: https://github.com/keepassxreboot/keepassxc/blob/d5e43b779d5e23c23963d53b806dcda5dd38f50e/src/gui/osutils/macutils/MacPasteboard.cpp
[keepassxc-issue]: https://github.com/keepassxreboot/keepassxc/issues/6518
[bitwarden-desktop]: https://github.com/bitwarden/clients/blob/62be6331121456deb33ffebafea2a92c8112da29/apps/desktop/desktop_native/core/src/clipboard/arboard_backend.rs
[bitwarden-ipc]: https://github.com/bitwarden/clients/blob/62be6331121456deb33ffebafea2a92c8112da29/apps/desktop/src/platform/main/clipboard.main.ts
[bitwarden-browser]: https://github.com/bitwarden/clients/blob/62be6331121456deb33ffebafea2a92c8112da29/apps/browser/src/platform/services/browser-clipboard.service.ts
[klipper]: https://github.com/KDE/plasma-workspace/blob/0fe85f33a494e53f50a2c6c967ba0f3a387e3c86/klipper/historymodel.cpp#L1022
[wl-paste]: https://github.com/bugaevc/wl-clipboard/blob/5ec4f89937614abe70f49f93c79b0d97716487fd/src/wl-paste.c#L103
[ditto]: https://github.com/sabrogden/Ditto/blob/a80fd3536bc407cac8cce43b5682022282ace983/src/ClipboardViewer.cpp
[go-sensitive]: https://github.com/golang-design/clipboard/blob/d95c7941706e35d9bf1d7a7560b0d8976c034712/sensitive.go
[go-design]: https://github.com/golang-design/clipboard/blob/d95c7941706e35d9bf1d7a7560b0d8976c034712/specs/sensitive-content.md
[arboard-api]: https://github.com/1Password/arboard/blob/a3750c79a5d63f3987317e03c412b7d9dffdc2af/src/lib.rs
[arboard-cargo]: https://github.com/1Password/arboard/blob/a3750c79a5d63f3987317e03c412b7d9dffdc2af/Cargo.toml
[nspasteboard]: https://nspasteboard.org/
[windows-formats]: https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats#cloud-clipboard-and-clipboard-history-formats
[windows-sequence]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getclipboardsequencenumber
[zxcvbn]: https://github.com/dropbox/zxcvbn#readme
[iban]: https://github.com/arthurdejong/python-stdnum/blob/master/stdnum/iban.py
[bip39]: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki

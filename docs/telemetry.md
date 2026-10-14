# Desktop telemetry

Yank uses the existing Umami Cloud website (`1ddb11a3-816b-4e55-a80c-06e4d07af03f`). Desktop events have the `desktop` tag and fixed paths under `/app/`. Filter the site by that tag or those paths to exclude landing-page traffic. The Rust build can override the public website ID with `YANK_UMAMI_WEBSITE_ID`; no analytics account token ships in the app.

## Consent and privacy

- Missing or invalid preferences mean sharing is off. An existing installation sees the one-time prompt the first time it opens the library after updating. New installations see it after the welcome dialog. No app version bump or per-release reminder is required.
- Accept, decline, close, or Escape saves the decision. Decline/close/Escape leave sharing off. Failed saves stay visible and can be retried. The shield icon in the existing Tweaks footer opens a separate privacy panel without adding a settings row.
- A random UUID is created only after opt-in and remains local in `settings.json`. It is sent as Umami's Distinct ID to link usage across sessions. It identifies an installation, not a named person or account. Opt-out deletes it; a later opt-in creates a new ID. Already received events are retained by Umami.
- Clipboard content, images, query text, titles, source applications/window titles, URLs copied by the user, file paths, API keys, raw error messages, and clipboard item IDs never appear in telemetry payloads. Queries and clip IDs used to correlate selections stay in local memory.
- Only predefined event names, enum values, booleans, bounded ranks/timings, app version, OS, and coarse result counts can cross the native command boundary. Unexpected properties and enum values are rejected.
- Umami receives the connection's IP address and can derive approximate location; its analytics do not store the IP. We supply a fixed User-Agent and no screen, language, or hardware fingerprint. See [Umami metric definitions](https://docs.umami.is/docs/metric-definitions).
- Consent gates both webviews and the Rust sender. Operations begun before consent cannot be reported after consent. Opt-out invalidates queued events and cancels the current request. A request already received by Umami cannot be recalled.
- A bounded in-memory queue drops excess events. Requests time out after five seconds, never retry, never redirect, and never block app actions. No analytics SDK, automatic DOM tracking, replay, persistent event log, or global error capture is installed. Development builds send nothing.

## What is measured

Every record carries `app_version`, `os`, and `schema_version: 1`.

| Record | Trigger and properties |
| --- | --- |
| Pageview `/app/library` or `/app/palette` | Native window gains focus; also immediately after opting in from the library. Focus counts are visits to a surface, not exact window-open counts. |
| `app_started` | Process starts with consent already enabled, or user first opts in in that process. |
| `clip_captured` | A new clip is successfully saved; broad `category` only. Text deduplication does not count as a new capture. |
| `feature_used` | Successful copy, use-once edited copy, pin/unpin, delete/restore, rename, edit, history clear; opening settings/AI settings; changing provider/category filter; toggling preview; dismissing inferred date/type filters; retrying embeddings. Properties: `surface`, `feature`, optional broad `category`. |
| `search_completed` | Query settled for 500 ms with authoritative results, or user selected a result sooner. `surface`, `mode`, `provider`, `status`, `result_count` bucket, `duration_ms`, `time_filter`, `category_filter`. No query. |
| `search_outcome` | Once per completed query: `selected`, `refined`, `mode_switched`, `cleared`, or `abandoned` on window blur. Selected results include a one-based `rank`, capped at 500. |
| `operation_failed` | Copy, pin, delete, restore, rename, or edit fails. Only `operation` and `surface`; no error string. |
| `paste_completed` | Palette auto-paste returns `pasted`, falls back to manual paste (`copied`), or fails (`failed`). |

Result buckets are `zero`, `one`, `two_to_five`, `six_to_twenty`, `over_twenty`. Search timing measures time from the latest query change until authoritative results arrive, including the app's debounce, capped at five minutes. It excludes the extra telemetry idle wait. Hidden palette initialization and stale/cancelled semantic responses do not create search events. The count in the library reflects its active filters; palette counts cover returned candidates before the eight-row display limit.

## Reading the five requested insights in Umami

1. **User count:** filter to desktop traffic and inspect visitors/retention. For installation-level counts across sessions, count unique Distinct IDs in Sessions or an export. Umami's default visitor/session count can differ from unique installations. Opt-in users are a sample: telemetry cannot count everyone, identify actual people, or connect separate devices. Reinstalls and opting out then back in can create new IDs.
2. **How people use Yank:** compare `/app/library` and `/app/palette`, then use Journeys to follow `search_completed` → `search_outcome` → copy/paste. Break down by mode, provider, OS, and version.
3. **How much one user uses it:** open Sessions, search a random Distinct ID, and view its linked activity. Count launches, focuses, searches, captures, and successful actions over a closed daily/weekly window. These measure frequency and volume, not minutes actively working or identity. [Umami Distinct IDs](https://docs.umami.is/docs/distinct-ids) describes linked profiles.
4. **Most-used features:** Event data → `feature_used` → `feature`, split by surface/version. Compare successful copies/pastes with search volume, and captures with retrieval, to see whether people find useful clips.
5. **Possible inaccurate results:** compare zero-result buckets, selection ranks, abandoned/refined searches, semantic-to-fuzzy switches, inferred-filter dismissals, renames of already labeled clips, and provider errors. Split by surface, provider, mode, version, and inferred-filter flags to locate regressions. These are behavioral signals, not ground-truth accuracy: renaming may reflect preference, and an abandoned search may be interrupted. `rename_labeled_clip` includes previously manual as well as AI-generated labels.

Additional useful signals: retention after an update, copy/auto-paste failures by OS, slow semantic searches by provider, search availability problems, and demand for content types. Compare rates within matching date ranges/cohorts. Background captures and custom events alone are not evidence that someone actively used the UI.

## Validation before release

- Frontend tests cover consent decisions, persistence/reopening, save failures, cross-window preference changes, pre-consent asynchronous actions, search readiness/outcomes, and exclusion of query/clip content.
- Rust tests cover default-off consent, identity rotation, native queue gating, and rejection of arbitrary data.
- Production transport uses [Umami's Sending stats API](https://docs.umami.is/docs/api/sending-stats) at `https://gateway.umami.is/api/send`. Use an opted-in release build to verify arrival in your account's Realtime view. Automated tests and browser preview never send test traffic to the live site.

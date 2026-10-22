# Settings explorations

Open [index.html](./index.html) directly in a browser. It is self-contained, with embedded Geist fonts and Yank’s existing mark. With the Vite server running, it is also available at `/docs/design-explorations/settings/index.html`.

This is an interactive design study. It does not modify the production UI or persist any settings, contact AI providers, or access clipboard data.

## Designs

| ID | Architecture | Design | Main tradeoff |
| --- | --- | --- | --- |
| A1 | Keep AI separate | Grouped controls in a compact dropdown | Direct access, with the densest first layer |
| A2 | Keep AI separate | Category dropdown with subpages | Short overview, with one extra click for a control |
| A3 | Keep AI separate | App, Library, and System tabs | Stable groups, with controls behind tabs |
| B1 | Unified settings | General, Library, AI, and Privacy tabs in a wider dropdown | Familiar entry point, with scroll for longer provider forms |
| B2 | Unified settings | Centered window with searchable categories | More room for setup, while covering more of the library |
| B3 | Unified settings | Docked pane with expandable groups | Live context, while occupying the library’s preview side |

Selected direction: **B2 · Settings window**. It brings app preferences and AI features into a centered window with searchable categories.

## Scope and behavior

- Approach A retains two title-bar entry points. The sparkle button shows a reference recreation of the existing AI modal. The production `AIPanel.tsx` is unchanged.
- Approach B2 is implemented in the app. One title-bar settings button opens the centered window; AI configuration, privacy, history, and updates each have a named category.
- Theme, density, preview layout, category badges, labels, shortcut, semantic default, startup behavior, sensitive-copy protection, and usage sharing are represented.
- App preferences apply immediately in the demo. AI fields use a separate draft with Save and Discard. Switching sections retains that draft.
- Local, TypeSafe, and Off show their corresponding fields. TypeSafe requires a key. Connection testing and update checks simulate their states locally.
- History clearing uses confirmation and explains that pinned clips are kept. The action is simulated.
- Light/dark styling, small viewports, Escape to dismiss, shortcut capture, visible keyboard focus, and modal focus loops are included.
- The library content and counts are sample data. The setting values are demo values, not the user’s current preferences.
- macOS is shown. Linux’s existing frosted-glass control would remain conditional in an implementation.

## Source references

- `src/components/SettingsWindow.tsx`: unified category window and existing app controls
- `src/components/AIPanel.tsx`: AI modal, provider fields, and save behavior
- `src/components/PrivacyPanel.tsx`: capture protection and usage statistics
- `src/components/TitleBar.tsx`: separate AI and app entry points
- `node_modules/ember-design-system/src/styles/tokens.css`: shipped warm neutral and ember palettes
- `src-tauri/tauri.conf.json`: default 1080 × 720 library window

## Validation

Reviewed the six design directions with T3 HTML previews, including dark and light themes, 360 px and 728 px layouts, and the default app width. The exploration passed 31 interaction and geometry checks at 360, 728, and 1080 px. The production B2 window preserves the existing controls and save flows; the app test suite has not been run in this implementation pass.

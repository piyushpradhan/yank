export interface Faq {
  q: string
  a: string
  open?: boolean
}

export const faqs: Faq[] = [
  {
    q: 'Does Yank send my clipboard anywhere?',
    a: 'No. Yank is local-first. The classifier and the natural-language search both run on your device. Optional Pro sync is opt-in and end-to-end encrypted — even the developer cannot read it. Yank does not collect analytics events tied to clip content.',
    open: true,
  },
  {
    q: 'How does the natural-language search actually work?',
    a: 'Yank uses two layers. First, a lightweight on-device model tags each clip with a type and extracts entities like phone, date, repo, color, address, and so on. Second, when you ask a question, Yank matches your phrasing against those tags, the time window you mentioned, and the source app. By default it uses a bundled BGE Small ONNX embedding model — no API key, no round trip to the cloud.',
  },
  {
    q: 'Is Yank free and open-source?',
    a: 'Yes. The Yank desktop app is MIT-licensed and the full source is on GitHub at github.com/piyushpradhan/yank. There is no paywall on the core app. An optional Pro sync server is source-available — you can read it, you can self-host it, you just cannot resell it.',
  },
  {
    q: 'Which platforms does Yank run on?',
    a: 'Yank runs natively on macOS 12 and later, Windows 10 and later, and Linux (GTK with Wayland or X11). It is built with Tauri, so installers are about 14 MB and use the OS WebView instead of bundling Chromium.',
  },
  {
    q: 'How is Yank different from Raycast, Maccy, Paste, or Alfred?',
    a: 'Yank is purpose-built for clipboard search. Unlike Raycast and Alfred (which are launchers), Yank does not try to replace your spotlight — it complements them by handling the paste flow only. Unlike Maccy and Paste, Yank ships with on-device semantic search out of the box, so you can describe what you copied instead of scrolling through a list. It is also free, open-source, and cross-platform.',
  },
  {
    q: 'What about passwords and credit cards?',
    a: 'Yank detects sensitive patterns — credit cards, API tokens, things that look like passwords — and either skips them entirely or stores them with a short expiry. Yank also respects the "concealed" flag set by password managers like 1Password, so secrets are not archived. Pro adds custom redaction rules per pattern.',
  },
  {
    q: 'How big is the install and how much memory does Yank use?',
    a: 'The installer is approximately 14 MB. The bundled local embedding model (BGE Small ONNX) adds about 130 MB on first run. At idle Yank uses well under 100 MB of RAM and captures clips in under 500 milliseconds.',
  },
  {
    q: 'Will it work alongside my password manager or launcher?',
    a: 'Yes. Yank co-exists with 1Password, Bitwarden, Raycast, Alfred, and similar tools. It only intercepts the paste flow and respects the concealed-clipboard flag, so password manager autofill is never archived.',
  },
]

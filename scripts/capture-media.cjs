#!/usr/bin/env node
/**
 * Generates high-quality screenshots and a screen recording for the
 * Yank image copy-paste feature using Playwright + Chromium.
 *
 * Outputs:
 *   public/screenshots/palette-image-preview.png
 *   public/screenshots/library-image-filter.png
 *   public/recordings/image-copy-paste.webm
 */

const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT_SCREENSHOTS = path.join(__dirname, "../public/screenshots");
const OUT_RECORDINGS = path.join(__dirname, "../public/recordings");

// ── Shared HTML utilities ─────────────────────────────────────────────────────

const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg-root:        oklch(18% 0.006 250);
    --bg-window:      oklch(22% 0.006 250 / 0.94);
    --bg-surface:     oklch(26% 0.006 250);
    --bg-surface-alt: oklch(23% 0.006 250);
    --bg-hover:       oklch(31% 0.008 250);
    --bg-selected:    oklch(30% 0.05 265 / 0.55);
    --border:         oklch(34% 0.006 250);
    --border-soft:    oklch(28% 0.006 250);
    --fg:             oklch(96% 0.003 250);
    --fg-muted:       oklch(72% 0.006 250);
    --fg-faint:       oklch(55% 0.006 250);
    --accent:         oklch(62% 0.19 265);
    --accent-soft:    oklch(38% 0.14 265 / 0.35);
    --accent-ink:     oklch(78% 0.12 265);
    /* image category: hue 280 */
    --img-bg:         oklch(36% 0.10 280 / 0.30);
    --img-ink:        oklch(78% 0.12 280);
    --img-border:     oklch(50% 0.12 280 / 0.45);
    /* code: hue 200 */
    --code-bg:        oklch(36% 0.10 200 / 0.30);
    --code-ink:       oklch(78% 0.12 200);
    --code-border:    oklch(50% 0.12 200 / 0.45);
    /* url: hue 140 */
    --url-bg:         oklch(36% 0.10 140 / 0.30);
    --url-ink:        oklch(78% 0.12 140);
    --url-border:     oklch(50% 0.12 140 / 0.45);
    /* text: hue 60 */
    --text-bg:        oklch(36% 0.10 60 / 0.30);
    --text-ink:       oklch(78% 0.12 60);
    --text-border:    oklch(50% 0.12 60 / 0.45);
  }

  html, body {
    font-family: 'Geist', 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-root);
    color: var(--fg);
    -webkit-font-smoothing: antialiased;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.3px;
    border: 1px solid;
    white-space: nowrap;
  }
  .chip-img   { background: var(--img-bg);  color: var(--img-ink);  border-color: var(--img-border); }
  .chip-code  { background: var(--code-bg); color: var(--code-ink); border-color: var(--code-border); }
  .chip-url   { background: var(--url-bg);  color: var(--url-ink);  border-color: var(--url-border); }
  .chip-text  { background: var(--text-bg); color: var(--text-ink); border-color: var(--text-border); }

  .dot {
    width: 8px; height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .dot-img  { background: oklch(58% 0.18 280); }
  .dot-code { background: oklch(58% 0.18 200); }
  .dot-url  { background: oklch(58% 0.18 140); }
  .dot-text { background: oklch(58% 0.18 60); }
  .dot-pin  { background: oklch(62% 0.19 265); }

  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--fg-muted);
  }
`;

// ── Demo image (canvas-drawn aurora landscape) ────────────────────────────────

const DEMO_IMAGE_SCRIPT = `
function buildDemoImage(canvas) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');

  // Night sky base
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,   '#07021a');
  sky.addColorStop(0.5, '#0a0b2e');
  sky.addColorStop(0.7, '#050e1a');
  sky.addColorStop(1,   '#020508');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const starSeed = 42;
  for (let i = 0; i < 200; i++) {
    const x = ((Math.sin(i * 127.1 + starSeed) * 0.5 + 0.5) * W) | 0;
    const y = ((Math.sin(i * 311.7 + starSeed) * 0.5 + 0.5) * H * 0.65) | 0;
    const r = Math.sin(i * 73.1) * 0.5 + 0.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aurora curtains — green
  for (let band = 0; band < 6; band++) {
    const bx = (band / 6) * W + W * 0.05;
    const bw = W * 0.22;
    const byTop = H * 0.05 + Math.sin(band * 1.3) * H * 0.06;
    const byBot = H * 0.45 + Math.cos(band * 0.9) * H * 0.08;
    const g = ctx.createLinearGradient(0, byTop, 0, byBot);
    g.addColorStop(0,   'rgba(30,220,130,0.0)');
    g.addColorStop(0.2, \`rgba(30,220,130,\${0.18 + band * 0.025})\`);
    g.addColorStop(0.6, \`rgba(40,200,160,\${0.10 + band * 0.015})\`);
    g.addColorStop(1,   'rgba(30,220,130,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.5, (byTop + byBot) * 0.5, bw * 0.5, (byBot - byTop) * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aurora curtains — purple/blue
  for (let band = 0; band < 4; band++) {
    const bx = W * 0.15 + (band / 4) * W * 0.7;
    const bw = W * 0.28;
    const byTop = H * 0.0 + Math.cos(band * 1.7) * H * 0.04;
    const byBot = H * 0.38 + Math.sin(band * 1.1) * H * 0.06;
    const g = ctx.createLinearGradient(0, byTop, 0, byBot);
    g.addColorStop(0,   'rgba(100,50,220,0.0)');
    g.addColorStop(0.3, \`rgba(80,80,200,\${0.12 + band * 0.02})\`);
    g.addColorStop(0.7, \`rgba(120,60,180,\${0.08 + band * 0.015})\`);
    g.addColorStop(1,   'rgba(100,50,220,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.5, (byTop + byBot) * 0.5, bw * 0.4, (byBot - byTop) * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Horizon glow
  const hGlow = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.75);
  hGlow.addColorStop(0,   'rgba(40,160,100,0.18)');
  hGlow.addColorStop(0.5, 'rgba(20,80,60,0.06)');
  hGlow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = hGlow;
  ctx.fillRect(0, H * 0.55, W, H * 0.2);

  // Mountain silhouette
  ctx.fillStyle = '#040608';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.72);
  ctx.lineTo(W * 0.08, H * 0.60);
  ctx.lineTo(W * 0.18, H * 0.68);
  ctx.lineTo(W * 0.28, H * 0.52);
  ctx.lineTo(W * 0.38, H * 0.63);
  ctx.lineTo(W * 0.50, H * 0.48);
  ctx.lineTo(W * 0.60, H * 0.58);
  ctx.lineTo(W * 0.70, H * 0.44);
  ctx.lineTo(W * 0.80, H * 0.55);
  ctx.lineTo(W * 0.90, H * 0.65);
  ctx.lineTo(W,        H * 0.70);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Foreground — dark lake/ground
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  // Lake reflection
  const lake = ctx.createLinearGradient(0, H * 0.78, 0, H);
  lake.addColorStop(0, 'rgba(30,180,100,0.12)');
  lake.addColorStop(0.3, 'rgba(20,120,80,0.06)');
  lake.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = lake;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  // Reflection ripples
  ctx.strokeStyle = 'rgba(40,200,130,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const ry = H * (0.82 + i * 0.022);
    ctx.beginPath();
    ctx.moveTo(W * 0.1, ry);
    ctx.bezierCurveTo(W * 0.3, ry - 3, W * 0.7, ry + 3, W * 0.9, ry);
    ctx.stroke();
  }
}
`;

// ── Palette screenshot ────────────────────────────────────────────────────────

function buildPaletteHTML(selectedIdx = 2) {
  const items = [
    { id: "1", cat: "code",  chip: "CODE", label: "SQL query — user analytics join",      preview: "SELECT u.id, u.name, COUNT(e.id) FROM users u LEFT…", time: "5 min ago",  pinned: false },
    { id: "2", cat: "url",   chip: "URL",  label: "Vercel dashboard — yank-app",           preview: "https://vercel.com/piyush/yank/deployments",            time: "12 min ago", pinned: true  },
    { id: "3", cat: "image", chip: "IMG",  label: "Aurora borealis — Iceland trip",         preview: "Image · 1440 × 900",                                   time: "23 min ago", pinned: false },
    { id: "4", cat: "text",  chip: "TEXT", label: "Meeting notes — design review",          preview: "Discussed new onboarding flow. Action items: 1) Upd…",  time: "1 hr ago",   pinned: false },
    { id: "5", cat: "code",  chip: "CODE", label: "Rust snippet — clipboard watcher",       preview: "fn watch_clipboard(interval: Duration) -> Result<()>…", time: "2 hrs ago",  pinned: false },
  ];

  const listItemsHTML = items.map((item, i) => {
    const isSel = i === selectedIdx;
    const bg = isSel
      ? "background: var(--bg-selected);"
      : "background: transparent;";
    const pinIcon = item.pinned
      ? `<span style="color:var(--accent);font-size:11px;margin-right:4px;">★</span>`
      : "";
    const preview =
      item.cat === "image"
        ? `<canvas id="thumb${i}" width="60" height="38"
             style="border-radius:4px;object-fit:contain;display:block;flex-shrink:0;background:var(--bg-surface-alt);"></canvas>`
        : `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">${item.preview}</span>`;

    return `
      <div class="list-item" data-idx="${i}" style="
        display:flex;align-items:center;gap:10px;
        padding:0 14px;height:52px;cursor:default;
        border-bottom:1px solid var(--border-soft);
        ${bg}
        ${isSel ? "border-left:2px solid var(--accent);padding-left:12px;" : "border-left:2px solid transparent;"}
      ">
        <span class="chip chip-${item.cat}" style="flex-shrink:0;">${item.chip}</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
          <div style="display:flex;align-items:center;gap:6px;">
            ${pinIcon}
            <span style="font-size:13px;font-weight:500;color:${isSel ? "var(--fg)" : "var(--fg-muted)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.label}</span>
          </div>
          ${preview}
        </div>
        <span style="font-size:11px;color:var(--fg-faint);flex-shrink:0;">${item.time}</span>
      </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Yank — Palette</title>
<style>
${BASE_STYLES}

body {
  width: 1280px;
  height: 800px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(1200px 600px at 15% -10%, oklch(28% 0.06 265 / 0.45), transparent 60%),
    radial-gradient(900px 500px at 110% 30%, oklch(26% 0.05 345 / 0.3), transparent 55%),
    oklch(13% 0.006 250);
}

.palette {
  width: 760px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-window);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow:
    0 32px 80px rgba(0,0,0,0.55),
    0 0 0 0.5px oklch(34% 0.006 250 / 0.5),
    inset 0 1px 0 oklch(50% 0.006 250 / 0.15);
  overflow: hidden;
  display: flex;
}

/* LEFT PANE */
.left-pane {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
}
.search-icon {
  font-size: 15px;
  color: var(--fg-faint);
  flex-shrink: 0;
}
.search-input {
  flex: 1;
  font-family: 'Geist', sans-serif;
  font-size: 14px;
  color: var(--fg);
  background: transparent;
  border: none;
  outline: none;
  caret-color: var(--accent);
}
.search-input::placeholder { color: var(--fg-faint); }
.search-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  border: 1px solid oklch(50% 0.14 265 / 0.3);
  letter-spacing: 0.3px;
}

.list { flex: 1; overflow: hidden; }

.footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  gap: 12px;
}
.footer-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--fg-faint);
}

/* RIGHT PANE */
.right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 18px;
  gap: 12px;
  overflow: hidden;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}
.preview-meta span {
  font-size: 12px;
  color: var(--fg-faint);
}
.preview-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
  line-height: 1.3;
}
.preview-sublabel {
  font-size: 12px;
  color: var(--fg-faint);
  font-family: 'JetBrains Mono', monospace;
}
.preview-image-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface-alt);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  min-height: 0;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Geist', sans-serif;
  cursor: default;
  border: 1px solid;
  flex-shrink: 0;
}
.btn-primary {
  background: var(--accent);
  border-color: oklch(62% 0.19 265);
  color: #fff;
  box-shadow: 0 2px 8px oklch(62% 0.19 265 / 0.35);
}
.btn-ghost {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--fg-muted);
}
</style>
</head>
<body>

<div class="palette">
  <!-- LEFT PANE -->
  <div class="left-pane">
    <div class="search-bar">
      <span class="search-icon">⌕</span>
      <div class="search-input" style="display:flex;align-items:center;">
        <span style="color:var(--fg);">aurora</span>
        <span style="display:inline-block;width:1.5px;height:16px;background:var(--accent);margin-left:1px;animation:blink 1s step-end infinite;"></span>
      </div>
      <span class="search-badge">FUZZY</span>
    </div>

    <div class="list">
      ${listItemsHTML}
    </div>

    <div class="footer">
      <div class="footer-hint">
        <kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd>
        <span>navigate</span>
      </div>
      <div class="footer-hint">
        <kbd class="kbd">↵</kbd>
        <span>paste</span>
      </div>
      <div class="footer-hint">
        <kbd class="kbd">⌘P</kbd>
        <span>pin</span>
      </div>
      <div class="footer-hint" style="margin-left:auto;">
        <kbd class="kbd">?</kbd>
      </div>
    </div>
  </div>

  <!-- RIGHT PANE -->
  <div class="right-pane">
    <div class="preview-header">
      <span class="chip chip-img">IMG</span>
      <div class="preview-meta">
        <span>23 min ago</span>
        <span style="color:var(--border);">·</span>
        <span>1440 × 900</span>
      </div>
    </div>

    <div>
      <div class="preview-label">Aurora borealis — Iceland trip</div>
      <div class="preview-sublabel" style="margin-top:4px;">Image · PNG · 1440 × 900 px</div>
    </div>

    <div class="preview-image-wrap">
      <canvas id="mainPreview" width="920" height="576"
        style="max-width:100%;max-height:260px;display:block;border-radius:6px;"></canvas>
    </div>

    <div class="preview-actions">
      <div class="btn btn-primary">
        <span>⎘</span>
        <span>Copy &amp; Paste</span>
        <kbd style="background:oklch(68% 0.19 265);border:none;color:rgba(255,255,255,0.75);font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 5px;border-radius:4px;">↵</kbd>
      </div>
      <div class="btn btn-ghost">
        <span style="font-size:15px;">★</span>
        <span>Pin</span>
      </div>
      <div class="btn btn-ghost">
        <span>⌘P</span>
      </div>
    </div>
  </div>
</div>

<style>
@keyframes blink { 50% { opacity: 0; } }
</style>

<script>
${DEMO_IMAGE_SCRIPT}

// Render demo image into all canvas elements
window.addEventListener('load', () => {
  const main = document.getElementById('mainPreview');
  buildDemoImage(main);

  const thumb2 = document.getElementById('thumb2');
  if (thumb2) buildDemoImage(thumb2);
});
</script>
</body>
</html>`;
}

// ── Library screenshot ────────────────────────────────────────────────────────

function buildLibraryHTML() {
  const imageItems = [
    { label: "Aurora borealis — Iceland trip",       time: "23 min ago", size: "1440 × 900",  pinned: false, selected: true  },
    { label: "Dashboard wireframe — v3 redesign",    time: "1 hr ago",   size: "1280 × 800",  pinned: true,  selected: false },
    { label: "Error screenshot — prod deploy",        time: "2 hrs ago",  size: "2560 × 1440", pinned: false, selected: false },
    { label: "Team photo — offsite 2025",             time: "Yesterday",  size: "3024 × 4032", pinned: false, selected: false },
    { label: "Color palette export — brand refresh",  time: "Yesterday",  size: "800 × 600",   pinned: false, selected: false },
    { label: "Architecture diagram — microservices",  time: "3 days ago", size: "1920 × 1080", pinned: true,  selected: false },
  ];

  const rowsHTML = imageItems.map((item, i) => {
    const bg = item.selected
      ? "background:var(--bg-selected);border-left:2px solid var(--accent);padding-left:10px;"
      : "background:transparent;border-left:2px solid transparent;padding-left:10px;";
    const pin = item.pinned
      ? `<span style="color:var(--accent);font-size:12px;flex-shrink:0;">★</span>` : "";
    return `
      <div style="
        display:flex;align-items:center;gap:12px;
        height:52px;padding:0 12px;
        border-bottom:1px solid var(--border-soft);
        ${bg}
        cursor:default;
      ">
        <canvas id="lthumb${i}" width="80" height="50"
          style="border-radius:4px;flex-shrink:0;background:var(--bg-surface-alt);"></canvas>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            ${pin}
            <span style="font-size:13px;font-weight:${item.selected ? 600 : 400};color:${item.selected ? "var(--fg)" : "var(--fg-muted)"};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${item.label}
            </span>
          </div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);margin-top:2px;">
            ${item.size}
          </div>
        </div>
        <span style="font-size:11px;color:var(--fg-faint);flex-shrink:0;">${item.time}</span>
      </div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Yank — Library</title>
<style>
${BASE_STYLES}

body {
  width: 1280px;
  height: 820px;
  overflow: hidden;
  display: flex;
  background:
    radial-gradient(1200px 600px at 15% -10%, oklch(28% 0.06 265 / 0.45), transparent 60%),
    radial-gradient(900px 500px at 110% 30%, oklch(26% 0.05 345 / 0.3), transparent 55%),
    oklch(13% 0.006 250);
}

.library {
  width: 1220px;
  height: 760px;
  margin: auto;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-window);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  box-shadow:
    0 32px 80px rgba(0,0,0,0.55),
    0 0 0 0.5px oklch(34% 0.006 250 / 0.5),
    inset 0 1px 0 oklch(50% 0.006 250 / 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* title bar */
.titlebar {
  height: 48px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}
.traffic-lights {
  display: flex;
  gap: 7px;
  margin-right: 4px;
}
.tl {
  width: 12px; height: 12px; border-radius: 50%;
}
.tl-red    { background: #ff5f57; }
.tl-yellow { background: #febc2e; }
.tl-green  { background: #28c840; }
.title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

/* main layout */
.main-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* sidebar */
.sidebar {
  width: 196px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft);
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.sidebar-section-label {
  padding: 6px 16px 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--fg-faint);
}
.sidebar-row {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  margin: 0 6px;
  font-size: 13px;
  cursor: default;
}
.sidebar-row.active {
  background: var(--bg-selected);
  color: var(--accent-ink);
}
.sidebar-row:not(.active) {
  color: var(--fg-muted);
}
.sidebar-count {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  color: var(--fg-faint);
}

/* list column */
.list-col {
  width: 380px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
}
.list-search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  gap: 8px;
}
.list-group-label {
  padding: 8px 14px 4px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--fg-faint);
}
.list-items { flex: 1; overflow: hidden; }

/* preview pane */
.preview-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 14px;
  overflow: hidden;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.preview-image-box {
  flex: 1;
  background: var(--bg-surface-alt);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Geist', sans-serif;
  cursor: default;
  border: 1px solid;
}
.btn-primary {
  background: var(--accent);
  border-color: oklch(62% 0.19 265);
  color: #fff;
  box-shadow: 0 2px 8px oklch(62% 0.19 265 / 0.35);
}
.btn-ghost {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--fg-muted);
}
</style>
</head>
<body>

<div class="library">
  <!-- Title bar -->
  <div class="titlebar">
    <div class="traffic-lights">
      <div class="tl tl-red"></div>
      <div class="tl tl-yellow"></div>
      <div class="tl tl-green"></div>
    </div>
    <span class="title-text">Yank</span>
    <div style="margin-left:auto;display:flex;gap:10px;align-items:center;">
      <div style="
        display:flex;align-items:center;gap:6px;
        background:var(--bg-surface);border:1px solid var(--border);
        border-radius:7px;padding:5px 12px;
        font-size:12px;color:var(--fg-muted);
      ">
        <span style="font-size:13px;color:var(--fg-faint);">⌕</span>
        <span>Search clipboard…</span>
      </div>
      <div style="
        display:flex;align-items:center;gap:5px;
        background:var(--accent-soft);border:1px solid oklch(50% 0.14 265 / 0.3);
        border-radius:7px;padding:5px 12px;
        font-size:12px;color:var(--accent-ink);font-weight:500;
      ">
        <span>AI ✦</span>
      </div>
    </div>
  </div>

  <!-- Main layout -->
  <div class="main-layout">

    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-section-label">Filters</div>
      <div class="sidebar-row">
        <div class="dot" style="background:var(--fg-faint);"></div>
        All items
        <span class="sidebar-count">47</span>
      </div>
      <div class="sidebar-row">
        <div class="dot" style="background:var(--accent);"></div>
        Pinned
        <span class="sidebar-count">3</span>
      </div>

      <div class="sidebar-section-label" style="margin-top:8px;">Time</div>
      <div class="sidebar-row">
        <span style="font-size:12px;color:var(--fg-faint);">🕐</span>
        Today
        <span class="sidebar-count">12</span>
      </div>
      <div class="sidebar-row">
        <span style="font-size:12px;color:var(--fg-faint);">🕐</span>
        Last 7 days
        <span class="sidebar-count">31</span>
      </div>

      <div class="sidebar-section-label" style="margin-top:8px;">Categories</div>
      <div class="sidebar-row">
        <div class="dot dot-code"></div>
        Code
        <span class="sidebar-count">14</span>
      </div>
      <div class="sidebar-row">
        <div class="dot dot-url"></div>
        URL
        <span class="sidebar-count">11</span>
      </div>
      <div class="sidebar-row active">
        <div class="dot dot-img"></div>
        Image
        <span class="sidebar-count" style="color:var(--accent-ink);">6</span>
      </div>
      <div class="sidebar-row">
        <div class="dot dot-text"></div>
        Text
        <span class="sidebar-count">16</span>
      </div>
    </div>

    <!-- List column -->
    <div class="list-col">
      <div class="list-search">
        <span style="font-size:15px;color:var(--fg-faint);">⌕</span>
        <span style="font-size:13px;color:var(--fg-faint);flex:1;">Images · 6 items</span>
        <div style="display:flex;gap:4px;">
          <div style="
            font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;
            padding:2px 7px;border-radius:4px;
            background:var(--accent-soft);color:var(--accent-ink);
            border:1px solid oklch(50% 0.14 265 / 0.3);
          ">FUZZY</div>
        </div>
      </div>
      <div class="list-group-label">Today</div>
      <div class="list-items">${rowsHTML}</div>
    </div>

    <!-- Preview pane -->
    <div class="preview-pane">
      <div class="preview-header">
        <span class="chip chip-img">IMG</span>
        <span style="font-size:12px;color:var(--fg-faint);">23 min ago</span>
        <span style="font-size:12px;color:var(--fg-faint);">·</span>
        <span style="font-size:12px;color:var(--fg-faint);">1440 × 900 · PNG</span>
        <span style="margin-left:auto;font-size:14px;color:var(--fg-faint);">★</span>
      </div>

      <div>
        <div style="font-size:16px;font-weight:600;color:var(--fg);">Aurora borealis — Iceland trip</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--fg-faint);margin-top:4px;">Image · 1440 × 900 px</div>
      </div>

      <div class="preview-image-box">
        <canvas id="mainPreview" width="1440" height="900"
          style="max-width:100%;max-height:380px;display:block;border-radius:8px;"></canvas>
      </div>

      <div class="preview-actions">
        <div class="btn btn-primary">
          <span>⎘</span>
          <span>Copy to Clipboard</span>
          <kbd style="background:oklch(68% 0.19 265);border:none;color:rgba(255,255,255,0.75);font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 5px;border-radius:4px;">↵</kbd>
        </div>
        <div class="btn btn-ghost">
          <span style="font-size:14px;">★</span>
          <span>Pin</span>
        </div>
        <div class="btn btn-ghost" style="color:oklch(65% 0.15 15);">
          <span>⌫</span>
          <span>Delete</span>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
${DEMO_IMAGE_SCRIPT}

window.addEventListener('load', () => {
  buildDemoImage(document.getElementById('mainPreview'));
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('lthumb' + i);
    if (el) buildDemoImage(el);
  }
});
</script>
</body>
</html>`;
}

// ── Recording animation HTML ──────────────────────────────────────────────────

function buildRecordingHTML() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Yank — Demo</title>
<style>
${BASE_STYLES}

body {
  width: 1280px;
  height: 800px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(1200px 600px at 15% -10%, oklch(28% 0.06 265 / 0.45), transparent 60%),
    radial-gradient(900px 500px at 110% 30%, oklch(26% 0.05 345 / 0.3), transparent 55%),
    oklch(13% 0.006 250);
}

/* Fake desktop app window behind */
.desktop-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.fake-window {
  position: absolute;
  top: 40px; left: 80px;
  width: 680px;
  height: 480px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
}
.fake-titlebar {
  height: 40px;
  background: var(--bg-surface-alt);
  border-bottom: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 8px;
}
.tl { width: 12px; height: 12px; border-radius: 50%; }
.tl-red    { background: #ff5f57; }
.tl-yellow { background: #febc2e; }
.tl-green  { background: #28c840; }
.fake-window-content {
  padding: 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: var(--fg-muted);
}
.kw { color: oklch(75% 0.15 280); }
.fn { color: oklch(75% 0.15 200); }
.str { color: oklch(78% 0.14 140); }
.cm { color: var(--fg-faint); }

/* Palette overlay */
.palette-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
  opacity: 0;
  transition: opacity 0.25s ease;
}
.palette-overlay.visible { opacity: 1; }

.palette {
  width: 740px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: oklch(20% 0.006 250 / 0.96);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  box-shadow:
    0 40px 100px rgba(0,0,0,0.65),
    0 0 0 0.5px oklch(34% 0.006 250 / 0.5),
    inset 0 1px 0 oklch(50% 0.006 250 / 0.15);
  overflow: hidden;
  display: flex;
  transform: scale(0.96) translateY(8px);
  transition: transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.palette.open {
  transform: scale(1) translateY(0);
}

.left-pane {
  width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-soft);
  display: flex;
  flex-direction: column;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-soft);
}
.list { flex: 1; overflow: hidden; }
.footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  gap: 12px;
}
.footer-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--fg-faint);
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 52px;
  cursor: default;
  border-bottom: 1px solid var(--border-soft);
  border-left: 2px solid transparent;
  transition: background 0.15s;
}
.list-item.selected {
  background: var(--bg-selected);
  border-left-color: var(--accent);
  padding-left: 12px;
}

.right-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 18px;
  gap: 12px;
  overflow: hidden;
}
.preview-image-wrap {
  flex: 1;
  background: var(--bg-surface-alt);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  opacity: 0;
  transition: opacity 0.3s ease 0.1s;
}
.preview-image-wrap.visible { opacity: 1; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Geist', sans-serif;
  cursor: default;
  border: 1px solid;
}
.btn-primary {
  background: var(--accent);
  border-color: oklch(62% 0.19 265);
  color: #fff;
  box-shadow: 0 2px 8px oklch(62% 0.19 265 / 0.35);
  transition: transform 0.1s, box-shadow 0.1s;
}
.btn-primary.pressed {
  transform: scale(0.96);
  box-shadow: 0 1px 4px oklch(62% 0.19 265 / 0.25);
}
.btn-ghost {
  background: var(--bg-surface);
  border-color: var(--border);
  color: var(--fg-muted);
}
</style>
</head>
<body>

<!-- Fake desktop app behind the palette -->
<div class="desktop-bg">
  <div class="fake-window">
    <div class="fake-titlebar">
      <div class="tl tl-red"></div>
      <div class="tl tl-yellow"></div>
      <div class="tl tl-green"></div>
      <span style="font-size:13px;color:var(--fg-muted);margin-left:8px;">my-project — VSCode</span>
    </div>
    <div class="fake-window-content">
      <div><span class="kw">import</span> <span class="str">'./App.css'</span></div>
      <div><span class="kw">import</span> { useState } <span class="kw">from</span> <span class="str">'react'</span></div>
      <div>&nbsp;</div>
      <div><span class="cm">// Copy the aurora image and open Yank</span></div>
      <div><span class="kw">export function</span> <span class="fn">App</span>() {</div>
      <div>&nbsp;&nbsp;<span class="kw">const</span> [img, setImg] = <span class="fn">useState</span>(<span class="kw">null</span>)</div>
      <div>&nbsp;</div>
      <div>&nbsp;&nbsp;<span class="kw">return</span> (</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="fn">div</span> className=<span class="str">"app"</span>&gt;</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span class="fn">img</span> src={img} /&gt;</div>
      <div>&nbsp;&nbsp;&nbsp;&nbsp;&lt;/<span class="fn">div</span>&gt;</div>
      <div>&nbsp;&nbsp;)</div>
      <div>}</div>
    </div>
  </div>
</div>

<!-- Palette overlay -->
<div class="palette-overlay" id="overlay">
  <div class="palette" id="palette">
    <!-- LEFT PANE -->
    <div class="left-pane">
      <div class="search-bar">
        <span style="font-size:15px;color:var(--fg-faint);">⌕</span>
        <div style="flex:1;font-size:14px;color:var(--fg);display:flex;align-items:center;">
          <span id="searchText"></span>
          <span id="cursor" style="display:inline-block;width:1.5px;height:16px;background:var(--accent);margin-left:1px;"></span>
        </div>
        <span style="
          font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:500;
          padding:2px 7px;border-radius:4px;
          background:var(--accent-soft);color:var(--accent-ink);
          border:1px solid oklch(50% 0.14 265 / 0.3);
        ">FUZZY</span>
      </div>

      <div class="list">
        <!-- items rendered below by JS -->
        <div class="list-item" id="item0">
          <span class="chip chip-code">CODE</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">SQL query — user analytics</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">SELECT u.id, COUNT(e.id) FROM users…</div>
          </div>
          <span style="font-size:11px;color:var(--fg-faint);">5m ago</span>
        </div>
        <div class="list-item" id="item1">
          <span class="chip chip-url">URL</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Vercel dashboard — yank-app</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">https://vercel.com/piyush/yank</div>
          </div>
          <span style="font-size:11px;color:var(--fg-faint);">12m ago</span>
        </div>
        <div class="list-item selected" id="item2">
          <span class="chip chip-img">IMG</span>
          <div style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;color:var(--fg);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Aurora borealis — Iceland trip</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);">Image · 1440 × 900</div>
            </div>
            <canvas id="thumb" width="70" height="44"
              style="border-radius:4px;flex-shrink:0;background:var(--bg-surface-alt);"></canvas>
          </div>
          <span style="font-size:11px;color:var(--fg-faint);">23m ago</span>
        </div>
        <div class="list-item" id="item3">
          <span class="chip chip-text">TEXT</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;color:var(--fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Meeting notes — design review</div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--fg-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Discussed new onboarding flow…</div>
          </div>
          <span style="font-size:11px;color:var(--fg-faint);">1h ago</span>
        </div>
      </div>

      <div class="footer">
        <div class="footer-hint">
          <kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd>
          <span>navigate</span>
        </div>
        <div class="footer-hint">
          <kbd class="kbd">↵</kbd>
          <span>paste</span>
        </div>
        <div class="footer-hint">
          <kbd class="kbd">Tab</kbd>
          <span>semantic</span>
        </div>
        <div class="footer-hint" style="margin-left:auto;">
          <kbd class="kbd">?</kbd>
        </div>
      </div>
    </div>

    <!-- RIGHT PANE -->
    <div class="right-pane">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="chip chip-img">IMG</span>
        <span style="font-size:12px;color:var(--fg-faint);">23 min ago</span>
        <span style="font-size:12px;color:var(--fg-faint);">·</span>
        <span style="font-size:12px;color:var(--fg-faint);">1440 × 900</span>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--fg);">Aurora borealis — Iceland trip</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--fg-faint);margin-top:4px;">Image · PNG · 1440 × 900 px</div>
      </div>
      <div class="preview-image-wrap" id="imgWrap">
        <canvas id="mainPreview" width="920" height="576"
          style="max-width:100%;max-height:240px;display:block;border-radius:6px;"></canvas>
      </div>
      <div style="display:flex;gap:8px;">
        <div class="btn btn-primary" id="pasteBtn">
          <span>⎘</span>
          <span>Copy &amp; Paste</span>
          <kbd style="background:oklch(68% 0.19 265);border:none;color:rgba(255,255,255,0.75);font-family:'JetBrains Mono',monospace;font-size:10px;padding:1px 5px;border-radius:4px;">↵</kbd>
        </div>
        <div class="btn btn-ghost">★ Pin</div>
        <div class="btn btn-ghost">⌫</div>
      </div>
    </div>
  </div>
</div>

<script>
${DEMO_IMAGE_SCRIPT}

// Timeline (ms):
//  0    → palette starts opening
//  400  → palette fully open; image preview fades in
//  900  → start "typing" search query
//  1800 → typing done; pause
//  2400 → press Enter (button flash)
//  2700 → palette closes
//  3200 → pause on desktop (image pasted)
//  3600 → loop restart

const overlay = document.getElementById('overlay');
const palette = document.getElementById('palette');
const searchText = document.getElementById('searchText');
const cursor = document.getElementById('cursor');
const imgWrap = document.getElementById('imgWrap');
const pasteBtn = document.getElementById('pasteBtn');
const QUERY = 'aurora';
let loopTimeout;
let step = 0;

function blink() {
  cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0';
}
const blinkInterval = setInterval(blink, 530);

function runTimeline() {
  clearTimeout(loopTimeout);
  step = 0;

  // Reset state
  overlay.classList.remove('visible');
  palette.classList.remove('open');
  imgWrap.classList.remove('visible');
  pasteBtn.classList.remove('pressed');
  searchText.textContent = '';

  // Step 0 → 50ms: start overlay
  loopTimeout = setTimeout(() => {
    overlay.classList.add('visible');
  }, 50);

  // Step 1 → 200ms: open palette
  loopTimeout = setTimeout(() => {
    palette.classList.add('open');
  }, 200);

  // Step 2 → 600ms: image preview fades in
  loopTimeout = setTimeout(() => {
    imgWrap.classList.add('visible');
  }, 600);

  // Step 3 → 1000ms: start typing
  let typed = 0;
  function typeNext() {
    if (typed < QUERY.length) {
      searchText.textContent = QUERY.slice(0, ++typed);
      loopTimeout = setTimeout(typeNext, 100 + Math.random() * 60);
    }
  }
  loopTimeout = setTimeout(typeNext, 1000);

  // Step 4 → 2400ms: press enter
  loopTimeout = setTimeout(() => {
    pasteBtn.classList.add('pressed');
  }, 2400);

  // Step 5 → 2550ms: start closing
  loopTimeout = setTimeout(() => {
    pasteBtn.classList.remove('pressed');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    palette.style.transform = 'scale(0.96) translateY(8px)';
    palette.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1)';
  }, 2550);

  // Step 6 → 3000ms: fully hidden; reset for loop
  loopTimeout = setTimeout(() => {
    overlay.style.opacity = '';
    overlay.style.transition = '';
    palette.style.transform = '';
    palette.style.transition = '';
    overlay.classList.remove('visible');
    palette.classList.remove('open');
  }, 3000);

  // Loop
  loopTimeout = setTimeout(runTimeline, 4200);
}

window.addEventListener('load', () => {
  buildDemoImage(document.getElementById('mainPreview'));
  buildDemoImage(document.getElementById('thumb'));
  // Small delay before first run so fonts load
  setTimeout(runTimeline, 600);
});
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_SCREENSHOTS, { recursive: true });
  fs.mkdirSync(OUT_RECORDINGS, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    // ── Screenshot 1: Palette with image preview ──────────────────────────
    console.log("📸 Capturing palette screenshot…");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      await page.setContent(buildPaletteHTML(2), { waitUntil: "networkidle" });
      // Wait for canvas to render
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT_SCREENSHOTS, "palette-image-preview.png"),
        type: "png",
      });
      await ctx.close();
      console.log("  ✓ palette-image-preview.png");
    }

    // ── Screenshot 2: Library with image filter ───────────────────────────
    console.log("📸 Capturing library screenshot…");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
      const page = await ctx.newPage();
      await page.setContent(buildLibraryHTML(), { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT_SCREENSHOTS, "library-image-filter.png"),
        type: "png",
      });
      await ctx.close();
      console.log("  ✓ library-image-filter.png");
    }

    // ── Screen recording: animated copy-paste demo ────────────────────────
    console.log("🎬 Recording copy-paste animation…");
    {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: {
          dir: OUT_RECORDINGS,
          size: { width: 1280, height: 800 },
        },
      });
      const page = await ctx.newPage();
      await page.setContent(buildRecordingHTML(), { waitUntil: "networkidle" });
      // Let 2 full loop cycles play out for a clean loop-able recording
      await page.waitForTimeout(9200);
      const videoPath = await page.video().path();
      await ctx.close();
      // Rename to a predictable name
      const dest = path.join(OUT_RECORDINGS, "image-copy-paste.webm");
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      fs.renameSync(videoPath, dest);
      console.log("  ✓ image-copy-paste.webm");
    }

  } finally {
    await browser.close();
  }

  console.log("\n✅  All media assets generated in public/screenshots/ and public/recordings/");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

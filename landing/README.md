# Yank — Landing Page

Marketing site for [Yank](../). Built with [Astro](https://astro.build) —
static, no client-side JS by default.

## Deploy on Vercel

This project is configured for one-click Vercel deployment.

**First-time setup:**

1. Go to <https://vercel.com/new> and import the
   [piyushpradhan/recall](https://github.com/piyushpradhan/recall) repo.
2. In the project settings, set **Root Directory** to `landing`.
3. Vercel auto-detects Astro from `vercel.json` — leave the build/output
   settings as-is.
4. Click **Deploy**. Subsequent pushes to `main` auto-deploy; PRs get
   preview URLs.

The site lives at `recall.pages.dev` (or whatever domain you set in the
Vercel dashboard). Update `site` in [`astro.config.mjs`](./astro.config.mjs)
to match for correct OG tags.

**With the Vercel CLI:**

```bash
npm i -g vercel
cd landing
vercel        # link the project (one-time)
vercel --prod # deploy
```

## Develop

```bash
cd landing
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # writes static site to dist/
npm run preview  # serve the built site locally
```

## Structure

- `src/layouts/Layout.astro` — base HTML, theme variables, fonts
- `src/components/` — Nav, Hero, Features, Showcase, Download, Footer
- `src/pages/index.astro` — composes the page
- `vercel.json` — Vercel build + caching config

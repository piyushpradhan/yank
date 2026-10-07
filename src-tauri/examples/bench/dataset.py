"""Builds dataset.json — the shared eval corpus for Yank semantic search.

    python dataset.py            # writes dataset.json next to this file

Three layers, all deterministic (fixed seed):

1. legacy  — the 136 items + 56 queries from the original Rust eval (legacy.json).
2. targets — hand-written clipboard items, each with 1–3 queries in the styles
             people actually type: `kw` (reuses an item word), `para` (paraphrase,
             no shared stems), `short` (1–3 word palette query), `vague` (fuzzy
             recall like "that thing about ...").
3. noise   — ~1.5k realistic clipboard junk (SHAs, log lines, chat replies, URLs,
             phones, emails, snippets) that no query targets. They are the hard
             part: a real clipboard is mostly this.

Items carry no AI label unless the legacy set gave one — most users don't run
the Haiku labeller, so search must work on raw content.
"""

import json
import random
from pathlib import Path

HERE = Path(__file__).parent
RNG = random.Random(1729)


# --------------------------------------------------------------------------
# 1. Legacy set from the original Rust harness
# --------------------------------------------------------------------------

def legacy():
    """136 items + 56 queries from the original Rust harness (frozen in legacy.json)."""
    d = json.loads((HERE / "legacy.json").read_text())
    items, queries = d["items"], d["queries"]
    assert len(items) == 136, len(items)
    assert len(queries) == 56, len(queries)
    # The pre-Jev harness also had these short / keyword queries — keep them.
    extra = [
        ("dad's mailing address", [1], "kw"), ("chocolate chip cookie recipe", [4], "kw"),
        ("anniversary dinner reservation", [10], "kw"), ("flight to LAX", [25], "kw"),
        ("Marriott reservation in NYC", [26], "kw"), ("Lisbon airbnb", [30], "kw"),
        ("USD to EUR conversion rate", [29], "kw"), ("amazon order number", [37], "kw"),
        ("fedex tracking", [38], "short"), ("KitchenAid mixer price", [40], "kw"),
        ("warby parker glasses link", [43], "kw"), ("J Crew discount code", [41], "kw"),
        ("paypal transaction id", [56], "kw"), ("mortgage rate locked", [59], "kw"),
        ("how much is rent", [60], "kw"), ("Phoebe Bridgers tickets", [66], "kw"),
        ("Severance season 2 release date", [72], "kw"), ("Acquired podcast TSMC", [64], "kw"),
        ("Netflix queue", [69], "short"), ("photosynthesis equation", [79], "kw"),
        ("marcus aurelius quote", [78], "kw"), ("Je ne sais quoi meaning", [80], "kw"),
        ("cup to ml conversion", [86], "kw"), ("monstera plant care", [89], "kw"),
        ("atorvastatin prescription", [95], "kw"), ("annual physical results", [98], "kw"),
        ("primary care doctor phone", [96], "kw"), ("marketing brief deadline", [104], "kw"),
        ("salesforce account id", [107], "kw"), ("expense report", [106], "short"),
        ("interactive git rebase", [117], "kw"), ("kubernetes deployment restart", [120], "kw"),
        ("auth middleware Python", [119], "kw"), ("the staging API URL", [116], "kw"),
        ("brand color hex", [130], "kw"), ("the phone number I had for the babysitter", [6], "kw"),
        ("that recipe I saved", [4, 85], "vague"),
        ("the link I copied yesterday", [134], "time"), ("what did I save yesterday", [16, 50, 121, 134], "time"),
        ("OTP code today", [128], "time"), ("addresses", [1, 30, 131], "cat"),
        ("phone numbers", [2, 6, 12, 24, 96, 133], "cat"), ("emails", [3, 132], "cat"),
        # paraphrases for legacy items the original set never queried
        ("how much cash is in checking", [53], "para"), ("my retirement plan payroll split", [54], "para"),
        ("the handle to send sarah money", [55], "para"), ("when taxes must be submitted", [57], "para"),
        ("my crypto receiving string", [58], "para"), ("that long movie from the indie studio", [62], "para"),
        ("the book about teens and phones", [65], "para"), ("films to watch later list", [68], "para"),
        ("pc games I'd like to buy", [73], "para"), ("the science guy who builds gadgets on youtube", [74], "para"),
        ("the fifth taste", [77], "para"), ("my med school entrance exam result", [81], "para"),
        ("online machine learning class", [82], "para"), ("the spanish word for making the most of it", [83], "para"),
        ("the congress trade power clause", [84], "para"), ("fahrenheit to celsius for baking", [87], "para"),
        ("furnace air filter dimensions", [90], "para"), ("pour over brewing proportions", [91], "para"),
        ("feeding the bread culture", [92], "para"), ("when to poke holes in the grass", [93], "para"),
        ("the swedish shelf build", [94], "para"), ("immunotherapy injection days", [97], "para"),
        ("where my meds get filled", [99], "para"), ("my counseling sessions", [100], "para"),
        ("the head pain diary", [101], "para"), ("influenza vaccine", [102], "para"),
        ("deals in the funnel this quarter", [103], "para"), ("meeting with janet about performance", [105], "para"),
        ("purchase order for the supplier", [108], "para"), ("retention goal for next quarter", [109], "para"),
        ("when the announcement can go public", [110], "para"), ("visiting the pharma customer", [111], "para"),
        ("note to brian about the executive job", [112], "para"), ("query for new users this week", [118], "para"),
        ("spin up containers locally", [121], "para"), ("the hooks issue on github", [122], "para"),
        ("my clipboard app repository", [123], "para"), ("the component library design file", [127], "para"),
        ("auth token for postman", [129], "para"), ("google headquarters location", [131], "para"),
        ("rickroll video", [134], "para"), ("code freeze reminder", [135], "kw"),
    ]
    queries += [{"q": q, "relevant": r, "kind": k} for q, r, k in extra]
    return items, queries


# --------------------------------------------------------------------------
# 2. Hand-written targets: (content, category, source, days_ago, [(query, kind), ...])
# --------------------------------------------------------------------------

T = [
    # ---- dev: shell / git -------------------------------------------------
    ("git push --force-with-lease origin feature/billing-v2", "code", "Terminal", 3,
     [("force push safely", "kw"), ("overwrite remote branch without clobbering teammates", "para")]),
    ("git stash push -m 'wip: onboarding copy' -- src/onboarding", "code", "Terminal", 9,
     [("git stash with message", "kw"), ("shelve my unfinished changes to one folder", "para")]),
    ("git cherry-pick -x 4f2a9c1e", "code", "Terminal", 14,
     [("cherry pick", "short"), ("apply a single commit from another branch", "para")]),
    ("git bisect start HEAD v0.7.40", "code", "Terminal", 33,
     [("bisect", "short"), ("binary search for the commit that broke things", "para")]),
    ("git log --oneline --graph --decorate --all", "code", "Terminal", 60,
     [("git log graph", "kw"), ("pretty tree view of all branches history", "para")]),
    ("git reset --soft HEAD~1", "code", "Terminal", 5,
     [("undo last commit keep changes", "para"), ("reset soft", "short")]),
    ("git worktree add ../yank-hotfix hotfix/0.7.63", "code", "Terminal", 12,
     [("worktree add", "short"), ("second checkout of the repo in a sibling folder", "para")]),
    ("git config --global pull.rebase true", "code", "Terminal", 200,
     [("make pull rebase by default", "kw"), ("stop merge commits when syncing", "para")]),
    ("gh pr create --fill --draft --base main", "code", "Terminal", 2,
     [("open draft pull request from cli", "kw"), ("gh pr create", "short")]),
    ("gh run watch --exit-status", "code", "Terminal", 4,
     [("watch ci run", "kw"), ("follow the github actions job until it finishes", "para")]),
    ("find . -name node_modules -type d -prune -exec rm -rf {} +", "code", "Terminal", 45,
     [("delete all node_modules folders", "kw"), ("reclaim disk from js dependency dirs", "para")]),
    ("lsof -nP -iTCP:3000 -sTCP:LISTEN", "code", "Terminal", 6,
     [("what is using port 3000", "kw"), ("which process is listening on the dev server socket", "para")]),
    ("kill -9 $(lsof -t -i:5173)", "code", "Terminal", 6,
     [("kill vite port", "vague"), ("terminate whatever holds 5173", "kw")]),
    ("du -sh * | sort -h | tail -20", "code", "Terminal", 70,
     [("biggest folders disk usage", "kw"), ("which directories eat the most space", "para")]),
    ("rsync -avz --progress ./dist/ deploy@10.0.4.12:/var/www/landing/", "code", "Terminal", 20,
     [("rsync deploy landing", "kw"), ("copy the built site to the server", "para")]),
    ("ssh -L 5432:localhost:5432 bastion.prod.internal", "code", "Terminal", 8,
     [("ssh tunnel postgres", "kw"), ("port forward the database through the jump host", "para")]),
    ("openssl rand -base64 32", "code", "Terminal", 30,
     [("generate random secret", "kw"), ("make a strong random key string", "para")]),
    ("xattr -dr com.apple.quarantine /Applications/Yank.app", "code", "Terminal", 16,
     [("remove quarantine attribute", "kw"), ("fix app is damaged gatekeeper", "para")]),
    ("codesign --force --deep --sign - /Applications/Yank.app", "code", "Terminal", 16,
     [("ad hoc codesign", "kw"), ("re-sign the mac app without a developer id", "para")]),
    ("brew services restart postgresql@16", "code", "Terminal", 25,
     [("restart postgres brew", "kw"), ("bounce the local database service", "para")]),
    ("tar -czvf backup-2026-09.tar.gz ~/Documents/finance", "code", "Terminal", 28,
     [("tarball backup", "kw"), ("compress the money documents folder", "para")]),
    ("ffmpeg -i demo.mov -vf scale=1280:-1 -r 30 demo.gif", "code", "Terminal", 11,
     [("convert video to gif", "kw"), ("turn the screen recording into an animated image", "para")]),
    ("pnpm dlx shadcn@latest add dialog", "code", "Terminal", 13,
     [("shadcn add dialog", "kw"), ("install the modal component from the ui kit", "para")]),
    ("cargo tauri build --target universal-apple-darwin", "code", "Terminal", 7,
     [("universal mac build", "kw"), ("compile the desktop app for both intel and apple silicon", "para")]),
    ("RUST_LOG=yank=debug cargo run", "code", "Terminal", 4,
     [("debug logging rust", "kw"), ("run the app with verbose tracing output", "para")]),
    ("cargo clippy --all-targets -- -D warnings", "code", "Terminal", 10,
     [("clippy deny warnings", "kw"), ("strict lint the rust crate", "para")]),
    ("npx prisma migrate dev --name add_invoice_status", "code", "Terminal", 19,
     [("prisma migration", "short"), ("create a schema change for invoice state", "para")]),
    ("docker system prune -af --volumes", "code", "Terminal", 40,
     [("docker prune everything", "kw"), ("wipe all unused containers and images", "para")]),
    ("docker exec -it api-db-1 psql -U postgres", "code", "Terminal", 9,
     [("psql into docker container", "kw"), ("open a database shell inside the container", "para")]),
    ("kubectl logs -f deploy/worker -n jobs --since=10m", "code", "Terminal", 3,
     [("tail worker logs k8s", "kw"), ("stream recent output of the background job pods", "para")]),
    ("kubectl get pods -A | grep -v Running", "code", "Terminal", 15,
     [("unhealthy pods", "kw"), ("which pods are not up across namespaces", "para")]),
    ("terraform plan -out=tfplan -var-file=prod.tfvars", "code", "Terminal", 22,
     [("terraform plan prod", "kw"), ("preview infrastructure changes for production", "para")]),
    ("aws s3 sync ./build s3://acme-landing --delete", "code", "Terminal", 26,
     [("s3 sync", "short"), ("upload static site to the bucket", "para")]),
    ("aws sso login --profile acme-prod", "code", "Terminal", 1,
     [("aws sso login", "short"), ("authenticate to the cloud account for production", "para")]),
    ("curl -s https://api.github.com/repos/piyushpradhan/yank/releases/latest | jq -r .tag_name", "code", "Terminal", 5,
     [("latest release tag curl", "kw"), ("fetch the newest version number of the repo", "para")]),
    ("python3 -m http.server 8080", "code", "Terminal", 50,
     [("simple http server python", "kw"), ("serve this folder over the web quickly", "para")]),
    ("sudo lsof -i :53", "code", "Terminal", 90,
     [("who owns dns port", "para")]),
    ("defaults write com.apple.dock autohide-delay -float 0; killall Dock", "code", "Terminal", 120,
     [("dock autohide delay", "kw"), ("make the mac taskbar pop up instantly", "para")]),

    # ---- dev: code snippets ----------------------------------------------
    ("const debounced = useMemo(() => debounce(onSearch, 150), [onSearch]);", "code", "VSCode", 3,
     [("debounce search input react", "kw"), ("delay firing the query until typing pauses", "para")]),
    ("await new Promise((r) => setTimeout(r, 500));", "code", "VSCode", 20,
     [("sleep in javascript", "kw"), ("wait half a second async", "para")]),
    ("export async function GET(req: Request) { return Response.json({ ok: true }) }", "code", "VSCode", 11,
     [("next route handler GET", "kw"), ("minimal api endpoint returning ok", "para")]),
    ("const [state, dispatch] = useReducer(reducer, initialState);", "code", "VSCode", 44,
     [("useReducer", "short"), ("react hook for action based state", "para")]),
    ("document.querySelectorAll('a[href^=\"http\"]').forEach(a => a.target = '_blank')", "code", "Chrome", 30,
     [("open external links in new tab", "kw"), ("make outbound anchors launch separately", "para")]),
    ("navigator.clipboard.writeText(text).then(() => toast('Copied'))", "code", "VSCode", 8,
     [("copy to clipboard js", "kw"), ("put text on the pasteboard from the browser", "para")]),
    ("const controller = new AbortController(); fetch(url, { signal: controller.signal });", "code", "VSCode", 17,
     [("abort fetch", "kw"), ("cancel an in flight network request", "para")]),
    ("z.object({ email: z.string().email(), age: z.number().int().min(18) })", "code", "VSCode", 21,
     [("zod schema email", "kw"), ("validation for adult user with mail", "para")]),
    ("#[tauri::command]\nasync fn search(query: String) -> Result<Vec<Item>, String> {", "code", "VSCode", 2,
     [("tauri command signature", "kw"), ("rust function exposed to the frontend", "para")]),
    ("let re = Regex::new(r\"(?i)\\b(\\d{3})-(\\d{4})\\b\").unwrap();", "code", "VSCode", 36,
     [("rust regex case insensitive", "kw"), ("pattern matcher for dashed digits in rust", "para")]),
    ("tokio::spawn(async move { if let Err(e) = worker.run().await { eprintln!(\"{e}\") } });", "code", "VSCode", 14,
     [("tokio spawn", "short"), ("run a background task on the async runtime", "para")]),
    ("impl From<rusqlite::Error> for AppError { fn from(e: rusqlite::Error) -> Self { AppError::Db(e.to_string()) } }", "code", "VSCode", 27,
     [("impl From error conversion", "kw"), ("map the sqlite failure into my error type", "para")]),
    ("CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);", "code", "DataGrip", 12,
     [("create index concurrently", "kw"), ("speed up order lookups by customer without locking", "para")]),
    ("SELECT date_trunc('day', created_at) d, count(*) FROM events GROUP BY 1 ORDER BY 1;", "code", "DataGrip", 7,
     [("events per day sql", "kw"), ("daily count of activity rows", "para")]),
    ("EXPLAIN ANALYZE SELECT * FROM invoices WHERE status = 'overdue';", "code", "DataGrip", 18,
     [("explain analyze", "short"), ("why is the late bills query slow", "para")]),
    ("UPDATE users SET plan = 'pro' WHERE id IN (SELECT user_id FROM payments WHERE amount > 0);", "code", "DataGrip", 40,
     [("upgrade paying users to pro sql", "kw"), ("bump everyone who paid onto the premium tier", "para")]),
    ("PRAGMA journal_mode=WAL;", "code", "VSCode", 55,
     [("sqlite wal mode", "kw"), ("write ahead logging for the embedded db", "para")]),
    ("with open(path, encoding='utf-8') as f:\n    data = json.load(f)", "code", "VSCode", 66,
     [("read json file python", "kw"), ("load a config from disk in python", "para")]),
    ("df.groupby('country')['revenue'].sum().sort_values(ascending=False).head(10)", "code", "Jupyter", 23,
     [("pandas groupby sum top 10", "kw"), ("top nations by sales in the dataframe", "para")]),
    ("python -m venv .venv && source .venv/bin/activate", "code", "Terminal", 80,
     [("create python venv", "kw"), ("isolated environment for dependencies", "para")]),
    ("@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))", "code", "VSCode", 31,
     [("tenacity retry decorator", "kw"), ("try again with growing backoff three times", "para")]),
    ("func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {", "code", "VSCode", 48,
     [("go http handler", "kw"), ("golang web request method", "para")]),
    ("location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }", "code", "VSCode", 52,
     [("nginx reverse proxy", "kw"), ("forward web traffic to the node app", "para")]),
    ("FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci", "code", "VSCode", 38,
     [("dockerfile node alpine", "kw"), ("container image recipe for the js app", "para")]),
    ("on:\n  push:\n    tags: ['v*']\njobs:\n  release:\n    runs-on: macos-14", "code", "VSCode", 16,
     [("github actions release on tag", "kw"), ("ci workflow that publishes when I tag a version", "para")]),
    ("\"paths\": { \"@/*\": [\"./src/*\"] }", "code", "VSCode", 90,
     [("tsconfig path alias", "kw"), ("import shortcut for the source folder", "para")]),
    ("grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));", "code", "VSCode", 26,
     [("responsive css grid auto fill", "kw"), ("cards that wrap to fit the screen width", "para")]),
    ("@media (prefers-color-scheme: dark) { :root { --bg: #0b0b0c; } }", "code", "VSCode", 41,
     [("dark mode media query", "kw"), ("night theme css variables", "para")]),
    ("backdrop-filter: blur(20px) saturate(180%);", "code", "VSCode", 9,
     [("frosted glass css", "para"), ("backdrop blur", "short")]),
    ("transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);", "code", "VSCode", 19,
     [("css easing curve", "kw"), ("snappy animation timing", "para")]),
    ("export default defineConfig({ plugins: [react()], server: { port: 1420, strictPort: true } })", "code", "VSCode", 58,
     [("vite config port", "kw"), ("bundler settings for the dev server", "para")]),
    ("sk_test_51Nx8mYHk2Q0vR3cTEST_KEY_PLACEHOLDER", "code", "Chrome", 10,
     [("stripe test key", "kw"), ("payments sandbox secret", "para")]),
    ("OPENAI_API_KEY=sk-proj-EXAMPLEONLYnotarealkey123", "code", "VSCode", 24,
     [("openai api key env", "kw"), ("the llm provider credential variable", "para")]),
    ("DATABASE_URL=postgres://app:app@localhost:5432/acme_dev", "code", "VSCode", 29,
     [("local database url", "kw"), ("dev postgres connection string", "para")]),
    ("REDIS_URL=redis://default:hunter2@redis-12345.c1.us-east-1.cloud.redislabs.com:12345", "code", "VSCode", 34,
     [("redis connection url", "kw"), ("hosted cache server credentials", "para")]),
    ("ghp_EXAMPLEaBcDeFgHiJkLmNoPqRsTuVwXyZ0123", "code", "Chrome", 43,
     [("github personal access token", "kw"), ("token for the code host api", "para")]),

    # ---- dev: urls ---------------------------------------------------------
    ("https://tauri.app/reference/config/#bundleconfig", "url", "Chrome", 8,
     [("tauri bundle config docs", "kw"), ("desktop framework packaging settings reference", "para")]),
    ("https://v2.tauri.app/plugin/updater/", "url", "Chrome", 21,
     [("tauri updater plugin", "kw"), ("auto update docs for the desktop app", "para")]),
    ("https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html", "url", "Chrome", 30,
     [("rusqlite connection docs", "kw"), ("rust sqlite api reference", "para")]),
    ("https://www.sqlite.org/fts5.html#the_bm25_function", "url", "Chrome", 12,
     [("fts5 bm25", "kw"), ("full text ranking function documentation", "para")]),
    ("https://developer.apple.com/documentation/appkit/nspasteboard", "url", "Chrome", 60,
     [("nspasteboard docs", "kw"), ("apple clipboard api reference", "para")]),
    ("https://react.dev/reference/react/useSyncExternalStore", "url", "Chrome", 17,
     [("useSyncExternalStore", "short"), ("hook for subscribing to outside state", "para")]),
    ("https://tailwindcss.com/docs/theme#customizing-your-theme", "url", "Chrome", 25,
     [("tailwind theme customize", "kw"), ("utility css framework design tokens", "para")]),
    ("https://github.com/tauri-apps/tauri/issues/9127", "url", "Chrome", 9,
     [("tauri issue about the window", "vague"), ("desktop framework bug report", "para")]),
    ("https://github.com/piyushpradhan/yank/pull/57", "url", "Chrome", 1,
     [("yank pull request 57", "kw"), ("my latest PR on the clipboard app", "para")]),
    ("https://github.com/piyushpradhan/yank/actions/runs/11029384756", "url", "Chrome", 1,
     [("yank ci run", "kw"), ("the failing build on my clipboard project", "para")]),
    ("https://vercel.com/piyush/landing/deployments", "url", "Chrome", 11,
     [("vercel deployments", "kw"), ("hosting dashboard for the marketing site", "para")]),
    ("https://dashboard.stripe.com/test/webhooks/we_1Nx9", "url", "Chrome", 10,
     [("stripe webhook dashboard", "kw"), ("payments event endpoint settings", "para")]),
    ("https://console.cloud.google.com/apis/credentials?project=acme-prod", "url", "Chrome", 35,
     [("google cloud credentials", "kw"), ("oauth client keys console", "para")]),
    ("https://app.datadoghq.com/apm/services/api?env=prod", "url", "Chrome", 6,
     [("datadog apm api service", "kw"), ("performance monitoring for the backend", "para")]),
    ("https://acme.sentry.io/issues/4481920374/", "url", "Chrome", 3,
     [("sentry issue", "short"), ("crash report from error tracking", "para")]),
    ("https://linear.app/acme/issue/ENG-2318/palette-freezes-on-large-images", "url", "Chrome", 2,
     [("linear ticket palette freeze", "kw"), ("bug about the quick picker hanging with big pictures", "para")]),
    ("https://www.notion.so/acme/Q4-roadmap-8f2e1c", "url", "Chrome", 20,
     [("notion roadmap", "kw"), ("planning doc for next quarter", "para")]),
    ("https://news.ycombinator.com/item?id=41552011", "url", "Chrome", 4,
     [("hacker news thread", "kw"), ("that orange site discussion", "para")]),
    ("https://arxiv.org/abs/2004.12832", "url", "Chrome", 45,
     [("arxiv paper", "short"), ("the colbert late interaction retrieval paper", "vague")]),
    ("https://huggingface.co/BAAI/bge-small-en-v1.5", "url", "Chrome", 30,
     [("bge small model card", "kw"), ("the tiny embedding model page", "para")]),
    ("https://huggingface.co/aac6fef/laya-mlx", "url", "Chrome", 8,
     [("laya mlx", "short"), ("apple silicon typed decision model weights", "para")]),
    ("https://docs.typesafe.ai/cookbooks/rerank_typesafe", "url", "Chrome", 10,
     [("typesafe rerank cookbook", "kw"), ("jev reranking guide", "para")]),
    ("https://crates.io/crates/fastembed", "url", "Chrome", 30,
     [("fastembed crate", "kw"), ("rust library for local vectors", "para")]),
    ("https://caniuse.com/css-has", "url", "Chrome", 50,
     [("can i use has selector", "kw"), ("browser support for the parent css pseudo class", "para")]),
    ("https://regex101.com/r/Xk3fPq/1", "url", "Chrome", 36,
     [("regex101", "short"), ("the pattern tester link", "para")]),
    ("https://excalidraw.com/#json=5Kq2,architecture", "url", "Chrome", 18,
     [("excalidraw diagram", "kw"), ("the whiteboard sketch of the system", "para")]),
    ("https://www.figma.com/proto/xyz/Onboarding-flow?node-id=12-4", "url", "Figma", 7,
     [("onboarding prototype figma", "kw"), ("clickable first run design", "para")]),
    ("https://meet.google.com/xqe-hdna-ruv", "url", "Calendar", 0,
     [("google meet link", "kw"), ("video call url for today's sync", "para")]),
    ("https://zoom.us/j/93810234477?pwd=QkRtZ0", "url", "Mail", 5,
     [("zoom link", "short"), ("the conference call join url", "para")]),
    ("https://calendly.com/piyush-pradhan/30min", "url", "Chrome", 40,
     [("calendly link", "short"), ("my booking page for half hour chats", "para")]),
    ("https://www.youtube.com/watch?v=wjZofJX0v4M", "url", "Chrome", 12,
     [("youtube video on transformers", "vague"), ("that neural network explainer video", "vague")]),
    ("https://www.reddit.com/r/rust/comments/1f2x9q/async_drop_is_finally_here/", "url", "Chrome", 15,
     [("reddit rust async drop", "kw"), ("forum post about asynchronous destructors", "para")]),
    ("https://stackoverflow.com/questions/59078296/how-to-mock-fetch-in-jest", "url", "Chrome", 22,
     [("mock fetch jest stackoverflow", "kw"), ("faking network calls in unit tests answer", "para")]),
    ("https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver", "url", "Chrome", 27,
     [("intersection observer mdn", "kw"), ("detect when element scrolls into view docs", "para")]),
    ("https://www.postgresql.org/docs/current/functions-json.html", "url", "Chrome", 33,
     [("postgres json functions", "kw"), ("database docs for jsonb operators", "para")]),
    ("https://fonts.google.com/specimen/Inter", "url", "Chrome", 70,
     [("inter font", "kw"), ("the ui typeface download page", "para")]),
    ("https://lucide.dev/icons/clipboard-copy", "url", "Chrome", 14,
     [("lucide clipboard icon", "kw"), ("svg glyph for copy action", "para")]),
    ("https://www.producthunt.com/posts/yank-2", "url", "Chrome", 90,
     [("product hunt launch", "kw"), ("where I launched the clipboard app publicly", "para")]),
    ("https://x.com/piyushpradhan/status/1830012345678901234", "url", "Chrome", 30,
     [("my tweet", "vague"), ("the post I made on x", "para")]),
    ("https://www.linkedin.com/in/jyoti-rao-eng/", "url", "Chrome", 64,
     [("jyoti linkedin", "kw"), ("my manager's professional profile", "vague")]),

    # ---- dev: paths ----------------------------------------------------------
    ("~/Library/Application Support/com.yank.app/yank.db", "path", "Finder", 5,
     [("yank database file", "kw"), ("where the clipboard history is stored on disk", "para")]),
    ("~/Library/Logs/Yank/yank.log", "path", "Finder", 3,
     [("yank log file", "kw"), ("where the app writes its diagnostics", "para")]),
    ("/etc/nginx/sites-available/landing.conf", "path", "Terminal", 52,
     [("nginx site config", "kw"), ("web server virtual host file for the marketing page", "para")]),
    ("~/.ssh/config", "path", "Terminal", 100,
     [("ssh config", "short"), ("the file with my server host aliases", "para")]),
    ("~/.config/ghostty/config", "path", "Terminal", 45,
     [("ghostty config", "short"), ("terminal emulator settings file", "para")]),
    ("/Users/piyush/projects/yank/src-tauri/src/commands.rs", "path", "VSCode", 1,
     [("commands.rs", "short"), ("rust file with the frontend handlers", "para")]),
    ("src/components/QuickPalette.tsx", "path", "VSCode", 2,
     [("quick palette component", "kw"), ("the floating picker ui file", "para")]),
    ("~/Downloads/Invoice-INV-20931.pdf", "path", "Finder", 14,
     [("invoice pdf downloads", "kw"), ("the bill document I downloaded", "para")]),
    ("~/Desktop/Screenshot 2026-09-21 at 11.42.07.png", "path", "Finder", 8,
     [("screenshot on desktop", "kw"), ("screen capture image file from the 21st", "para")]),

    # ---- work comms ---------------------------------------------------------
    ("Standup: shipped the palette fix, today pairing with Ana on the updater, blocked on notarization creds", "text", "Slack", 1,
     [("my standup update", "kw"), ("what I told the team this morning", "para")]),
    ("Hey Jyo — can we push our 1:1 to Thursday? I have the dentist Wednesday afternoon", "text", "Slack", 6,
     [("message to jyo reschedule 1:1", "kw"), ("asking my manager to move our weekly chat", "para")]),
    ("Incident 2026-09-14: API p99 latency spiked to 4.2s after deploy 812; rolled back at 14:05 UTC", "text", "Slack", 15,
     [("incident latency spike", "kw"), ("the outage where requests got slow after a release", "para")]),
    ("Retro action items: 1) add canary stage 2) alert on queue depth 3) doc the rollback runbook", "text", "Notion", 13,
     [("retro action items", "kw"), ("follow ups from the post mortem", "para")]),
    ("Offer letter: Senior Engineer, base $185,000, 0.08% equity, start Oct 14", "text", "Mail", 25,
     [("offer letter salary", "kw"), ("compensation details for the new job", "para")]),
    ("Interview loop Tue: 10am system design (Priya), 11:30 coding (Marco), 2pm hiring manager", "text", "Mail", 30,
     [("interview schedule", "kw"), ("the order of my onsite conversations", "para")]),
    ("PTO request: Dec 22 – Jan 2, approved by Jyo", "text", "Slack", 40,
     [("holiday leave dates", "para"), ("pto request", "short")]),
    ("Code review feedback: extract the ranking fusion into its own fn and add a unit test", "text", "GitHub", 4,
     [("review comment about ranking fusion", "kw"), ("reviewer asked me to split out the scoring merge", "para")]),
    ("Design crit notes: palette rows too dense, bump line height, keep monospace for code only", "text", "Notion", 9,
     [("design critique notes palette", "kw"), ("feedback on the picker's spacing", "para")]),
    ("Customer quote: \"Yank is the first clipboard manager I didn't uninstall after a week\"", "text", "Mail", 35,
     [("customer testimonial", "para"), ("user quote about not uninstalling", "kw")]),
    ("Q3 metrics: 4,812 weekly actives, 31% week-4 retention, 212 paid seats", "text", "Notion", 20,
     [("q3 metrics weekly actives", "kw"), ("how many people used the app each week last quarter", "para")]),
    ("Board update draft: runway 19 months, burn $61k/mo, hiring 1 designer", "text", "Notes", 28,
     [("board update runway", "kw"), ("how long our cash lasts", "para")]),
    ("Pricing: Free (500 clips), Pro $4/mo (unlimited + sync), Team $8/seat", "text", "Notes", 50,
     [("pricing tiers", "kw"), ("how much the paid plan costs", "para")]),
    ("Changelog 0.7.62: start minimized flag, Wayland shortcut hint, Linux paste fallback", "text", "GitHub", 10,
     [("changelog 0.7.62", "kw"), ("what shipped in the last version", "para")]),
    ("Support reply: To reset, quit Yank, delete ~/Library/Application Support/com.yank.app and relaunch", "text", "Mail", 17,
     [("support reply reset instructions", "kw"), ("how I told a user to wipe their data", "para")]),
    ("Bug report from Lena: images over 20MB freeze the palette on Intel Macs", "text", "Mail", 3,
     [("bug report lena", "kw"), ("someone said big pictures lock up the picker on older macs", "para")]),
    ("Meeting notes w/ TypeSafe: Jev pricing $0.042/Mtok, 1200 rpm, ask about on-prem", "text", "Notes", 11,
     [("typesafe meeting notes", "kw"), ("what the jev folks told me about cost", "para")]),
    ("Launch checklist: screenshots, PH copy, HN post at 8am PT, email list, tweet thread", "text", "Notion", 60,
     [("launch checklist", "short"), ("things to do before going public", "para")]),
    ("Blog post outline: why clipboard search needs embeddings, not just keywords", "text", "Notes", 22,
     [("blog outline embeddings", "kw"), ("draft plan for my writing on search by meaning", "para")]),
    ("Tweet draft: shipped local semantic search in Yank — type what you meant, not what you copied", "text", "Notes", 21,
     [("tweet draft semantic search", "kw"), ("announcement post I wrote for x", "para")]),

    # ---- personal ------------------------------------------------------------
    ("Neha's flight lands 6:40pm at T2, AI 104 from Delhi", "text", "Messages", 2,
     [("neha flight arrival", "kw"), ("when my sister's plane gets in", "vague"), ("pickup at the airport terminal time", "para")]),
    ("Parking: Level 3, spot C-117, near the elevator", "text", "Notes", 0,
     [("where I parked", "para"), ("parking spot", "short")]),
    ("Car service due at 45,000 miles — Honda dealer on Van Ness, (415) 555-0107", "text", "Notes", 70,
     [("car service honda", "kw"), ("when the vehicle needs maintenance", "para")]),
    ("Plumber Mike: (650) 555-0144, fixed the kitchen sink, $180 cash", "phone", "Contacts", 95,
     [("plumber number", "kw"), ("the guy who repaired the leaky faucet", "para")]),
    ("Landlord Mr. Okafor: okafor.properties@gmail.com", "email", "Contacts", 110,
     [("landlord email", "kw"), ("how to reach the apartment owner", "para")]),
    ("Electrician quote: rewire panel $2,400, 2 days, can start Oct 6", "text", "Mail", 20,
     [("electrician quote", "short"), ("estimate for fixing the breaker box", "para")]),
    ("Wedding RSVP: Arjun & Meera, Nov 23, reply by Oct 15, plus-one yes", "text", "Mail", 18,
     [("wedding rsvp", "short"), ("arjun's marriage invite reply deadline", "kw")]),
    ("Gift for Meera & Arjun: Le Creuset dutch oven, registry at Crate & Barrel", "text", "Notes", 16,
     [("wedding gift registry", "para"), ("le creuset", "short")]),
    ("Dad's medication: Metformin 500mg twice daily, Lisinopril 10mg morning", "text", "Notes", 45,
     [("dad's medication list", "kw"), ("what pills my father takes", "para")]),
    ("Mom's new number: +91 98200 55123", "phone", "Messages", 12,
     [("mom's new number", "kw"), ("my mother's updated mobile", "para")]),
    ("Riya's address: 12B Palm Grove, Bandra West, Mumbai 400050", "address", "Messages", 33,
     [("riya's address", "kw"), ("where my cousin lives in mumbai", "vague")]),
    ("Home address: 1845 Hayes St, Apt 4, San Francisco, CA 94117", "address", "Notes", 300,
     [("my home address", "kw"), ("where I live", "para")]),
    ("Office: 500 Howard St, 3rd floor, San Francisco, CA 94105", "address", "Notes", 150,
     [("office address", "kw"), ("where work is located", "para")]),
    ("Kid's shoe size: 11C, wide", "text", "Notes", 40,
     [("kid shoe size", "kw"), ("what size sneakers my child wears", "para")]),
    ("Soccer practice moved to Saturday 9am, Field 4 at Golden Gate Park", "text", "Messages", 3,
     [("soccer practice time", "kw"), ("when the football training is this weekend", "para")]),
    ("Doorman code for building: #4471", "number", "Notes", 150,
     [("building entry code", "kw"), ("front door keypad number", "para")]),
    ("Bike lock combo 3-9-1-4", "text", "Notes", 200,
     [("bike lock combo", "kw"), ("the numbers for my cycle padlock", "para")]),
    ("Guest WiFi: AcmeGuest / welcome2026", "text", "Slack", 30,
     [("office guest wifi", "kw"), ("internet login for visitors at work", "para")]),
    ("Netflix login: family@piyushmail.com / (shared, ask Neha)", "text", "Notes", 90,
     [("netflix login", "kw"), ("streaming account credentials", "para")]),
    ("Birthday: Neha — March 3; Riya — July 19; Arjun — Dec 1", "text", "Notes", 250,
     [("birthdays list", "kw"), ("when my cousins and sister were born", "para")]),

    # ---- travel -------------------------------------------------------------
    ("Air India AI 173 SFO→BOM, Dec 20, 11:05pm, PNR K7Q2ZB, seat 32A", "text", "Mail", 40,
     [("flight to mumbai pnr", "kw"), ("booking reference for the trip home to india", "para")]),
    ("Hotel Okura Tokyo, check-in Apr 3, conf #OK-448213", "text", "Mail", 60,
     [("tokyo hotel confirmation", "kw"), ("where I'm staying in japan's capital", "para")]),
    ("JR Pass exchange order: 7-day ordinary, voucher 88213440", "text", "Mail", 61,
     [("jr pass voucher", "kw"), ("japan rail ticket code", "para")]),
    ("Global Entry interview: Oct 9 at SFO Terminal 1, 2:15pm", "text", "Mail", 22,
     [("global entry interview", "kw"), ("appointment for trusted traveler at the airport", "para")]),
    ("Uber receipt: $47.20, SFO to Hayes Valley, Sep 12", "text", "Mail", 17,
     [("uber receipt airport", "kw"), ("ride home cost from the terminal", "para")]),
    ("Packing: adapter type G, charger, melatonin, passport, sunscreen", "text", "Notes", 44,
     [("packing list", "short"), ("things to bring on the trip", "para")]),
    ("Lake Tahoe cabin: 3 nights, code 5512 for lockbox, check-out 10am", "text", "Messages", 27,
     [("tahoe cabin lockbox", "kw"), ("key box digits for the mountain rental", "para")]),
    ("Ferry to Sausalito: 10:40am from Pier 41, $15.50 each", "text", "Notes", 13,
     [("sausalito ferry time", "kw"), ("boat across the bay departure", "para")]),

    # ---- shopping / finance ----------------------------------------------
    ("AppleCare+ agreement #9001823341 for MacBook Pro M5", "text", "Mail", 55,
     [("applecare number", "kw"), ("warranty for my laptop", "para")]),
    ("MacBook serial: C02FX1ABQ6L4", "text", "Notes", 55,
     [("macbook serial", "kw"), ("my computer's hardware id", "para")]),
    ("Return label UPS 1Z999AA10123456784 — drop off by Sep 30", "text", "Mail", 4,
     [("ups return label", "kw"), ("the shipping code for sending the item back", "para")]),
    ("IKEA order 1409887612, delivery window Tue 8am–12pm", "text", "Mail", 7,
     [("ikea delivery", "kw"), ("when the furniture is arriving", "para")]),
    ("Standing desk: Uplift V2, 60x30, bamboo top, $749", "text", "Notes", 30,
     [("standing desk price", "kw"), ("adjustable height table I want", "para")]),
    ("Keyboard: Keychron Q1 Max, Gateron Jupiter brown, $219", "text", "Chrome", 12,
     [("mechanical keyboard", "para"), ("keychron", "short")]),
    ("Monitor arm: Ergotron LX, VESA 100, fits up to 34\"", "text", "Chrome", 12,
     [("monitor arm", "short"), ("mount to hold my display", "para")]),
    ("Venmo from Arjun: $62.50 for dinner at Nopa", "text", "Messages", 9,
     [("venmo arjun dinner", "kw"), ("money my friend paid back for the meal", "para")]),
    ("Splitwise: you owe Neha $140 (Tahoe groceries + gas)", "text", "Messages", 26,
     [("splitwise owe neha", "kw"), ("how much I need to pay my sister back for the trip", "para")]),
    ("Credit card statement closes on the 23rd, autopay from Chase checking", "text", "Notes", 80,
     [("credit card statement date", "kw"), ("when my card billing cycle ends", "para")]),
    ("HSA balance: $3,412.08 as of Aug 31", "text", "Mail", 30,
     [("hsa balance", "kw"), ("health savings account money", "para")]),
    ("Estimated tax Q3 payment: $4,200 due Sep 15, IRS Direct Pay confirmation 30918823", "text", "Mail", 14,
     [("estimated tax payment confirmation", "kw"), ("quarterly payment to the irs", "para")]),
    ("W-9 info: Piyush Pradhan, LLC EIN 88-1234567", "text", "Notes", 120,
     [("ein number", "kw"), ("tax id for my company", "para")]),
    ("IBAN: DE89 3704 0044 0532 0130 00 (for Berlin client invoice)", "text", "Mail", 45,
     [("iban berlin client", "kw"), ("international bank account for the german customer", "para")]),
    ("Invoice INV-20931: 42 hours @ $150 = $6,300, net 15", "text", "Notes", 14,
     [("invoice amount hours", "kw"), ("how much I billed for contract work", "para")]),
    ("Gym membership: Equinox, $260/mo, cancel with 30 days notice", "text", "Notes", 160,
     [("gym membership cost", "kw"), ("fitness club monthly fee", "para")]),

    # ---- health / life ----------------------------------------------------
    ("Eye prescription: OD -2.25 -0.50 x 180, OS -2.00, PD 63", "text", "Notes", 200,
     [("eye prescription", "kw"), ("my glasses lens numbers", "para")]),
    ("Blood test: LDL 128, HDL 52, A1C 5.4, vitamin D 24 (low)", "text", "Notes", 50,
     [("blood test results cholesterol", "kw"), ("lab numbers from the checkup", "para")]),
    ("Physio exercises: clamshells 3x15, glute bridge 3x12, dead bug 3x10", "text", "Notes", 30,
     [("physio exercises", "kw"), ("rehab routine for my back", "vague")]),
    ("Running plan: 5k easy Tue, intervals Thu 6x800m, long run Sun 14k", "text", "Notes", 12,
     [("running plan", "kw"), ("weekly jogging schedule", "para")]),
    ("Meal prep: chickpea curry, 4 portions, 520 kcal each", "text", "Notes", 6,
     [("meal prep curry", "kw"), ("food I cooked for the week", "para")]),
    ("Dal tadka: 1 cup toor dal, turmeric, ghee, cumin, garlic, 2 dried chilies", "text", "Notes", 35,
     [("dal recipe", "kw"), ("how to make lentil soup with tempering", "para")]),
    ("Pancakes: 1.5 cups flour, 3.5 tsp baking powder, 1 tbsp sugar, 1.25 cups milk, 1 egg", "text", "Notes", 90,
     [("pancake recipe", "kw"), ("fluffy breakfast griddle cakes", "para")]),
    ("Therapy homework: write 3 things that went well each night", "text", "Notes", 20,
     [("therapy homework", "kw"), ("gratitude exercise my counselor gave", "para")]),

    # ---- misc / learning ---------------------------------------------------
    ("Big-O cheat: heap push/pop O(log n), hashmap get O(1) avg, sort O(n log n)", "text", "Notes", 25,
     [("big o cheat sheet", "kw"), ("time complexity of common data structures", "para")]),
    ("Two pointers template: while l < r: if a[l]+a[r] < t: l += 1 else: r -= 1", "code", "Notes", 8,
     [("two pointers template", "kw"), ("pattern for sorted pair sum problems", "para")]),
    ("Dijkstra: pq = [(0, src)]; while pq: d, u = heappop(pq); if d > dist[u]: continue", "code", "Notes", 7,
     [("dijkstra", "short"), ("shortest path with a priority queue", "para")]),
    ("Japanese: 大丈夫 (daijoubu) = it's okay / I'm fine", "text", "Notes", 70,
     [("daijoubu meaning", "kw"), ("japanese word for i'm fine", "para")]),
    ("Hindi: jugaad = frugal improvised fix", "text", "Notes", 150,
     [("jugaad", "short"), ("indian word for a hacky workaround", "para")]),
    ("Paul Graham: \"Make something people want.\"", "text", "Notes", 300,
     [("paul graham quote", "kw"), ("startup advice to build what users desire", "para")]),
    ("Idea: menu bar app that snoozes Slack notifications during focus blocks", "text", "Notes", 44,
     [("app idea slack snooze", "kw"), ("side project to silence chat pings while concentrating", "para")]),
    ("Idea: clipboard items auto-expire if they look like passwords or OTPs", "text", "Notes", 15,
     [("idea auto expire passwords", "kw"), ("feature so sensitive copies disappear", "para")]),
    ("Book notes — Deep Work: schedule shallow work, embrace boredom, quit social media", "text", "Notes", 100,
     [("deep work notes", "kw"), ("takeaways from cal newport's focus book", "para")]),
    ("Podcast: Lex Fridman #452 with Dario Amodei, 5h 22m", "text", "Notes", 60,
     [("lex fridman dario", "kw"), ("long interview with the anthropic ceo", "para")]),
    ("Chess opening: Italian Game — 1.e4 e5 2.Nf3 Nc6 3.Bc4", "text", "Notes", 130,
     [("italian game opening", "kw"), ("the bishop to c4 chess start", "para")]),
    ("Guitar chords for Wonderwall: Em7 G Dsus4 A7sus4, capo 2", "text", "Notes", 180,
     [("wonderwall chords", "kw"), ("oasis song fingering on guitar", "para")]),
    ("Motorcycle: Royal Enfield Himalayan 450, chain lube every 500km", "text", "Notes", 75,
     [("motorcycle chain lube", "kw"), ("how often to oil the bike drive", "para")]),
    ("Tire pressure: front 32 psi, rear 36 psi (with pillion)", "text", "Notes", 75,
     [("tire pressure", "short"), ("how much air in the wheels", "para")]),
]


# --------------------------------------------------------------------------
# 3. Noise
# --------------------------------------------------------------------------

FIRST = ["alex", "sam", "jordan", "taylor", "casey", "morgan", "jamie", "riley", "quinn", "drew", "blake", "reese", "kai", "noor", "omar", "li", "wei", "chen", "sofia", "lucas"]
LAST = ["nguyen", "garcia", "smith", "kim", "patel", "lopez", "brown", "martin", "silva", "khan", "ito", "novak", "haas", "dubois"]
CHAT = [
    "sounds good, see you then", "lgtm 👍", "can you take a look when you get a sec?", "thanks!", "haha yes",
    "on my way", "running 5 min late", "ok cool", "will do", "sure, that works", "did you see this?",
    "ping me after lunch", "let's sync tomorrow", "+1", "nice work", "ack", "np", "sgtm", "brb",
    "I'll circle back on this", "merged", "rebased, ptal", "can we move this to next week?", "done ✅",
    "no worries at all", "good morning!", "happy friday", "which one?", "yep", "makes sense",
]
WORDS = "alpha beta gamma delta sprint ticket build cache config token layer panel modal field widget router queue batch shard node cluster pixel frame buffer vector matrix".split()
CMDS = ["ls -la", "cd ..", "npm run dev", "npm install", "cargo build", "cargo test", "git status", "git pull", "git diff", "yarn",
        "pnpm i", "make", "clear", "code .", "pwd", "history | tail", "npm run lint", "cargo fmt", "git add -p", "exit"]
TLD = ["com", "io", "dev", "org", "app"]


def noise(n=1500):
    out = []
    hexd = "0123456789abcdef"
    for i in range(n):
        k = RNG.randrange(14)
        days = RNG.randrange(0, 365)
        if k == 0:
            out.append((''.join(RNG.choice(hexd) for _ in range(40)), "text", "Terminal"))
        elif k == 1:
            u = ''.join(RNG.choice(hexd) for _ in range(32))
            out.append((f"{u[:8]}-{u[8:12]}-{u[12:16]}-{u[16:20]}-{u[20:]}", "text", "Terminal"))
        elif k == 2:
            lvl = RNG.choice(["INFO", "WARN", "DEBUG", "ERROR"])
            out.append((f"2026-{RNG.randint(1,9):02d}-{RNG.randint(1,28):02d}T{RNG.randint(0,23):02d}:{RNG.randint(0,59):02d}:11Z {lvl} "
                        f"req={''.join(RNG.choice(hexd) for _ in range(8))} path=/v1/{RNG.choice(WORDS)}/{RNG.randint(1,9999)} "
                        f"status={RNG.choice([200,200,201,204,400,404,500])} dur={RNG.randint(2,900)}ms", "text", "Terminal"))
        elif k == 3:
            out.append((RNG.choice(CHAT), "text", RNG.choice(["Slack", "Messages", "Discord"])))
        elif k == 4:
            out.append((f"{RNG.choice(CMDS)}", "code", "Terminal"))
        elif k == 5:
            host = f"{RNG.choice(WORDS)}{RNG.choice(WORDS)}.{RNG.choice(TLD)}"
            out.append((f"https://{host}/{RNG.choice(WORDS)}/{RNG.randint(100,99999)}", "url", "Chrome"))
        elif k == 6:
            out.append((f"https://github.com/{RNG.choice(FIRST)}{RNG.choice(LAST)}/{RNG.choice(WORDS)}-{RNG.choice(WORDS)}/pull/{RNG.randint(1,4000)}", "url", "Chrome"))
        elif k == 7:
            out.append((f"+1 ({RNG.randint(200,989)}) 555-{RNG.randint(0,9999):04d}", "phone", "Messages"))
        elif k == 8:
            out.append((f"{RNG.choice(FIRST)}.{RNG.choice(LAST)}@{RNG.choice(['gmail.com','outlook.com','fastmail.com','proton.me'])}", "email", "Mail"))
        elif k == 9:
            out.append((f"{{\"id\": {RNG.randint(1,99999)}, \"{RNG.choice(WORDS)}\": \"{RNG.choice(WORDS)}\", \"ok\": {RNG.choice(['true','false'])}}}", "code", "Chrome"))
        elif k == 10:
            out.append((f"#{''.join(RNG.choice(hexd) for _ in range(6))}", "color", "Figma"))
        elif k == 11:
            out.append((f"{RNG.randint(10000,999999999)}", "number", RNG.choice(["Chrome", "Mail", "Notes"])))
        elif k == 12:
            out.append((f"~/projects/{RNG.choice(WORDS)}/src/{RNG.choice(WORDS)}/{RNG.choice(WORDS)}.{RNG.choice(['ts','rs','py','go','tsx'])}", "path", "VSCode"))
        else:
            out.append((f"const {RNG.choice(WORDS)}{RNG.choice(WORDS).title()} = {RNG.choice(['null','[]','{}','0','true'])};", "code", "VSCode"))
        out[-1] = {"content": out[-1][0], "category": out[-1][1], "label": None, "source": out[-1][2], "days_ago": days}
    return out


def main():
    items, queries = legacy()
    for content, cat, src, days, qs in T:
        idx = len(items)
        items.append({"content": content, "category": cat, "label": None, "source": src, "days_ago": days})
        for q, kind in qs:
            queries.append({"q": q, "relevant": [idx], "kind": kind})
    items += noise()
    (HERE / "dataset.json").write_text(json.dumps({"items": items, "queries": queries}, ensure_ascii=False, indent=0))
    kinds = {}
    for q in queries:
        kinds[q["kind"]] = kinds.get(q["kind"], 0) + 1
    print(f"{len(items)} items, {len(queries)} queries {kinds}")


if __name__ == "__main__":
    main()

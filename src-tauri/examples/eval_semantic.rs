//! Self-contained evaluation harness for Yank's Jev semantic search.
//!
//! Run with:
//!   cd src-tauri && TYPESAFE_API_KEY=... cargo run --example eval_semantic --release
//!
//! What it does:
//! 1. Seeds a fresh SQLite database in `$TMPDIR/yank_eval/eval.db` with the
//!    same synthetic clipboard items the old embedding harness used.
//! 2. Runs every query through two retrieval strategies:
//!      - BM25-only (FTS5 baseline — the fast-search step, no re-ranking)
//!      - Jev re-rank (BM25 shortlist, then one batched TypeSafe noul call)
//! 3. Measures P@1 / P@5 / P@10 / MRR for both, plus Jev per-query latency.
//! 4. Writes a Chart.js HTML report at `$TMPDIR/yank_eval/eval_report.html`.
//!
//! If `TYPESAFE_API_KEY` is unset, the Jev strategy is skipped and only the
//! BM25 baseline is reported.

use std::collections::HashSet;
use std::time::Instant;

use chrono::Local;
use rusqlite::{params, Connection};
use serde::Serialize;

use yank_lib::db;
use yank_lib::jev;
use yank_lib::query_intent;
use yank_lib::query_time;

const MODEL: &str = "jev-latest";
const TOP_K: usize = 10;
const SHORTLIST: usize = 50;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Sample {
    content: &'static str,
    category: &'static str,
    label: Option<&'static str>,
    source: &'static str,
    days_ago: i64,
}

const fn s(
    content: &'static str,
    category: &'static str,
    label: Option<&'static str>,
    source: &'static str,
    days_ago: i64,
) -> Sample {
    Sample { content, category, label, source, days_ago }
}

fn samples() -> Vec<Sample> {
    vec![
        // --- Personal (0..=24) ---------------------------------------------
        s("Mom's birthday: October 14th",                                                   "text",    None,                                   "Notes",     30),
        s("Dad's address: 248 Maple Street, Burlington, VT 05401",                          "address", Some("Dad's mailing address"),          "Notes",     45),
        s("Aunt Susan: +1 (802) 555-3287",                                                  "phone",   Some("Aunt Susan's number"),            "Contacts",  60),
        s("rachel.thompson@yahoo.com",                                                      "email",   None,                                   "Contacts",  12),
        s("Grandma's chocolate chip cookies: 2 1/4 cups flour, 1 tsp baking soda, 1 cup brown sugar, 2 eggs, 12oz choc chips", "text", Some("Grandma's chocolate chip cookie recipe"), "Notes", 90),
        s("Christmas gift idea for Tom: noise-cancelling headphones",                       "text",    None,                                   "Notes",      5),
        s("Babysitter Emma: (415) 555-9921",                                                "phone",   Some("Babysitter Emma's number"),       "Notes",     21),
        s("Vet appointment for Biscuit: Nov 18, 3pm",                                       "text",    None,                                   "Calendar",   8),
        s("Spouse's blood type: O negative",                                                "text",    None,                                   "Notes",    120),
        s("House WiFi password: BlueMountain2019!",                                         "text",    Some("Home WiFi password"),             "Notes",      7),
        s("Anniversary dinner reservation: Le Bernardin, 7:30pm Saturday",                  "text",    None,                                   "Email",      4),
        s("Kids' school pickup time: 3:15pm",                                               "text",    None,                                   "Notes",     60),
        s("Pediatrician: Dr. Lisa Chen, (212) 555-0188",                                    "phone",   Some("Pediatrician phone"),             "Contacts",  40),
        s("Insurance policy number: POL-2024-44872",                                        "text",    Some("Home insurance policy #"),        "Mail",      30),
        s("Garage door code: 7821",                                                         "number",  Some("Garage door code"),               "Notes",    200),
        s("Costco membership #: 111888299231",                                              "number",  Some("Costco membership"),              "Wallet",   365),
        s("Grocery list: milk, eggs, bread, spinach, chicken thighs, olive oil",            "text",    Some("This week's grocery list"),       "Notes",      1),
        s("Birthday party venue: Pizza Palace, 142 Main St",                                "text",    None,                                   "Notes",     14),
        s("Book club meets every other Tuesday at 7pm",                                     "text",    None,                                   "Notes",     70),
        s("Dentist follow-up scheduled for Jan 8",                                          "text",    None,                                   "Calendar",  35),
        s("Locker combination at gym: 24-12-36",                                            "text",    Some("Gym locker combo"),               "Notes",    100),
        s("License plate: 7BVH239",                                                         "text",    Some("My license plate"),               "Notes",    180),
        s("Library card number: 30087654321",                                               "number",  Some("Library card"),                   "Wallet",   250),
        s("Apartment lease ends March 31, 2027",                                            "text",    None,                                   "Notes",     50),
        s("Emergency contact: Kate (mom), (508) 555-1234",                                  "phone",   Some("Mom emergency contact"),          "Contacts", 730),

        // --- Travel (25..=36) ----------------------------------------------
        s("United flight UA2347 to LAX, June 22, departs 8:55am",                           "text",    Some("Flight UA2347 to LAX"),           "Email",     15),
        s("Marriott Times Square confirmation: M37281234",                                  "text",    Some("Marriott NYC reservation"),       "Email",     18),
        s("Rental car: Hertz, pickup at LAX terminal, June 22 11am",                        "text",    Some("Hertz LAX rental"),               "Email",     18),
        s("Eurostar London to Paris, 9:13am, coach 14, seat 67A",                           "text",    Some("Eurostar booking"),               "Email",     25),
        s("Currency: 1 USD = 0.92 EUR (June 2026)",                                         "text",    Some("USD to EUR rate"),                "Notes",      6),
        s("Airbnb in Lisbon: 47 Rua do Comercio, Apt 3B",                                   "address", Some("Lisbon airbnb address"),          "Email",     22),
        s("TSA PreCheck KTN: TT34998812",                                                   "text",    Some("TSA PreCheck number"),            "Wallet",   400),
        s("Passport expires Aug 15, 2031",                                                  "text",    Some("Passport expiration"),            "Notes",    600),
        s("Visa interview Aug 4, US Embassy Bangkok, 10am",                                 "text",    None,                                   "Email",     30),
        s("Boarding pass for SFO->JFK Saturday: gate B14, seat 18F",                        "text",    Some("Saturday boarding pass"),         "Wallet",     6),
        s("Travel insurance: Allianz, policy GTI-998273-A",                                 "text",    Some("Allianz travel insurance"),       "Email",     11),
        s("Kyoto must-see: Fushimi Inari, Pontocho Alley, Nishiki Market, Kinkaku-ji",      "text",    Some("Kyoto travel notes"),             "Notes",     40),

        // --- Shopping (37..=51) --------------------------------------------
        s("Amazon order #112-9876543-2233190",                                              "text",    Some("Amazon order #"),                 "Email",      3),
        s("FedEx tracking: 7740 8392 1455",                                                 "number",  Some("FedEx tracking"),                 "Email",      2),
        s("Wishlist: Sony WH-1000XM5, Kindle Paperwhite, blue throw pillows",               "text",    Some("Holiday wishlist"),               "Notes",     15),
        s("$249.99 - KitchenAid stand mixer, artisan tilt-head",                            "text",    Some("KitchenAid mixer price"),         "Notes",      9),
        s("Discount code FALL2025 - 20% off at j.crew.com",                                 "text",    Some("J.Crew discount code"),           "Email",     11),
        s("Etsy seller PaperGoods - wedding invitations $4.50 each",                        "text",    Some("Etsy wedding invites"),           "Notes",     33),
        s("https://www.warbyparker.com/eyeglasses/men/durand",                              "url",     Some("Warby Parker Durand frames"),     "Chrome",     2),
        s("Best Buy receipt #002-887-1234, $1,299 for 65 inch TV",                          "text",    Some("Best Buy TV receipt"),            "Email",     21),
        s("Costco return policy: 90 days for electronics",                                  "text",    Some("Costco return policy"),           "Notes",     60),
        s("Trader Joe's mango sticky rice - restocked Tuesdays",                            "text",    None,                                   "Notes",      7),
        s("REI dividend balance: $84.32",                                                   "text",    Some("REI dividend"),                   "Email",     14),
        s("AliExpress: bamboo bath mat, $12.43, est. delivery May 28",                      "text",    None,                                   "Email",     19),
        s("Shoe size reference: US 10 = EU 43 = UK 9",                                      "text",    Some("Shoe size conversion"),           "Notes",     80),
        s("Buy Nothing group: ironing board pickup at 14 Oak St, after 5pm",                "text",    None,                                   "Messages",   1),
        s("Subscription cancel: Spotify Family, before May 15",                             "text",    None,                                   "Notes",      5),

        // --- Finance (52..=61) ---------------------------------------------
        s("Chase routing: 021000021",                                                       "number",  Some("Chase routing number"),           "Notes",    200),
        s("Account ****1247, last balance $14,328.55",                                      "text",    Some("Checking balance"),               "Notes",      1),
        s("401k contribution: 12% pre-tax, 3% Roth, employer match 6%",                     "text",    Some("401k contribution split"),        "Notes",     90),
        s("Venmo handle: @sarah-mitchell-3",                                                "text",    Some("Venmo handle"),                   "Notes",     50),
        s("PayPal transaction ID: 7H912834BA993820L",                                       "text",    Some("PayPal transaction"),             "Email",      4),
        s("Tax filing deadline 2026: April 15",                                             "text",    Some("Tax filing deadline"),            "Notes",     75),
        s("Coinbase ETH wallet: 0x742d35Cc6634C0532925a3b8D86c1c3",                         "text",    Some("ETH wallet address"),             "Notes",    130),
        s("Mortgage rate locked at 6.125% for 30y",                                         "text",    Some("Mortgage rate locked"),           "Email",     28),
        s("Rent due 1st of month, $2,850 - Zelle to landlord",                              "text",    Some("Monthly rent amount"),            "Notes",     60),
        s("Roth IRA balance check: Vanguard, last contribution Mar 12",                     "text",    None,                                   "Notes",     85),

        // --- Entertainment (62..=76) ---------------------------------------
        s("Movie: The Brutalist (2024) - A24, 215 min, Brady Corbet",                       "text",    Some("The Brutalist (2024)"),           "Notes",     30),
        s("Song lyric: I've been a fool, I've been blind",                                  "text",    None,                                   "Notes",      9),
        s("Podcast: Acquired episode on TSMC, 4h 22m",                                      "text",    Some("Acquired TSMC podcast"),          "Notes",     10),
        s("Book to read: The Anxious Generation by Jonathan Haidt",                         "text",    Some("Book: Anxious Generation"),       "Notes",     22),
        s("Concert tickets: Phoebe Bridgers, MSG, Aug 14, sec 105",                         "text",    Some("Phoebe Bridgers concert"),        "Email",     17),
        s("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",                       "url",     Some("Roadtrip 2026 playlist"),         "Spotify",    4),
        s("Letterboxd watchlist: Past Lives, Aftersun, Tar, Anatomy of a Fall",             "text",    Some("Letterboxd watchlist"),           "Notes",     12),
        s("Netflix queue: Ripley, Baby Reindeer, The Diplomat S2",                          "text",    Some("Netflix queue"),                  "Notes",      6),
        s("Album rec: A Light for Attracting Attention - The Smile",                        "text",    None,                                   "Messages",  18),
        s("Movie quote: Get busy living or get busy dying.",                                "text",    None,                                   "Notes",    200),
        s("TV show: Severance Season 2 - 10 episodes, dropping Jan 17",                     "text",    Some("Severance S2 release"),           "Notes",     45),
        s("Steam wishlist: Outer Wilds, Disco Elysium, Hades II, Pentiment",                "text",    Some("Steam wishlist"),                 "Notes",     90),
        s("https://www.youtube.com/@MarkRober",                                             "url",     Some("Mark Rober YouTube"),             "Chrome",    35),
        s("Stand-up special: Hannah Gadsby - Something Special",                            "text",    None,                                   "Notes",     60),
        s("https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh",                          "url",     Some("Spotify track"),                  "Spotify",    8),

        // --- Education (77..=84) -------------------------------------------
        s("Definition: umami = pleasant savory taste, fifth basic taste",                   "text",    Some("Umami definition"),               "Notes",     50),
        s("Quote - Marcus Aurelius: You have power over your mind, not outside events.",    "text",    Some("Marcus Aurelius quote"),          "Notes",     70),
        s("Photosynthesis equation: 6CO2 + 6H2O -> C6H12O6 + 6O2",                          "text",    Some("Photosynthesis equation"),        "Notes",    100),
        s("French phrase: Je ne sais quoi - a certain something",                           "text",    Some("Je ne sais quoi"),                "Notes",     40),
        s("MCAT score 518 - 95th percentile",                                               "number",  Some("MCAT score"),                     "Notes",    365),
        s("Coursera ML course - Andrew Ng - enrolled, week 4",                              "text",    Some("Coursera ML course"),             "Notes",     28),
        s("Spanish vocab: aprovechar = to take advantage of",                               "text",    Some("Spanish: aprovechar"),            "Notes",     14),
        s("Constitution Article I Section 8 - Commerce Clause",                             "text",    Some("Commerce Clause reference"),      "Notes",    180),

        // --- Home & lifestyle (85..=94) ------------------------------------
        s("Recipe: shakshuka - 6 eggs, 28oz crushed tomatoes, paprika, cumin, onion",       "text",    Some("Shakshuka recipe"),               "Notes",     12),
        s("1 cup = 236.6 ml = 16 tbsp",                                                     "text",    Some("Cup to ml conversion"),           "Notes",     90),
        s("Oven temp: 425 F = 218 C",                                                       "text",    Some("Oven temp conversion"),           "Notes",     60),
        s("Air fryer salmon: 400 F, 10-12 min, skin side down",                             "text",    Some("Air fryer salmon"),               "Notes",      5),
        s("Plant care: monstera prefers indirect light, water every 7-10 days",             "text",    Some("Monstera plant care"),            "Notes",     30),
        s("HVAC filter size: 16x25x1, MERV 11",                                             "text",    Some("HVAC filter size"),               "Notes",    110),
        s("Coffee ratio: 1g coffee to 16g water (V60)",                                     "text",    Some("V60 coffee ratio"),               "Notes",    200),
        s("Sourdough starter: feed 1:1:1 ratio, room temp 75 F",                            "text",    Some("Sourdough starter feeding"),      "Notes",     40),
        s("Lawn care reminder: aerate in fall, overseed late September",                    "text",    None,                                   "Notes",    250),
        s("IKEA Kallax assembly: 2.5 hours, missed one cam-lock on the bottom",             "text",    None,                                   "Notes",    365),

        // --- Health (95..=102) ---------------------------------------------
        s("Prescription: Atorvastatin 20mg, once daily, renew Aug",                         "text",    Some("Atorvastatin prescription"),      "Notes",     25),
        s("Dr. Patel - primary care - (415) 555-0231",                                      "phone",   Some("Dr. Patel PCP"),                  "Contacts", 200),
        s("Allergy shot schedule: every Wednesday 8am, through January",                    "text",    Some("Allergy shot schedule"),          "Notes",     80),
        s("Annual physical: BP 118/76, HR 62, weight 168lbs",                               "text",    Some("Annual physical results"),        "Notes",     90),
        s("Pharmacy: CVS on Geary, fills ready in 2-3 hours",                               "text",    Some("CVS pharmacy"),                   "Notes",     50),
        s("Therapist: Dr. Kim, biweekly Thu 4pm",                                           "text",    Some("Therapist appointment"),          "Notes",    120),
        s("Symptoms log: morning headache, lasted ~2 hours, after coffee",                  "text",    Some("Headache symptoms log"),          "Notes",      3),
        s("Flu shot due in October at Walgreens",                                           "text",    Some("Flu shot reminder"),              "Notes",    365),

        // --- Work (non-dev) (103..=112) ------------------------------------
        s("Sales pipeline Q3: 14 qualified leads, $2.3M weighted",                          "text",    Some("Q3 sales pipeline"),              "Notes",     18),
        s("Marketing campaign brief due Thursday EOD",                                      "text",    Some("Marketing brief deadline"),       "Notes",      2),
        s("Quarterly review with Janet: Friday 2pm conf room B",                            "text",    Some("Q-review with Janet"),            "Calendar",   5),
        s("Expense report #ER-2026-0418, $1,247.83 for travel",                             "text",    Some("Travel expense report"),          "Email",     30),
        s("Salesforce account ID: 0014x00001A9zB2QAJ",                                      "text",    Some("Salesforce account ID"),          "Notes",     60),
        s("Vendor PO: ACME-Industries, terms net-30, due July 15",                          "text",    Some("ACME vendor PO"),                 "Email",     22),
        s("OKR draft: increase NRR from 112% to 118% by Q4",                                "text",    Some("Q4 NRR OKR"),                     "Notes",     45),
        s("Press release embargo: lift 9am ET Tuesday",                                     "text",    Some("Press release embargo"),          "Email",      8),
        s("Client onsite at Pfizer, NJ office, Aug 7-8",                                    "text",    None,                                   "Calendar",  11),
        s("LinkedIn message draft to Brian about VP role",                                  "text",    None,                                   "Notes",      4),

        // --- Dev carry-over (113..=127) ------------------------------------
        s("https://stripe.com/docs/webhooks/signatures",                                    "url",     Some("Stripe webhook signature docs"),  "Chrome",    12),
        s("stripe.webhooks.constructEvent(payload, sig, secret)",                           "code",    Some("Stripe webhook construct call"),  "VSCode",    12),
        s("useEffect(() => { return () => clearInterval(id); }, [id]);",                    "code",    Some("useEffect cleanup pattern"),      "VSCode",     2),
        s("export const API_URL = 'https://api.staging.acme.com/v2';",                      "code",    Some("Staging API URL constant"),       "VSCode",     7),
        s("git rebase -i HEAD~5",                                                           "code",    Some("Interactive rebase last 5"),      "Terminal",  11),
        s("SELECT * FROM users WHERE created_at > NOW() - INTERVAL '7 days';",              "code",    Some("Recent signups SQL query"),       "DataGrip",   4),
        s("/Users/me/projects/acme/api/middleware/auth.py",                                 "path",    Some("Auth middleware Python file"),    "Terminal",   3),
        s("kubectl rollout restart deployment/api",                                         "code",    Some("Restart API deployment"),         "Terminal",   7),
        s("docker compose -f docker-compose.dev.yml up --build",                            "code",    Some("Local docker stack"),             "Terminal",   1),
        s("https://github.com/anthropics/claude-code/issues/42",                            "url",     Some("Claude Code shell hooks issue"),  "Chrome",     6),
        s("https://github.com/piyushpradhan/yank",                                          "url",     Some("Yank repo on GitHub"),            "Chrome",     2),
        s("https://docs.anthropic.com/claude/docs/getting-started",                         "url",     Some("Anthropic Claude docs"),          "Chrome",     9),
        s("TODO: refactor the embedding queue to use tokio::spawn",                         "text",    Some("Embedding queue refactor todo"),  "Notes",      4),
        s("Q3 OKRs: ship auth, raise SLA to 99.95%, hire 2 engineers",                     "text",    Some("Q3 engineering OKRs"),            "Notes",     22),
        s("https://www.figma.com/file/abc/Design-System-v3",                                "url",     Some("Figma design system file"),       "Slack",      5),

        // --- Edge / known-tricky (128..=135) -------------------------------
        s("OTP: 482915",                                                                    "number",  None,                                   "Mail",       0),
        s("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc",                            "code",    Some("API JWT token"),                  "Postman",    2),
        s("#FF6B35",                                                                        "color",   Some("Brand orange hex"),               "Figma",     14),
        s("1600 Amphitheatre Parkway, Mountain View, CA 94043",                             "address", Some("Googleplex address"),             "Maps",      20),
        s("noreply@figma.com",                                                              "email",   None,                                   "Mail",       8),
        s("+1 (415) 555-0142",                                                              "phone",   Some("Sarah's mobile"),                 "Notes",     15),
        s("https://www.youtube.com/watch?v=dQw4w9WgXcQ",                                    "url",     Some("Never Gonna Give You Up"),        "Chrome",     1),
        s("remember to deploy by Friday before the freeze",                                 "text",    None,                                   "Notes",      0),
    ]
}

// ---------------------------------------------------------------------------
// Eval queries (with ground truth)
// ---------------------------------------------------------------------------

struct Q {
    q: &'static str,
    relevant: &'static [usize],
}

const fn q(q: &'static str, relevant: &'static [usize]) -> Q {
    Q { q, relevant }
}

fn queries() -> Vec<Q> {
    vec![
        q("mom's birthday",                           &[0]),
        q("dad's mailing address",                    &[1]),
        q("chocolate chip cookie recipe",             &[4]),
        q("WiFi password",                            &[9]),
        q("garage door code",                         &[14]),
        q("grocery list",                             &[16]),
        q("license plate",                            &[21]),
        q("anniversary dinner reservation",           &[10]),
        q("what did I save yesterday",                &[16, 50, 121, 134]),
        q("4 days ago",                               &[10, 56, 67, 112, 117, 125]),
        q("notes from a week ago",                    &[9, 46, 116, 120]),
        q("flight to LAX",                            &[25]),
        q("Marriott reservation in NYC",              &[26]),
        q("Lisbon airbnb",                            &[30]),
        q("passport expiration date",                 &[32]),
        q("USD to EUR conversion rate",               &[29]),
        q("amazon order number",                      &[37]),
        q("fedex tracking",                           &[38]),
        q("KitchenAid mixer price",                   &[40]),
        q("warby parker glasses link",                &[43]),
        q("J Crew discount code",                     &[41]),
        q("chase routing number",                     &[52]),
        q("paypal transaction id",                    &[56]),
        q("mortgage rate locked",                     &[59]),
        q("how much is rent",                         &[60]),
        q("Phoebe Bridgers tickets",                  &[66]),
        q("Severance season 2 release date",          &[72]),
        q("Acquired podcast TSMC",                    &[64]),
        q("Netflix queue",                            &[69]),
        q("photosynthesis equation",                  &[79]),
        q("marcus aurelius quote",                    &[78]),
        q("Je ne sais quoi meaning",                  &[80]),
        q("shakshuka recipe",                         &[85]),
        q("air fryer salmon time",                    &[88]),
        q("monstera plant care",                      &[89]),
        q("cup to ml conversion",                     &[86]),
        q("atorvastatin prescription",                &[95]),
        q("annual physical results",                  &[98]),
        q("primary care doctor phone",                &[96]),
        q("marketing brief deadline",                 &[104]),
        q("salesforce account id",                    &[107]),
        q("expense report",                           &[106]),
        q("the stripe webhook docs",                  &[113]),
        q("useEffect cleanup",                        &[115]),
        q("interactive git rebase",                   &[117]),
        q("kubernetes deployment restart",            &[120]),
        q("auth middleware Python",                   &[119]),
        q("the staging API URL",                      &[116]),
        q("OTP code today",                           &[128]),
        q("brand color hex",                          &[130]),
        q("addresses",                                &[1, 30, 131]),
        q("phone numbers",                            &[2, 6, 12, 24, 96, 133]),
        q("emails",                                   &[3, 132]),
        q("the link I copied yesterday",              &[134]),
        q("that recipe I saved",                      &[4, 85]),
        q("the phone number I had for the babysitter", &[6]),
    ]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn candidate_text(label: &str, content: &str, source: &str) -> String {
    const MAX: usize = 500;
    let mut parts: Vec<String> = Vec::with_capacity(3);
    if !label.is_empty() {
        parts.push(label.to_string());
    }
    let body: String = content.trim().chars().take(MAX).collect();
    if !body.is_empty() {
        parts.push(body);
    }
    if !source.is_empty() {
        parts.push(format!("(from {source})"));
    }
    parts.join("\n")
}

fn rank_of_first_relevant(results: &[i64], relevant: &HashSet<i64>) -> Option<usize> {
    results.iter().position(|id| relevant.contains(id)).map(|i| i + 1)
}

fn precision_at_k(results: &[i64], relevant: &HashSet<i64>, k: usize) -> f64 {
    let n_rel = results.iter().take(k).filter(|id| relevant.contains(id)).count();
    let denom = k.min(results.len()).max(1);
    n_rel as f64 / denom as f64
}

fn bm25_search(
    conn: &Connection,
    query: &str,
    limit: usize,
    time: Option<(i64, i64)>,
) -> rusqlite::Result<Vec<i64>> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
        .filter(|t| !t.is_empty())
        .map(|t| format!("{}*", t.replace('"', "\"\"")))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let (from, to) = time.unwrap_or((i64::MIN, i64::MAX));
    let fetch = |q: &str| -> rusqlite::Result<Vec<i64>> {
        let mut stmt = conn.prepare(
            "SELECT i.id FROM items_fts
             JOIN items i ON i.id = items_fts.rowid
             WHERE items_fts MATCH ?1 AND i.deleted = 0
               AND i.created_at BETWEEN ?2 AND ?3
             ORDER BY bm25(items_fts) LIMIT ?4",
        )?;
        let rows: Vec<i64> = stmt
            .query_map(params![q, from, to, limit as i64], |r| r.get::<_, i64>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    };

    let mut seen: HashSet<i64> = HashSet::new();
    let mut out: Vec<i64> = Vec::with_capacity(limit);
    if terms.len() >= 2 {
        let and_q = terms.join(" ");
        for id in fetch(&and_q)? {
            if seen.insert(id) {
                out.push(id);
            }
            if out.len() >= limit {
                return Ok(out);
            }
        }
    }
    let or_q = terms.join(" OR ");
    for id in fetch(&or_q)? {
        if seen.insert(id) {
            out.push(id);
        }
        if out.len() >= limit {
            break;
        }
    }
    Ok(out)
}

fn items_in_window(
    conn: &Connection,
    from: i64,
    to: i64,
    category: Option<&str>,
    limit: usize,
) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare(
        "SELECT id FROM items
         WHERE deleted = 0 AND created_at BETWEEN ?1 AND ?2
           AND (?3 IS NULL OR category = ?3)
         ORDER BY pinned DESC, created_at DESC LIMIT ?4",
    )?;
    let rows: Vec<i64> = stmt
        .query_map(params![from, to, category, limit as i64], |r| r.get::<_, i64>(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct StrategyMetrics {
    p_at_1: f64,
    p_at_5: f64,
    p_at_10: f64,
    mrr: f64,
}

#[derive(Serialize)]
struct QueryRow {
    q: String,
    residue: String,
    bm25_rank: Option<usize>,
    jev_rank: Option<usize>,
}

#[derive(Serialize)]
struct Report {
    n_items: usize,
    n_queries: usize,
    bm25: StrategyMetrics,
    jev: Option<StrategyMetrics>,
    avg_jev_latency_ms: Option<f64>,
    queries: Vec<QueryRow>,
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let work_dir = std::env::temp_dir().join("yank_eval");
    std::fs::create_dir_all(&work_dir)?;
    let db_path = work_dir.join("eval.db");
    let _ = std::fs::remove_file(&db_path);
    let conn = db::open(&db_path)?;

    let api_key = std::env::var("TYPESAFE_API_KEY").ok().unwrap_or_default();
    let run_jev = !api_key.trim().is_empty();
    if !run_jev {
        eprintln!("TYPESAFE_API_KEY not set — running BM25 baseline only.");
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let samples_v = samples();
    let now_ms = chrono::Utc::now().timestamp_millis();

    eprintln!("seeding {} items...", samples_v.len());

    // (id, label, content, source) needed to rebuild candidate text at query time.
    let mut item_ids: Vec<i64> = Vec::with_capacity(samples_v.len());
    let mut item_label: Vec<String> = Vec::with_capacity(samples_v.len());
    let mut item_content: Vec<String> = Vec::with_capacity(samples_v.len());
    let mut item_source: Vec<String> = Vec::with_capacity(samples_v.len());

    for sample in &samples_v {
        let created = now_ms - sample.days_ago * 86_400_000;
        let preview: String = sample.content.chars().take(60).collect();
        conn.execute(
            "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)",
            params![sample.content, sample.category, sample.label, preview, sample.source, created],
        )?;
        let id = conn.last_insert_rowid();
        item_ids.push(id);
        item_label.push(sample.label.unwrap_or("").to_string());
        item_content.push(sample.content.to_string());
        item_source.push(sample.source.to_string());
    }

    let queries_v = queries();
    eprintln!("running {} queries × 2 strategies...", queries_v.len());

    let mut bm25_p1 = 0.0;
    let mut bm25_p5 = 0.0;
    let mut bm25_p10 = 0.0;
    let mut bm25_mrr = 0.0;
    let mut jev_p1 = 0.0;
    let mut jev_p5 = 0.0;
    let mut jev_p10 = 0.0;
    let mut jev_mrr = 0.0;
    let mut jev_latency_total_ms = 0.0;

    let mut query_rows: Vec<QueryRow> = Vec::with_capacity(queries_v.len());

    for query in &queries_v {
        let relevant: HashSet<i64> = query.relevant.iter().map(|&i| item_ids[i]).collect();

        // Mirror production `search_semantic`: pull the date phrase, then
        // category/filler intent, leaving the residue Jev compares on.
        let parsed = query_time::parse(Local::now(), query.q);
        let time_bounds = parsed.time.as_ref().map(|t| (t.from_ms, t.to_ms));
        let intent = query_intent::parse(&parsed.semantic);
        let residue = intent.semantic.trim().to_string();
        let category = intent.category;

        let bm25_results = if residue.is_empty() {
            if let Some((from, to)) = time_bounds {
                items_in_window(&conn, from, to, category, TOP_K)?
            } else {
                Vec::new()
            }
        } else {
            bm25_search(&conn, &residue, TOP_K, time_bounds).unwrap_or_default()
        };

        let bm25_r = rank_of_first_relevant(&bm25_results, &relevant);
        bm25_p1 += precision_at_k(&bm25_results, &relevant, 1);
        bm25_p5 += precision_at_k(&bm25_results, &relevant, 5);
        bm25_p10 += precision_at_k(&bm25_results, &relevant, 10);
        bm25_mrr += bm25_r.map_or(0.0, |r| 1.0 / r as f64);

        // Jev re-rank over the BM25 shortlist (same candidate text the
        // production path hands Jev). Pure category/time queries skip Jev in
        // production and use the SQL window, so mirror that here.
        let mut jev_results: Option<Vec<i64>> = None;
        if run_jev {
            if residue.is_empty() {
                jev_results = Some(bm25_results.clone());
            } else {
                let shortlist: Vec<i64> =
                    bm25_search(&conn, &residue, SHORTLIST, time_bounds).unwrap_or_default();
                let cands: Vec<(String, String)> = shortlist
                    .iter()
                    .map(|&id| {
                        let idx = item_ids.iter().position(|&x| x == id).expect("known id");
                        (
                            id.to_string(),
                            candidate_text(
                                &item_label[idx],
                                &item_content[idx],
                                &item_source[idx],
                            ),
                        )
                    })
                    .collect();
                let started = Instant::now();
                let nouls = jev::rerank(&client, &api_key, MODEL, &residue, &cands).await?;
                jev_latency_total_ms += started.elapsed().as_secs_f64() * 1000.0;
                let mut scored: Vec<(f32, i64)> = shortlist
                    .into_iter()
                    .zip(nouls.into_iter())
                    .map(|(id, noul)| (noul, id))
                    .collect();
                scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
                jev_results = Some(scored.into_iter().take(TOP_K).map(|(_, id)| id).collect());
            }
        }

        let jev_r = jev_results
            .as_ref()
            .and_then(|r| rank_of_first_relevant(r, &relevant));
        if let Some(results) = &jev_results {
            jev_p1 += precision_at_k(results, &relevant, 1);
            jev_p5 += precision_at_k(results, &relevant, 5);
            jev_p10 += precision_at_k(results, &relevant, 10);
            jev_mrr += jev_r.map_or(0.0, |r| 1.0 / r as f64);
        }

        query_rows.push(QueryRow {
            q: query.q.to_string(),
            residue,
            bm25_rank: bm25_r,
            jev_rank: jev_r,
        });
    }

    let n = queries_v.len() as f64;
    let bm25_m = StrategyMetrics {
        p_at_1: bm25_p1 / n,
        p_at_5: bm25_p5 / n,
        p_at_10: bm25_p10 / n,
        mrr: bm25_mrr / n,
    };
    let jev_m = run_jev.then(|| StrategyMetrics {
        p_at_1: jev_p1 / n,
        p_at_5: jev_p5 / n,
        p_at_10: jev_p10 / n,
        mrr: jev_mrr / n,
    });
    let avg_latency = run_jev.then(|| jev_latency_total_ms / n);

    eprintln!();
    eprintln!("┌──────────────┬───────┬───────┬────────┬───────┐");
    eprintln!("│ strategy     │  P@1  │  P@5  │  P@10  │  MRR  │");
    eprintln!("├──────────────┼───────┼───────┼────────┼───────┤");
    eprintln!("│ BM25-only    │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", bm25_m.p_at_1, bm25_m.p_at_5, bm25_m.p_at_10, bm25_m.mrr);
    if let Some(j) = &jev_m {
        eprintln!("│ Jev re-rank  │ {:.3} │ {:.3} │  {:.3} │ {:.3} │", j.p_at_1, j.p_at_5, j.p_at_10, j.mrr);
    }
    eprintln!("└──────────────┴───────┴───────┴────────┴───────┘");
    if let Some(l) = avg_latency {
        eprintln!("avg Jev re-rank latency: {l:.0} ms/query");
    }

    let report = Report {
        n_items: samples_v.len(),
        n_queries: queries_v.len(),
        bm25: bm25_m,
        jev: jev_m,
        avg_jev_latency_ms: avg_latency,
        queries: query_rows,
    };
    let html = render_html(&report)?;
    let report_path = work_dir.join("eval_report.html");
    std::fs::write(&report_path, html)?;
    eprintln!("\nHTML report: {}", report_path.display());

    Ok(())
}

fn render_html(report: &Report) -> Result<String, Box<dyn std::error::Error>> {
    let data_json = serde_json::to_string(report)?;
    let rank_cell = |r: Option<usize>| -> String {
        match r {
            None => r#"<td class="rank-miss">—</td>"#.to_string(),
            Some(v) if v <= 3 => format!(r#"<td class="rank-good">{}</td>"#, v),
            Some(v) => format!(r#"<td class="rank-bad">{}</td>"#, v),
        }
    };
    let mut rows = String::new();
    for q in &report.queries {
        rows.push_str(&format!(
            "<tr><td><code>{}</code></td><td><code>{}</code></td>{}{}</tr>",
            html_escape(&q.q),
            html_escape(&q.residue),
            rank_cell(q.bm25_rank),
            rank_cell(q.jev_rank),
        ));
    }
    let jev_dataset = report
        .jev
        .as_ref()
        .map(|j| {
            format!(
                "{{ label: 'Jev re-rank', data: [{}, {}, {}, {}], backgroundColor: '#FF6B35' }}",
                j.p_at_1, j.p_at_5, j.p_at_10, j.mrr
            )
        })
        .unwrap_or_default();
    Ok(format!(
        r##"<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Yank · Semantic Search Evaluation (Jev)</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
  :root {{ --fg:#1a1a1a; --muted:#666; --border:#e6e6e6; --accent:#FF6B35; }}
  body {{ font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; padding: 32px; max-width: 1000px; margin: 0 auto; color: var(--fg); background: white; }}
  h1 {{ margin: 0 0 4px; font-size: 22px; }}
  .sub {{ color: var(--muted); margin-bottom: 28px; }}
  h2 {{ margin-top: 36px; font-size: 15px; border-bottom: 1px solid var(--border); padding-bottom: 6px; letter-spacing: .02em; text-transform: uppercase; color: #444; }}
  .card {{ background: #fafafa; border: 1px solid var(--border); border-radius: 10px; padding: 18px; max-width: 560px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 12.5px; }}
  th, td {{ padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }}
  th {{ background: #f4f4f4; font-weight: 600; color: #333; }}
  td.rank-good {{ color: #0a7e3f; font-weight: 700; text-align: center; }}
  td.rank-bad {{ color: #c33; text-align: center; }}
  td.rank-miss {{ color: #aaa; text-align: center; }}
  code {{ background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; font-family: "SF Mono", ui-monospace, monospace; }}
  .legend {{ font-size: 12px; color: var(--muted); margin: 8px 0 16px; }}
</style></head>
<body>
<h1>Yank · Semantic Search Evaluation (Jev)</h1>
<p class="sub">{n_items} items seeded · {n_queries} queries · Jev re-rank vs BM25 baseline · avg Jev latency {latency} ms</p>

<h2>Retrieval accuracy</h2>
<div class="card"><canvas id="precChart" height="240"></canvas></div>
<p class="legend">P@k = fraction of top-k that's relevant · MRR = mean reciprocal rank of first relevant hit (higher is better).</p>

<h2>Per-query rank of first relevant result</h2>
<p class="legend"><span style="color:#0a7e3f;font-weight:700">green</span> = top 3 · <span style="color:#c33">red</span> = ranked 4–10 · — = not found in top 10</p>
<table>
<thead><tr><th>query</th><th>residue → Jev</th><th>BM25</th><th>Jev</th></tr></thead>
<tbody>{rows}</tbody>
</table>

<script>
const D = {data_json};
new Chart(document.getElementById('precChart'), {{
  type: 'bar',
  data: {{
    labels: ['P@1', 'P@5', 'P@10', 'MRR'],
    datasets: [
      {{ label: 'BM25-only', data: [D.bm25.p_at_1, D.bm25.p_at_5, D.bm25.p_at_10, D.bm25.mrr], backgroundColor: '#bcbcbc' }},
      {jev_dataset},
    ]
  }},
  options: {{
    responsive: true,
    scales: {{ y: {{ min: 0, max: 1, ticks: {{ stepSize: 0.2 }} }} }},
    plugins: {{ legend: {{ position: 'bottom' }} }}
  }}
}});
</script>
</body></html>
"##,
        n_items = report.n_items,
        n_queries = report.n_queries,
        latency = report
            .avg_jev_latency_ms
            .map(|l| format!("{l:.0}"))
            .unwrap_or_else(|| "n/a".to_string()),
        rows = rows,
        jev_dataset = jev_dataset,
        data_json = data_json,
    ))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

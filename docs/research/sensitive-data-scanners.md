# Sensitive text detector research appendix

Research date: 2026-10-21. This appendix covers text recognizers; the companion clipboard research covers source metadata and capture ordering. Sources below are pinned where inspected. No product behavior changed, no real clipboard data was collected, and no empirical clipboard precision/recall rate has been established.

## Conclusions for Yank

- Use a local, bounded classifier before persistence. Strong signals are producer metadata, recognizable credential formats, private-key structure, and validated card candidates. Generic password classification cannot be reliable from text alone: the identical string can be a password or ordinary prose. This is an information limitation, not something a larger regex catalog fixes.
- Keep evidence separate: `format match`, `checksum passes`, `context present`, and `source marked sensitive` are useful reasons. A library's hardcoded confidence of `0.99` or `1.0` is not an independently measured detection probability.
- Borrow audited rules and validators rather than shipping an entire repository scanner or Python NLP runtime. A selected Gitleaks rule subset plus owned card/SSN recognizers is a plausible Rust implementation; this is a design recommendation pending a clipboard-specific benchmark.
- Do not use API verification to classify clipboard contents. It transmits candidate secrets and tests credentials against services; revoked or expired credentials can still be private. TruffleHog's GitHub verifier actually sends the candidate in the `Authorization` header to `/user`. [Verifier source](https://github.com/trufflesecurity/trufflehog/blob/e7a8d17d2f726cf414310a625b55cca7dc9c898e/pkg/detectors/github/v1/github_old.go#L151-L182)

## What the mature scanners do

### Presidio: useful architecture, upstream patterns need an audit

Microsoft-origin Presidio now resolves to `data-privacy-stack/presidio`. The inspected card recognizer starts at a pattern score of `0.3`, sanitizes ASCII spaces/hyphens, and checks Luhn. Its regex only permits first digits `4`, `5`, `6`, `1`, or `3`; its four groups total at most 17 digits. Therefore it misses Mastercard 2-series and 18/19-digit card numbers. [Card source, commit 4f0e236](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/presidio-analyzer/presidio_analyzer/predefined_recognizers/generic/credit_card_recognizer.py#L19-L82)

This is a real coverage issue: Mastercard documents the additional BIN range `222100–272099`, with cards first issued in 2017. [Mastercard FAQ](https://www.mastercard.us/en-us/frequently-asked-questions.html)

Presidio's generic pattern engine promotes successful validation to maximum score and invalidation to zero. Thus a card score of `1.0` means its regex and checksum passed, not that the number was confirmed to be an issued card. [Pattern engine](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/presidio-analyzer/presidio_analyzer/pattern_recognizer.py#L195-L280)

Its SSN recognizer assigns bare nine-digit strings `0.05`, standard separated forms `0.5`, and invalidates zero groups, `000`/`666` areas, repeated digits and selected sample numbers. At this commit it omits the required rejection of areas `900–999`. [SSN source](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/us/us_ssn_recognizer.py#L18-L88) SSA explicitly lists `000`, `666`, and the 900 series as impossible areas, along with group `00` and serial `0000`. [SSA POMS](https://secure.ssa.gov/poms.nsf/lnx/0110201035)

Presidio's context enhancer defaults to five preceding words, zero following words, a `+0.35` boost, and a `0.4` minimum when context matches. It can also accept caller-provided context. Default matching is substring based; `whole_word` mode avoids examples like a short context word matching inside an unrelated word. This design is worth adapting with explicit word/phrase boundaries and labels around the clipboard selection. [Context enhancer](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/presidio-analyzer/presidio_analyzer/context_aware_enhancers/lemma_context_aware_enhancer.py#L12-L220)

MIT licensed. The complete analyzer has Python, spaCy, NumPy and other dependencies; those are excessive for these deterministic recognizers in Yank's Rust capture path. [License](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/LICENSE), [dependencies](https://github.com/data-privacy-stack/presidio/blob/4f0e236e31a57767958a3eec2de3fc58dffc3034/presidio-analyzer/pyproject.toml)

### Gitleaks: good credential corpus, not an arbitrary-password detector

Its generic rule requires a secret-associated identifier, an assignment-like operator, a restricted candidate character set, and Shannon entropy `3.5`. It deliberately excludes alphabetic-only candidates and many misleading identifiers such as public/foreign keys and API version labels. A bare password lacks the required identifier; an alphabetic passphrase is excluded even in an assignment. [Generic rule](https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b/cmd/generate/config/rules/generic.go#L10-L121), [regex construction](https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b/cmd/generate/config/utils/generate.go#L13-L53)

Provider rules recognize much stronger evidence, e.g. GitHub's `ghp_` prefix with expected length and alphabet. These can work on the value alone. [GitHub rules](https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b/cmd/generate/config/rules/github.go#L19-L110)

MIT licensed, Go implementation, offline rule engine. Prefer a small reviewed rule subset over a Go sidecar; preserve attribution if copying. Current README says feature complete with future security patches only and points to Betterleaks. [License](https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b/LICENSE), [maintenance statement](https://github.com/gitleaks/gitleaks/blob/b58d3f102cf3a2c84cb7f923d05c25c9b1aed84b/README.md)

### detect-secrets: combine specific rules, entropy and keyword assignments

The entropy plugin normally requires quoted strings to reduce noise. Defaults are Base64 entropy `4.5` and hex entropy `3.0`; an eager mode exists for ad hoc unquoted scans. Numeric-only hex candidates receive a heuristic penalty. These are code-scanning defaults, not suitable clipboard guarantees. Mathematically, a string of at most 22 characters cannot exceed Shannon entropy `4.5` because its maximum is `log2(22) ≈ 4.459`. [Entropy source](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/detect_secrets/plugins/high_entropy_strings.py)

Its keyword detector finds low-entropy secrets through identifiers such as `password`, `pwd`, `secret`, and `api_key` combined with code/config assignments. This succeeds where entropy fails, but the copied value alone loses that context. [Keyword source](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/detect_secrets/plugins/keyword.py)

Code-oriented false-positive filters suppress UUIDs, templated values and indirect references. The `$`-prefix filter explicitly acknowledges that it can exclude true secrets. Do not copy all filters into a clipboard classifier: users can use UUIDs, dollar-prefixed strings, or numeric values as real credentials. [Heuristic filters](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/detect_secrets/filters/heuristic.py)

Apache-2.0; Python with PyYAML/requests and optional gibberish/word-list packages. Verification must be explicitly disabled if evaluating its runtime. [License](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/LICENSE), [dependencies](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/setup.py), [verification path](https://github.com/Yelp/detect-secrets/blob/5e141933554a0b74e7341841f318be21e895339c/detect_secrets/plugins/base.py#L45-L82)

### TruffleHog: distinction between matching and verification

Its GitHub detector first recognizes known prefixes and candidate shapes, then optionally invokes a service verifier. Results distinguish `verified`, `unverified`, and `unknown`; verification-disabled or expired credentials can remain unverified. This distinction is useful, but verification is unsuitable for passive clipboard privacy. [Detector](https://github.com/trufflesecurity/trufflehog/blob/e7a8d17d2f726cf414310a625b55cca7dc9c898e/pkg/detectors/github/v2/github.go#L31-L115), [result semantics](https://github.com/trufflesecurity/trufflehog/blob/e7a8d17d2f726cf414310a625b55cca7dc9c898e/README.md#L422-L430)

AGPL-3.0, Go, extensive service integrations; its README warns that public library APIs are not stable. It is a reference to study rather than a proposed dependency for Yank. [License and library note](https://github.com/trufflesecurity/trufflehog/blob/e7a8d17d2f726cf414310a625b55cca7dc9c898e/README.md#L911-L918), [license file](https://github.com/trufflesecurity/trufflehog/blob/e7a8d17d2f726cf414310a625b55cca7dc9c898e/LICENSE)

## Rust implementations checked

| Project | Source-level findings | Fit for Yank |
| --- | --- | --- |
| Rusty Hog | Apache-2.0 repository; separated scanner core exposes `matches(&[u8])` and `matches_entropy`, configurable JSON rules and allowlists; unrestricted entropy findings default off. Its debug inspection logs `RustyHogMatch`, including borrowed input bytes. [Core](https://github.com/newrelic/rusty-hog/blob/9da595ad204f017cff576ffac5bce7f2bed1be2f/crates/rusty-hog-scanner/src/lib.rs#L355-L369), [matching/logging](https://github.com/newrelic/rusty-hog/blob/9da595ad204f017cff576ffac5bce7f2bed1be2f/crates/rusty-hog-scanner/src/lib.rs#L705-L750), [license](https://github.com/newrelic/rusty-hog/blob/9da595ad204f017cff576ffac5bce7f2bed1be2f/LICENSE) | Useful embeddable reference. Audit rule freshness, remove secret-bearing debug output, avoid full cloud-scanner package. |
| ripsecrets | MIT; known-format rules plus assignment-gated random candidates of 15–90 characters. Its heuristic examines distinct characters, character classes and bigrams, not just entropy. Source threshold is `1e-5`. [Matcher](https://github.com/sirwart/ripsecrets/blob/34c9e03cfa9a0b2c4576dcce6bd624e743c1c355/src/matcher/mod.rs#L8-L47), [probability heuristic](https://github.com/sirwart/ripsecrets/blob/34c9e03cfa9a0b2c4576dcce6bd624e743c1c355/src/matcher/p_random.rs#L14-L41), [manifest](https://github.com/sirwart/ripsecrets/blob/34c9e03cfa9a0b2c4576dcce6bd624e743c1c355/Cargo.toml) | Offline reference, but public API is oriented around paths and output writers; does not solve bare-password detection. |
| cloakrs | MIT. Card recognizer accepts 13–19 digits with Luhn, handles Mastercard 2-series, uses `0.99` for recognized brands and `0.60` otherwise. SSNs support compact/separated forms, reject 9xx, and score compact forms lower with context boosts. [Cards](https://github.com/kadir/cloakrs/blob/765676a6355fecc746105b65376d5aa25fcb7033/crates/cloakrs-patterns/src/credit_card.rs), [SSNs](https://github.com/kadir/cloakrs/blob/765676a6355fecc746105b65376d5aa25fcb7033/crates/cloakrs-patterns/src/ssn.rs), [license](https://github.com/kadir/cloakrs/blob/765676a6355fecc746105b65376d5aa25fcb7033/LICENSE.md) | Most directly relevant typed recognizer design, but a young project. Hardcoded scores require independent calibration. |
| leakguard | MIT OR Apache-2.0; no dependencies, bounded byte scanners. Card detection accepts any 13–19 digit Luhn-valid run; SSNs only match `AAA-GG-SSSS` with impossible-area/group checks. [Detectors](https://github.com/ptukovar/leakguard/blob/b62cb6104691c49294dc99897c04c69764a7ffa1/src/detectors.rs#L186-L284), [SSNs](https://github.com/ptukovar/leakguard/blob/b62cb6104691c49294dc99897c04c69764a7ffa1/src/detectors.rs#L452-L492), [manifest](https://github.com/ptukovar/leakguard/blob/b62cb6104691c49294dc99897c04c69764a7ffa1/Cargo.toml) | Small reference; README explicitly acknowledges that timestamps can pass card checks. Not a complete classifier. [Limitations](https://github.com/ptukovar/leakguard/blob/b62cb6104691c49294dc99897c04c69764a7ffa1/README.md) |
| dlpscan-rs | MIT; current SSN pattern requires nearby context, allows normalized separators, and documents invoice/order collisions. [Pattern](https://github.com/oxide11/dlpscan-rs/blob/4e2a13fba836ee4e1dcc5951c6f4d8747aa0fb13/crates/siphon-core/src/patterns/mod.rs#L1738-L1762), [license](https://github.com/oxide11/dlpscan-rs/blob/4e2a13fba836ee4e1dcc5951c6f4d8747aa0fb13/LICENSE) | Useful context-gating reference; substantially broader service architecture and young project. Not proposing the whole dependency. |
| Nosey Parker | Apache-2.0; regex rule corpus, repository-scale scanner. CLI implicitly creates a datastore of findings. [Architecture](https://github.com/praetorian-inc/noseyparker/blob/2e6e7f36ce36619852532bbe698d8cb7a26d2da7/README.md#L106-L122), [license](https://github.com/praetorian-inc/noseyparker/blob/2e6e7f36ce36619852532bbe698d8cb7a26d2da7/LICENSE) | Additional rule reference; the persistence-oriented CLI conflicts with a clipboard exclusion gate. |

Age/maintenance evidence, retrieved from GitHub on 2026-10-21: cloakrs repository created **2026-05-09**, last push **2026-10-02**; leakguard created **2026-05-30**, last push **2026-10-06**; dlpscan-rs created **2026-04-04**, last push **2026-10-19**. “Young” here means these repository creation dates, not proof of poor quality. ripsecrets was created **2022-04-16**, last push **2025-12-15**; Rusty Hog created **2019-11-17**, last push **2026-08-03**. Push dates do not prove release support. [cloakrs metadata](https://api.github.com/repos/kadir/cloakrs), [leakguard metadata](https://api.github.com/repos/ptukovar/leakguard), [dlpscan-rs metadata](https://api.github.com/repos/oxide11/dlpscan-rs), [ripsecrets metadata](https://api.github.com/repos/sirwart/ripsecrets), [Rusty Hog metadata](https://api.github.com/repos/newrelic/rusty-hog)

## Reproduced boundary cases and reliability limits

An isolated local audit loaded the actual pinned Presidio recognizer files with minimal framework stubs, then ran their regexes and validation functions on synthetic/public test patterns. This was a source-level audit, not a full integration test or benchmark.

| Input | Observed Presidio behavior | Implication |
| --- | --- | --- |
| `4111111111111111` | Matches and passes Luhn | Expected baseline. |
| `2221000000000009` | No card match | Mastercard 2-series gap. |
| `4111.1111.1111.1111` | No card match | Separator coverage matters. |
| `4111 1111 1111 1111` (NBSP) | No card match | Web/PDF copy normalization matters. |
| `900-12-3456` | Formatted SSN matches; not invalidated | Impossible SSA range accepted. |
| `666-12-3456` | Invalidated | Some structural checks work. |
| `123-45-6789` | Invalidated as a sample | Sample allowlists must be an explicit policy, not assumed protection. |

Two mathematical observations explain why validation alone is insufficient:

- One out of ten arbitrary fixed-length digit strings passes Luhn. This is a checksum acceptance rate, **not** a measured clipboard false-positive rate. Brand ranges, boundaries, formatting and nearby labels improve specificity, but an identifier can still coincide with a card-shaped value.
- SSA's basic structural rules permit `898 × 99 × 9999 = 888,931,098` of all one billion nine-digit strings, about **88.9%**. Therefore “valid-looking SSN” cannot make a bare nine-digit ID precise. Formatted SSNs and compact numbers with nearby `SSN`/`social security` labels should be separate policy cases. This is a derivation from the [SSA rules](https://secure.ssa.gov/poms.nsf/lnx/0110201035), not an empirical detection rate.

Before choosing defaults, build a synthetic clipboard corpus with per-category positives and realistic negatives: compact/formatted cards including 2-series/19-digit values, invalid checksums, long IDs and timestamps, SSNs with and without labels, non-US identifiers, dates, random tokens, code/config assignments, natural-language passwords, passphrases, numeric PINs and ordinary short text. Include NBSP/full-width digits/Unicode dashes, values embedded in longer numbers, and large mixed text. Measure precision, recall and latency **per category**, including unmarked passwords as an explicit unsupported case. Do not market a single aggregate “sensitive data detection accuracy” number.

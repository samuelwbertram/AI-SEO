# Changelog

## v5.4 — 26 Nov 2026

- **Plain-English summary on Results.** Above the tables: what each AI cares about most (top 3 attributes and the direction it prefers), whether it favours whatever is listed first, and "Did its conjoint predict what it bought?" (Spearman ρ between the locked prediction and storefront picks: .70 or more = Yes, strongly; .40 to .69 = Partly; below .40 = No), plus which preferences hold across all models and where they disagree. "Clear" means p < .05. Written by fixed rules from the computed numbers (no AI), so the same data always gives the same words. The full tables are unchanged, one click below ("Show full tables").
- **Product finder** (page 2, optional): the helper model is now a dropdown that lists only the providers you have entered a key for (Claude Opus 5.5 / Sonnet 5.5, GPT-6.2 Astra / Sol, Gemini 3.7 / 3.5 Flash), each with its own web search (Anthropic web search, OpenAI Responses `web_search`, Gemini Grounding with Google Search), plus "Other model…" for any ID (IDs with a slash go through OpenRouter). Default: Claude Opus 5.5 when an Anthropic key is present. With no keys the finder is switched off. Labelled as optional AI that is never used for the conjoint, storefront or analysis.
- **Validation check shown as it runs** (Run page, new panel): the test page (the best product vs the identical worst products, and which attributes are held the same), a screenshot of a test page exactly as the model sees it, and every answer as it arrives: where the best product was, what the model picked, ✓/✕ and why it missed (picked another product / no readable choice / answer cut off), misread cards and the full answer. **Download validation answers (CSV)**; also in Export as "Validation check".
- **Cut-off answers:** Gemini thinking counts toward the answer length limit, so a long screenshot read-back could be cut off and recorded as no pick. Gemini calls now get an 8,192-token limit and the Reasoning effort setting as their thinking level (thinkingLevel for Gemini 3+, thinkingBudget for 2.5; models that refuse it are asked again with their default). OpenAI reasoning models get the same 8,192 limit. Every call records whether it was cut off, and a storefront answer with no readable choice is asked once more (Re-ask setting); both answers are kept and exported (ReAskAnswer, CutOff).
- **API keys first:** the keys box now sits at the top of page 1; page 4 shows which keys are in. The tour starts with the keys.
- **Product finder progress:** a progress box with a running timer, what to expect, and Cancel; then "Found N products in N s" or a plain error.
- **Tests:** new `tests/consistency_test.py` (same seed → same design and storefront pages; same data → identical numbers and identical summary, also in a fresh page). `tests/verify_pack_test.py` now runs with no arguments on any computer and runs the pack's own verify.py. New mocked-API tests (no keys): `tests/helper_mock_test.py` (product finder, every provider) and `tests/validation_mock_test.py` (validation panel, cut-off answers, CSV).

## v5.3 — 26 Nov 2026

- **Page 9 · Verify** and **Download verification pack** (.zip): raw conjoint and storefront data, the locked prediction files with their SHA-256 fingerprints and lock history, the tool's results at full precision, and SPSS, R and Python scripts that recompute everything (checks A, B, C). Guide: VALIDATION.md; worked example: examples/demo_verification_pack.
- Every conjoint answer and storefront trial is now time-stamped, so the pack can show the prediction was locked before the first storefront trial.
- A conjoint-only run (storefront switched off) now locks the prediction, so the fingerprint can be posted (e.g. OSF) before the storefront runs. The log shows the full fingerprint.
- Fixed: the storefront position model (conditional logit) could fail to converge when a product was chosen only once or twice. Newton steps are now halved when they overshoot; results agree with R's survival::clogit to 1e-9.

## v5.2 — 26 Nov 2026

- **▶ Launch study** (Run page and header): one click runs a 1-call check per model (models that fail are skipped for that launch and listed), the validation check, the pilot, a cost check projected from the pilot (with an option to skip asking when the full run fits under the spend cap), the full run and the analysis. Press it again after a stop to carry on.
- Hosted on GitHub Pages: https://llm-choice-lab.github.io/ai-seo/

- **Guided tour**: opens on first visit and walks through the 8 pages, highlighting the real controls; **? Tour** in the header replays it.
- **One-click demo**: **▶ Demo** runs Study 3 on 3 simulated models (validation check, pilot, analysis) in a few seconds with no keys or cost; a banner marks demo results, and **Exit demo** restores the project you had open.

## v5.1 — 25 Nov 2026

- Study 3 lineup moved from OpenRouter to direct OpenAI, Anthropic and Google keys: GPT-4o (2024-11-20), GPT-4o mini, GPT-6 Luna; Claude Haiku 5.5, Haiku 4.5, Sonnet 5.5; Gemini 2.5, 3.1 and 3.5 Flash-Lite.
- Spend is counted from token use and list prices for direct API calls; the cost line projects the cost of a full run from the calls so far.
- Reasoning effort is sent to OpenAI GPT-5/GPT-6/o-series models as well as OpenRouter models.
- If the conjoint can't be fitted yet (too few or one-sided answers), the storefront still runs and the log warns that no prediction was locked.
- Pilot size raised to 30 pairs.

## v5.1 docs and tests — 26 Nov 2026

- README rewritten for direct keys and for people downloading the tool.
- `tests/sim_recovery.py`: full Study 3 run on simulated models with known preferences; all 36 weights recovered within 3 SE, locked prediction vs storefront ρ = .92–.98.

## v5.0 — 24 Nov 2026

v3 (recovered from the 18 Nov chat) is the base again, and it stays a single HTML file with v3's own storefront. v5 adds:

- **Order per model:** conjoint and ranking, then the prediction is locked (timestamp + SHA-256), then the storefront.
- **Study 3 preset:** the 10 e-readers from the v5/v6 storefront Sheet. The conjoint uses the same attributes and wording as the cards; Resolution is shown linked to Screen type, as on real products. 500 pairs, each asked both ways (1,000 calls per model), 20 rankings, 1,000 storefront trials.
- **9 starting models** on OpenRouter, editable any time.
- **Pilot / Full** run sizes on the same fixed design; **validation check** (one dominant product); **spend cap** that pauses the run; **reasoning effort** setting.
- **Storefront cards** sized to their longest line (v3's fixed 290 px let long values run into the next card).
- **Results:** locked prediction vs storefront shares, shares on correctly read trials, misread fields, conditional logit (product + page position).
- Separate browser storage from v3.
- A Selenium helper that copied the v6 ACES procedure was built and tested, then dropped as too much setup; it is in this commit's history.

## v4.0 — 24 Nov 2026

Rebuilt from the v2/v3 design notes (the v3 HTML file was not saved locally). First version under version control.

- Runs many models at once (default slots: 3 providers × 3 tiers) through OpenRouter, or OpenAI, Anthropic and Google keys directly; simulated models for testing.
- Study 3 preset: 10 e-readers, 9 conjoint attributes (price, battery life, weight, storage, screen size, screen colour, water resistance, page buttons, stylus).
- Conjoint with counterbalancing; unclear answers re-asked once, then recorded as missing.
- Ranking (Rotman bot) task with shuffled order.
- Conjoint prediction locked (timestamp + SHA-256) before the storefront runs.
- Storefront: screenshot or text mode, `add_to_cart` tool with read-back of every attribute (v6 method), re-ask once.
- Extreme-condition validation check.
- Pilot / full sizes on the same fixed design.
- Results: logistic regression, relative importance, predicted vs ranking vs storefront, conditional logit with product, row and column effects.
- Compare models: side-by-side table, random-effects pooling with I².
- Exports: CSVs, SPSS syntax, project and study files. Autosave in the browser.

Not yet carried over from v3: Excel/PDF report export, finding products online from a link, Study 2 legacy import with its exact prompt wording (needs the Study 2 files).

# LLM Conjoint Lab

A tool for studying how AI models make consumer choices. It runs one study on many models at once and tests whether each model's stated preferences (from a conjoint) predict what it picks on a shop page (an ACES-style storefront).

It is a single HTML file. Nothing to install: download it, open it in Chrome, add your API keys, run. Keys stay in your browser and calls go straight from your browser to the AI provider.

## What it does, for every model

All models get the same fixed design.

1. **Conjoint.** The model sees pairs of products and picks one. Each pair is asked in both orders (counterbalancing). Binary logistic regression on Product 1 − Product 2 differences gives the attribute weights; the constant is the first-position bias.
2. **Ranking ("Rotman bot").** The model ranks all storefront products several times.
3. **Locked prediction.** The conjoint weights give a predicted choice share for each storefront product. This is saved with a timestamp and SHA-256 hash *before* any storefront trial runs.
4. **Storefront.** The page draws a shop page of the products in a new random order each trial and sends it as a screenshot. The model picks one product and copies back every card, so misreadings are counted.
5. **Results.** Locked prediction vs storefront shares (Spearman ρ, share gap, top pick), the same on correctly read trials only, a conditional logit with product and page-position effects, and all models side by side. Exports: CSV, SPSS syntax, Excel, PDF report.

Unclear answers are asked again once, then recorded as missing (never defaulted to an option).

## Running it

1. Open **https://samuelwbertram.github.io/AI-SEO/** in Chrome (nothing to install). Or download `index.html` and open it from your computer.
2. **Page 1:** load **Study 3 (e-readers, OpenAI + Claude + Gemini, built in)**.
3. **Page 4:** paste your OpenAI, Anthropic and Google API keys. The 9 starting models are listed; change them any time with **Browse model list**. An OpenRouter key also works for any model on OpenRouter.
4. Press **▶ Launch study**. It runs, in order: a 1-call check per model, the validation check (one product is best on everything, so each model should pick it every time), the pilot, a cost check for the full run (you confirm), the full run, and the analysis. Set a **spend cap** on page 6: the run pauses when it is reached.
5. Results open on page 7. Each step can also be run by hand on page 6.

New to it? A short tour opens the first time you load the page (replay it with **? Tour** at the top). **▶ Demo** runs a full study on 3 simulated models in a few seconds, with no keys and no cost; **Exit demo** puts your own project back.

### Study 3 starting lineup (editable)

| Provider | Models |
|---|---|
| OpenAI | GPT-4o (2024-11-20), GPT-4o mini, GPT-6 Luna |
| Anthropic | Claude Haiku 5.5, Claude Haiku 4.5, Claude Sonnet 5.5 |
| Google | Gemini 2.5 Flash-Lite, Gemini 3.1 Flash-Lite, Gemini 3.5 Flash-Lite |

## Checks that it works

- **Check it yourself, outside the tool:** page 9 (**Verify**) downloads a verification pack with the raw data, the locked predictions, the tool's results and ready-to-run **SPSS, R and Python** scripts. Step-by-step guide: [VALIDATION.md](VALIDATION.md). Worked example with expected output: [examples/demo_verification_pack](examples/demo_verification_pack).

- **Study 2 parity:** the conjoint analysis reproduces the published Study 2 SPSS coefficients to 5 decimals for GPT-4o, Gemini and Claude.
- **Parameter recovery:** `tests/sim_recovery.py` runs the full Study 3 pipeline on simulated models whose true preferences are known and prints true vs estimated weights. Requires Python with `playwright` and Chrome or Chromium:

  ```
  pip install playwright
  python tests/sim_recovery.py
  ```
- **Consistency:** `tests/consistency_test.py` checks that the same seed gives the same design and storefront pages, and that analysing the same data twice (or in a fresh page) gives identical numbers and an identical plain-English summary. `tests/verify_pack_test.py` runs the demo, downloads the verification pack and runs its verify.py (needs `pip install pandas numpy scipy statsmodels`).

## Files

| Path | What |
|---|---|
| `index.html` | The Lab. Built from v3 by `tools/patch_v5.py`; do not edit by hand. |
| `tools/` | `patch_v5.py` + `v5_additions.js` + `guide.js` (tour, demo) + `launch.js` (one-click launch) + `verify.js` (page 9) + `summary.js` (plain-English results) + `helper.js` (product-finder models) + `v54_run.js` (validation panel, cut-off answers, keys first): everything v5 adds to v3. Rebuild with `python tools/patch_v5.py index.html` |
| `tests/` | Parameter recovery, consistency (same input → same output) and verification-pack tests |
| `verify/` | `verify.py` and `verify.R`, the outside-the-tool checks (also bundled into every verification pack) |
| `examples/` | A finished demo run's verification pack, with the Python and R reports it should produce |
| `VALIDATION.md` | Step-by-step guide to checking results in SPSS, R or Python |
| `versions/` | v3 as recovered (18 Nov 2026) and the v4 rebuild, for reference |
| `CHANGELOG.md` | What changed in each version |

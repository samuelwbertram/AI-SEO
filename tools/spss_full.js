// ================= v5.4: CSV export as one .zip, with an SPSS folder that runs the whole analysis start to finish =================
// spss/data/*.csv are slim files made for SPSS (no free text, so no quoted line breaks), spss/expected/*.csv are the tool's own
// numbers to compare against, spss/analysis.sps does every step. Fixed rules only, no AI.

function spssPack() { if (!Object.keys(S.fits || {}).length) $('analyseAll').click();
  const keep = new Set(expUnits().map(u => runId(u))), v = vRows(), feats = v.feats, P = S.val.products, U = expUnits().filter(u => u.m.provider !== 'import' || conjointRows(u).length);
  const by = rows => rows.filter(r => keep.has(r.RunID));
  const conj = by(v.conj), trials = by(v.trials).map(({ PageOrder, ...r }) => r);
  // v5.5: AfterLock = 1 for storefront trials run after that model's prediction was locked (used by STEP 7b)
  const lockAt = Object.fromEntries(U.map(u => [runId(u), resOf(u).lock?.at || ''])), after = new Set(trials.filter(t => lockAt[t.RunID] && (!t.At || t.At > lockAt[t.RunID])).map(t => t.RunID + '|' + t.Trial));
  const long = by(v.long).map(r => ({ ...r, AfterLock: after.has(r.RunID + '|' + r.Trial) ? 1 : 0 }));
  const posctl = U.flatMap(u => { const c = S.fits[u.key]?.posctl; return c && !c.error ? c.full.terms.map(t => ({ RunID: runId(u), Term: t.term, B: t.B, SE: t.SE, HitRatePct: 100 * c.hitFull, TrialsAfterLock: c.n })) : []; });
  const prodRun = U.flatMap(u => v.prods.map(p => ({ RunID: runId(u), ...Object.fromEntries(Object.entries(p).filter(([k]) => k === 'Product' || k.startsWith('x_'))) })));
  const rank = U.flatMap(u => Object.entries(S.results[u.key]?.ranking || {}).filter(([, r]) => r.valid && r.ranking).flatMap(([id, r]) => r.ranking.map((pname, i) => ({ RunID: runId(u), RankingRun: +id, Product: pname, RankPos: i + 1 }))));
  const val = U.flatMap(u => { const R = resOf(u); return [...(R.validationHistory || []), R.validation].filter(Boolean).flatMap(V => Object.entries(V.trials || {}).map(([t, x]) => ({ RunID: runId(u), CheckedAt: V.at || '', Trial: +t, BestProduct: V.dominant, Picked: x.choice ?? '', Correct: x.choice === V.dominant ? 1 : 0, CutOff: x.cut ? 1 : 0 }))); });
  const imp = U.filter(u => S.fits[u.key]?.fit).flatMap(u => S.fits[u.key].fit.importance.map(i => ({ RunID: runId(u), Attribute: i.attr, Range: i.range, ImportancePct: i.pct })));
  const pred = U.flatMap(u => productRows(u, S.fits[u.key]).map(r => ({ RunID: runId(u), ...r })));
  const files = [['spss/analysis.sps', spssFull(feats, U)], ['spss/data/conjoint_long.csv', fullCSV(conj)], ['spss/data/products_by_run.csv', fullCSV(prodRun)],
    ['spss/data/storefront_long.csv', fullCSV(long)], ['spss/data/storefront_trials.csv', fullCSV(trials)], ['spss/data/ranking_long.csv', fullCSV(rank)], ['spss/data/validation.csv', fullCSV(val)],
    ['spss/expected/coefficients.csv', fullCSV(by(v.coefs))], ['spss/expected/importance.csv', fullCSV(imp)], ['spss/expected/product_predictions.csv', fullCSV(pred)], ['spss/expected/storefront_clogit.csv', fullCSV(by(v.clog))], ['spss/expected/storefront_position_controlled.csv', fullCSV(posctl)],
    ['spss/READ_ME.txt', `SPSS analysis for "${S.projName}" (${U.map(u => u.label).join(', ')}). Generated ${new Date().toISOString()} by LLM Conjoint Lab.\n\n1. Unzip this file.\n2. Open spss/analysis.sps in SPSS.\n3. On the CD line near the top, put the full path of the spss folder.\n4. Run All.\n\nThe syntax runs every step from the raw data: conjoint (Study 2 method), relative importance, predicted product utilities and shares, storefront picks and ranks, whether the conjoint predicts the storefront, position bias, the position model, the ranking task and the validation check.\nAfter each step it says which file in spss/expected/ holds the tool's own numbers to compare with.\nThe CSV files outside the spss folder are the same tables as the Export page, for Excel.\n`]];
  return files; }

function spssFull(feats, U) { const d = feats.map(f => f.name), x = feats.map(xName), K = S.val.products.length, safe = E.safe;
  const b = f => 'b_' + f.name.slice(2), lead = s => E.leadNum(s);
  const impLines = S.study.attrs.map(a => { const fs = feats.filter(f => f.attr === a.name), n = 'imp_' + safe(a.name).slice(0, 50);
    if (a.type !== 'categorical') { const L = a.kind === 'range' ? [+a.min, +a.max] : a.levels.map(lead), rg = Math.max(...L) - Math.min(...L);
      return `* ${a.name}: continuous, |B| x tested range (${Math.max(...L)} - ${Math.min(...L)} = ${rg}).\nCOMPUTE ${n} = ABS(${b(fs[0])}) * ${rg}.`; }
    return `* ${a.name}: categorical, range of level effects (reference level ${a.levels.find(l => !fs.some(f => f.level === l))} = 0).\nCOMPUTE ${n} = MAX(0, ${fs.map(b).join(', ')}) - MIN(0, ${fs.map(b).join(', ')}).`; });
  const impNames = S.study.attrs.map(a => 'imp_' + safe(a.name).slice(0, 50));
  return `* Encoding: UTF-8.
* =====================================================================================================.
* LLM Conjoint Lab: the whole analysis in SPSS, from the raw data to every result.
* Project: ${S.projName}. Runs: ${U.map(u => u.label).join(', ')}. Generated ${new Date().toISOString()}.
* HOW TO USE: unzip the export, put the full path of its "spss" folder on the CD line below, then Run All.
* Each step ends with the file in expected/ that holds the tool's own numbers, so you can compare them.
* SPSS shows 3 decimals: double-click a table and then a cell to see more.
* =====================================================================================================.

CD 'C:\\Users\\you\\Downloads\\export\\spss'.
SET DECIMAL=DOT.

* ---------------- STEP 1. Conjoint: binary logistic regression on Product 1 - Product 2 differences (Study 2 method) ----------------.
* DV = ChoseFirst (1 = chose the first-listed product). The constant is the first-position bias. One model per run.
GET DATA /TYPE=TXT /FILE='data/conjoint_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  Run A200 RunID A100 Model A200 Pair F8.0 Order A4 ChoseFirst F8.0
${d.map(n => `  ${n} F20.10`).join('\n')}
${S.study.attrs.map(a => `  ${safe(a.name)}_P1 A200 ${safe(a.name)}_P2 A200`).join('\n')}.
DATASET NAME conj.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
FREQUENCIES VARIABLES=ChoseFirst.
SPLIT FILE OFF.
* One logistic regression per run. Each run's coefficient table is also written to a data file (coef_1.sav, coef_2.sav, ...) for the next steps.
${U.map((u, i) => `* Run ${i + 1}: ${u.label}.
DATASET ACTIVATE conj.
TEMPORARY.
SELECT IF (RunID = '${runId(u)}').
OMS /SELECT TABLES /IF COMMANDS=['Logistic Regression'] SUBTYPES=['Variables in the Equation'] /DESTINATION FORMAT=SAV OUTFILE='coef_${i + 1}.sav' /TAG='coef${i + 1}'.
LOGISTIC REGRESSION VARIABLES ChoseFirst WITH ${d.join(' ')}
  /CRITERIA=ITERATE(50) CUT(.5).
OMSEND TAG='coef${i + 1}'.`).join('\n')}
* Compare B and S.E. with expected/coefficients.csv (they match to 4+ decimals). Chose first % = the ChoseFirst frequency.

* ---------------- STEP 2. Coefficients as one row per run, then relative importance ----------------.
${U.map((u, i) => `GET FILE='coef_${i + 1}.sav'.
STRING RunID (A100).
COMPUTE RunID = '${runId(u)}'.
SAVE OUTFILE='coef_${i + 1}.sav'.`).join('\n')}
ADD FILES ${U.map((u, i) => `/FILE='coef_${i + 1}.sav'`).join(' ')}.
* In the saved coefficient table, Var2 holds the variable name and B the coefficient.
STRING VarName (A100).
COMPUTE VarName = LTRIM(RTRIM(Var2)).
${feats.map(f => `COMPUTE ${b(f)} = B * (VarName = '${f.name}').`).join('\n')}
COMPUTE b_Constant = B * (VarName = 'Constant').
AGGREGATE /OUTFILE=* /BREAK=RunID
  ${[...feats.map(b), 'b_Constant'].map(n => `/${n} = SUM(${n})`).join('\n  ')}.
${impLines.join('\n')}
COMPUTE imp_total = SUM(${impNames.join(', ')}).
${impNames.map(n => `COMPUTE pct_${n.slice(4)} = 100 * ${n} / imp_total.`).join('\n')}
FORMATS ${impNames.map(n => 'pct_' + n.slice(4)).join(' ')} (F8.2).
DATASET NAME coefwide.
SORT CASES BY RunID.
SAVE OUTFILE='coef_wide.sav'.
LIST VARIABLES=RunID ${impNames.map(n => 'pct_' + n.slice(4)).join(' ')}.
* Relative importance (% of the decision). Compare with expected/importance.csv.

* ---------------- STEP 3. Predicted utility, share and rank of each product (constant left out) ----------------.
GET DATA /TYPE=TXT /FILE='data/products_by_run.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Product A100
${x.map(n => `  ${n} F20.10`).join('\n')}.
SORT CASES BY RunID.
MATCH FILES /FILE=* /TABLE='coef_wide.sav' /BY RunID.
COMPUTE Utility = ${feats.map((f, j) => `${b(f)} * ${x[j]}`).join(' + ')}.
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID /MaxU = MAX(Utility).
COMPUTE ExpU = EXP(Utility - MaxU).
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID /SumExpU = SUM(ExpU).
COMPUTE PredShare = 100 * ExpU / SumExpU.
RANK VARIABLES=Utility (D) BY RunID /RANK INTO PredRank /TIES=MEAN /PRINT=NO.
SORT CASES BY RunID Product.
SAVE OUTFILE='predicted.sav' /KEEP=RunID Product Utility PredShare PredRank.
FORMATS Utility (F10.4) PredShare (F8.2) PredRank (F5.1).
LIST VARIABLES=RunID Product Utility PredShare PredRank.
* Compare with PredictedUtility, PredictedShareLockedPct and PredictedRank in expected/product_predictions.csv.

* ---------------- STEP 4. Storefront: picks per product over every trial, share, rank, and match with the prediction ----------------.
GET DATA /TYPE=TXT /FILE='data/storefront_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Trial F8.0 Product A100 Position F4.0 PageRow F4.0 PageCol F4.0 Chosen F8.0 AfterLock F4.0.
DATASET NAME sf.
SORT CASES BY RunID Product.
AGGREGATE /OUTFILE=* /BREAK=RunID Product /Picks = SUM(Chosen) /Trials = N.
COMPUTE SfShare = 100 * Picks / Trials.
MATCH FILES /FILE=* /TABLE='predicted.sav' /BY RunID Product.
RANK VARIABLES=SfShare (D) BY RunID /RANK INTO SfRank /TIES=MEAN /PRINT=NO.
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID /NProducts = N.
COMPUTE RankMatch = (SfRank = PredRank).
COMPUTE RankGap = SfRank - PredRank.
COMPUTE TopHit = (PredRank = 1 AND SfRank = 1).
COMPUTE LastHit = (PredRank = NProducts AND SfRank = NProducts).
FORMATS SfShare PredShare (F8.2) SfRank PredRank RankGap (F5.1) Picks Trials RankMatch TopHit LastHit (F6.0).
SORT CASES BY RunID PredRank.
LIST VARIABLES=RunID Product PredRank SfRank RankMatch Picks Trials SfShare PredShare.
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID /ExactRanks = SUM(RankMatch) /TopPredictedPicked = SUM(TopHit) /LastPredictedLast = SUM(LastHit).
* ExactRanks = products whose storefront rank equals the predicted rank. TopPredictedPicked = 1 if the predicted favourite was picked most.
* LastPredictedLast = 1 if the predicted last product was picked least. Compare with expected/product_predictions.csv (StorefrontPicks, StorefrontRank, RankMatches).
DATASET NAME comp.
SAVE OUTFILE='comparison.sav'.

* ---------------- STEP 5. Does the conjoint predict the storefront? ----------------.
* Spearman's rho = Pearson correlation of the ranks (ties get their average rank). Pearson r on the shares as a second measure.
RANK VARIABLES=Utility SfShare (A) BY RunID /RANK INTO rUtil rShare /TIES=MEAN /PRINT=NO.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
CORRELATIONS /VARIABLES=rUtil rShare.
CORRELATIONS /VARIABLES=PredShare SfShare.
DESCRIPTIVES VARIABLES=ExactRanks TopPredictedPicked LastPredictedLast /STATISTICS=MEAN.
SPLIT FILE OFF.
* The rUtil-rShare correlation is the tool's "rho predicted vs storefront". Verdict rule in the tool: .70+ = Yes, strongly; .40-.69 = Partly; below .40 = No.

* ---------------- STEP 6. Position bias: picks by page position (an even split is 1/${K} each) ----------------.
GET DATA /TYPE=TXT /FILE='data/storefront_trials.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Run A200 Trial F8.0 Choice A100 Position F4.0 Misreads F4.0 At A40.
SELECT IF Position >= 1.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
FREQUENCIES VARIABLES=Position Misreads.
NPAR TESTS /CHISQUARE=Position (1,${K}) /EXPECTED=EQUAL.
SPLIT FILE OFF.
* Compare the Position percentages with Storefront picks by page position in the export.

* ---------------- STEP 7. Position model: conditional logit (product + page row + page column) ----------------.
* Fitted as a stratified Cox model, one stratum per trial (with one chosen product per trial this is the conditional logit).
* Products never chosen by a run are dropped (as in ACES).
GET DATA /TYPE=TXT /FILE='data/storefront_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Trial F8.0 Product A100 Position F4.0 PageRow F4.0 PageCol F4.0 Chosen F8.0 AfterLock F4.0.
SORT CASES BY RunID Product.
AGGREGATE /OUTFILE=* MODE=ADDVARIABLES /BREAK=RunID Product /EverChosen = MAX(Chosen).
SELECT IF EverChosen = 1.
COMPUTE CoxTime = 2 - Chosen.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
COXREG VARIABLES=CoxTime WITH Product PageRow PageCol
  /STATUS=Chosen(1) /STRATA=Trial
  /CATEGORICAL=Product PageRow PageCol
  /CONTRAST (Product)=Indicator(1) /CONTRAST (PageRow)=Indicator /CONTRAST (PageCol)=Indicator
  /METHOD=ENTER Product PageRow PageCol.
SPLIT FILE OFF.
* Reference: Product = first in alphabetical order, PageRow = bottom row, PageCol = last column. Compare B and SE with expected/storefront_clogit.csv.

* ---------------- STEP 7b. Position-controlled test: locked conjoint utility + page row + page column (trials after the lock) ----------------.
GET DATA /TYPE=TXT /FILE='data/storefront_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 Trial F8.0 Product A100 Position F4.0 PageRow F4.0 PageCol F4.0 Chosen F8.0 AfterLock F4.0.
SELECT IF AfterLock = 1.
SORT CASES BY RunID Product.
MATCH FILES /FILE=* /TABLE='predicted.sav' /BY RunID Product.
COMPUTE CoxTime = 2 - Chosen.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
* Conjoint only.
COXREG VARIABLES=CoxTime WITH Utility /STATUS=Chosen(1) /STRATA=Trial /METHOD=ENTER Utility.
* Conjoint + page position.
COXREG VARIABLES=CoxTime WITH Utility PageRow PageCol
  /STATUS=Chosen(1) /STRATA=Trial
  /CATEGORICAL=PageRow PageCol
  /CONTRAST (PageRow)=Indicator /CONTRAST (PageCol)=Indicator
  /METHOD=ENTER Utility PageRow PageCol.
SPLIT FILE OFF.
* Utility = each product's conjoint utility (Step 3). A positive, significant B for Utility = the conjoint still predicts choice with page position held constant.
* Reference: bottom row, last column. Compare B and SE with expected/storefront_position_controlled.csv.

* ---------------- STEP 8. Ranking task (Rotman bot): mean rank and times ranked #1, against the prediction ----------------.
GET DATA /TYPE=TXT /FILE='data/ranking_long.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 RankingRun F8.0 Product A100 RankPos F4.0.
COMPUTE RankedFirst = (RankPos = 1).
SORT CASES BY RunID Product.
AGGREGATE /OUTFILE=* /BREAK=RunID Product /MeanRank = MEAN(RankPos) /TimesRankedFirst = SUM(RankedFirst) /Rankings = N.
MATCH FILES /FILE=* /TABLE='predicted.sav' /BY RunID Product.
FORMATS MeanRank (F6.2) TimesRankedFirst Rankings (F6.0).
LIST VARIABLES=RunID Product MeanRank TimesRankedFirst Rankings PredRank.
RANK VARIABLES=MeanRank Utility (A) BY RunID /RANK INTO rMean rUtil2 /TIES=MEAN /PRINT=NO.
SORT CASES BY RunID.
SPLIT FILE SEPARATE BY RunID.
CORRELATIONS /VARIABLES=rMean rUtil2.
SPLIT FILE OFF.
* A lower mean rank is better, so a strong match shows as a strong NEGATIVE correlation here (the tool reports it with the sign flipped).
* Compare with RankingTask_MeanRank and RankingTask_RankedFirst in expected/product_predictions.csv.

* ---------------- STEP 9. Validation check: did each model pick the clearly best product? ----------------.
GET DATA /TYPE=TXT /FILE='data/validation.csv' /ENCODING='UTF8' /DELIMITERS="," /QUALIFIER='"' /ARRANGEMENT=DELIMITED /FIRSTCASE=2 /VARIABLES=
  RunID A100 CheckedAt A40 Trial F8.0 BestProduct A100 Picked A100 Correct F4.0 CutOff F4.0.
SORT CASES BY RunID CheckedAt.
AGGREGATE /OUTFILE=* /BREAK=RunID CheckedAt /Trials = N /PickedBest = SUM(Correct) /CutOffAnswers = SUM(CutOff).
LIST.
* PASS = PickedBest equals Trials.
`; }

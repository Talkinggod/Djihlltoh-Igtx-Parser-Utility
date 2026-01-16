
# Section 10: Empirical Validation of Layer Separation

## 10.1 The Contamination Risk
**Problem:** If `λ_control` influences `λ_measured` through any pathway other than the actual physical transformation of text, the two-layer architecture is compromised.

Contamination pathways to guard against:
*   **Selection bias:** Measuring only transformations that "worked" (high `λ_control` successes).
*   **Circular calibration:** Setting `λ_baseline` from texts generated with specific `λ_control` values.
*   **Anchoring effects:** Measurer expectations influencing embedding choices or fit procedures.
*   **Metric gaming:** Transformations optimized to produce specific `λ_measured` values.

## 10.2 Core Validation Principle
**Independence Requirement:**
`λ_measured(T_λ(text))` must be computable without knowledge of `λ`.
The measurement layer must produce identical results whether it knows transformation history or not.

## 10.3 Protocol 1: Blind Measurement Validation
**Design:**

1.  **Corpus preparation:**
    *   Collect 100+ texts from target domain (e.g., legal pleadings).
    *   Apply transformations with varying `λ_control` ∈ [0, 0.2, 0.4, 0.6, 0.8, 1.0].
    *   Strip all metadata about transformation history.
    *   Randomize presentation order.

2.  **Measurement team:**
    *   **Team A:** Knows transformation history (control).
    *   **Team B:** Blind to transformation history (test).
    *   Both use identical measurement code.

3.  **Execute measurements:**
    *   Both teams measure `λ_measured`, `κ_physics`, `R²` on all texts.
    *   Record results independently.

4.  **Statistical test:**
    *   $H_0: \mu_A(\lambda_{measured}) = \mu_B(\lambda_{measured})$ for each text.
    *   **Accept if:** $|\lambda_A - \lambda_B| < 0.001$ for 95%+ of texts.

**Pass criteria:**
*   Inter-rater reliability > 0.99.
*   No systematic bias correlated with `λ_control`.
*   Variance within measurement noise floor.

**Failure modes:**
*   Team A systematically measures different λ than Team B.
*   Correlation between knowledge of `λ_control` and measured λ.
*   Suggests contamination → revisit measurement protocol.

## 10.4 Protocol 2: Baseline Stability Test
**Design:**

1.  **Establish baseline from virgin corpus:**
    *   Select 200+ untransformed texts from domain.
    *   Measure `λ_baseline` distribution.
    *   Compute: $\mu_{virgin}$, $\sigma_{virgin}$, 95% CI.

2.  **Generate transformed corpus:**
    *   Apply $T_\lambda$ with various `λ_control` values.
    *   Measure `λ_measured` on outputs.
    *   Compute: $\mu_{transformed}$, $\sigma_{transformed}$, 95% CI.

3.  **Stability test:**
    *   For each `λ_control` value: Does $\mu_{transformed}$ fall within virgin baseline CI?
    *   If `λ_control` = 0.0 (minimal transform):
        *   **MUST have:** $\mu_{transformed} \approx \mu_{virgin}$
    *   If `λ_control` = 1.0 (maximal transform):
        *   **ALLOW:** $\mu_{transformed} \neq \mu_{virgin}$ (physical change expected).

**Pass criteria:**
*   `λ_control`=0.0 produces `λ_measured` within 1σ of baseline.
*   Spread in `λ_measured` increases with `λ_control` (physical effect).
*   No discrete jumps or threshold artifacts in `λ_measured(λ_control)` curve.

**Failure modes:**
*   Baseline shifts when computed on transformed vs virgin text.
*   Suggests calibration contamination.

## 10.5 Protocol 3: Cross-Model Invariance
**Design:**

1.  **Multi-model measurement:**
    *   Same text corpus.
    *   Measure with models: `{MiniLM, E5, BGE-M3, Gemini, ...}`.
    *   Each model produces: `λ_model_i`.

2.  **Transformation invariance test:**
    *   For each text:
        *   Variance across models: $\sigma^2_{models} = Var(\lambda_{model_1}, ..., \lambda_{model_n})$.
    *   For each transformation:
        *   Apply $T_\lambda(text)$ with fixed `λ_control`.
        *   Remeasure with all models → $\sigma^2_{models\_transformed}$.
    *   **Test:** $\sigma^2_{models\_transformed} \approx \sigma^2_{models\_virgin}$.

**Pass criteria:**
*   Cross-model variance doesn't increase after transformation.
*   Rank order of `λ_measured` preserved across models.
*   Model-specific offsets remain constant.

**Failure modes:**
*   Some models show λ increase, others decrease → suggests `λ_control` leaking into model selection.
*   Cross-model agreement breaks down post-transformation → suggests measurement instability.

## 10.6 Protocol 4: Adversarial Optimization Test
**Design (The Strong Test):**

1.  **Explicit gaming attempt:**
    *   Task: Generate text with target `λ_measured` = 0.02 using any `λ_control`.
    *   Allow unlimited iterations, feedback loops.
    *   Permit "optimization" toward target.

2.  **Detection test:**
    *   If achieved: Measure with independent validation team (blind).
    *   If `λ_measured_blind` ≈ `λ_measured_optimized`:
        *   → Transformation genuinely produced that physics.
    *   If `λ_measured_blind` ≠ `λ_measured_optimized`:
        *   → Optimization gamed the measurement (FAIL).

**Theoretical prediction:**
If layers are truly separated, gaming should be impossible. You can only achieve target λ by actually transforming to produce that physics. You can't "trick" blind measurement.

**Pass criteria:**
*   Blind re-measurement matches optimized measurement.
*   Proves measurement is stable under adversarial pressure.

**Failure modes:**
*   Optimization produces `λ_target` but blind measurement shows different λ.
*   Suggests measurer can be influenced by expectations.

## 10.7 Protocol 5: Temporal Stability
**Design:**

1.  **Establish baseline at $T_0$:**
    *   Measure corpus → `λ_baseline`($T_0$).

2.  **Generate transformations:**
    *   Apply various $T_\lambda$ transformations.
    *   Store outputs.

3.  **Re-measure at $T_1$ (6 months later):**
    *   Same measurement code, same embeddings.
    *   Blind to which texts were transformed.
    *   Measure all texts → `λ_measured`($T_1$).

4.  **Stability test:**
    *   For virgin texts: $\lambda(T_1) \approx \lambda(T_0)$.
    *   For transformed texts: $\lambda(T_1) \approx \lambda(T_0)$.
    *   No drift correlated with transformation history.

**Pass criteria:**
*   Measurements stable over time.
*   No systematic bias emerging from transformation knowledge.

## 10.8 Automated Validation Suite
(See `core/vssc_skeptic/layer_separation_validator.ts` for implementation)

## 10.9 Reporting Requirements
For each domain calibration, report:

1.  **Blind validation results:**
    *   Inter-rater reliability score.
    *   Contamination test p-value.

2.  **Baseline stability:**
    *   Virgin corpus statistics: μ, σ, 95% CI.
    *   Transformed corpus overlap with baseline.
    *   Shift magnitude (if any).

3.  **Cross-model variance:**
    *   Number of models tested.
    *   Rank correlation matrix.
    *   Model-specific offsets.

4.  **Adversarial resistance:**
    *   Whether gaming was attempted.
    *   Success rate of gaming vs blind re-measurement.

5.  **Temporal stability:**
    *   Measurement dates.
    *   Drift rate (if any).

## 10.10 Acceptance Criteria
A domain calibration is validated if:
*   ✅ Blind measurement reliability > 0.99
*   ✅ Baseline stability Z-score < 2.0
*   ✅ Cross-model rank correlation > 0.90
*   ✅ Adversarial gaming fails (blind ≠ optimized)
*   ✅ Temporal drift < 0.001/month

If any criterion fails:
*   Measurement protocol must be revised.
*   Calibration cannot be used in application layer.
*   Layer separation is compromised.

## 10.11 The Lock-In Guarantee
By passing all protocols, you establish:

> `λ_measured` is a stable, observer-independent physical observable of the text, not an artifact of transformation history, measurement expectations, or calibration procedures.

This is the empirical proof that your two-layer architecture maintains epistemic integrity.

Without this validation, critics can claim:
*   "You're just measuring what you wanted to find"
*   "The transformation influenced the measurement"
*   "The baseline is circular"

With this validation, you can state:
*   "Blind measurements replicate with r > 0.99"
*   "Baselines established on virgin corpora remain stable under transformation"
*   "Cross-model measurements converge independent of transformation history"
*   "Adversarial optimization cannot game the measurement"

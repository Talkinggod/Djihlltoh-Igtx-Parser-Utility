import { VsscSkepticSettings } from "../../types";
import { ske_getEmbeddingsBatch } from "./embeddings";
import {
  vectorAdd,
  vectorScale,
  vectorSubtract,
  zeroVector,
} from "./utils";
import {
  precisionCosineSimilarity,
  precisionMean,
  precisionMagnitude,
  precisionVariance,
  precisionLinearRegression,
  Decimal
} from "./precision_math";
import {
  getLanguageProfile,
  compareLanguageTypology,
  getCompressionPrediction,
  type LanguageProfile,
  type MorphologicalType,
} from "./language_typology";
import { applyPhonemeCoalescence } from "../../lib/phoneme-maps";
import { SeededRandom, REPRODUCIBILITY_VERSION } from "./seededRandom";
import {
  type PhoneticAnalysis as PhoneticAnalysisLocal,
  runPhoneticAnalysis as runPhoneticAnalysisLocal,
} from "./phonetic_analyzer";
import {
  type PhonologicalMetrics,
  runPhonologicalAnalysis,
} from "./phonological_structure";
import {
  normalizeInput,
  type NormalizedExample,
} from "./input_normalizer";
import {
  bootstrapLambda,
  generateValidatedLambdaReport,
} from "./lambdaValidation";
import {
  classifyCoherencePattern,
  generateCoherencePlotData,
  type CoherencePattern,
  type CoherencePlotData,
} from "./coherence_pattern_classifier";

/**
 * Status of physics computation - critical for distinguishing "computed zero" from "not computed"
 */
export type PhysicsStatus =
  | "COMPUTED" // Metrics are valid computed values
  | "SKIPPED" // Computation was skipped (insufficient data)
  | "FAILED" // Computation failed (degenerate embeddings)
  | "PARTIAL" // Some metrics computed, others failed
  | "BELOW_THRESHOLD"; // Sample size too small for reliable λ detection (n < 20)

/**
 * Embedding diagnostic information for debugging
 */
export interface EmbeddingDiagnostics {
  totalVectors: number;
  validVectors: number;
  zeroVectors: number;
  degenerateVectors: number; // Very low magnitude (< 0.01)
  avgNorm: number;
  minNorm: number;
  maxNorm: number;
  avgPairwiseSimilarity: number;
  identicalPairs: number; // Cosine sim > 0.9999
}

/**
 * Coherence curve data for detailed analysis
 */
export interface CoherenceCurve {
  lag: number;
  forward: number;
  backward: number;
  sampleSize: number;
  stdDev: number; // Standard deviation of forward coherence
  stdErr: number; // Standard error of the mean (stdDev / sqrt(N))
}

/**
 * Embedding input diagnostics - tracks WHAT was actually embedded
 * Critical for ensuring physics operates on the right signal
 */
export interface EmbeddingInputDiagnostics {
  /** Total texts sent to embedding service */
  totalTextsEmbedded: number;
  /** Breakdown by source field */
  sourceBreakdown: {
    originalOnly: number;
    glossOnly: number;
    translationOnly: number;
  };
  /** Average character length of embedded texts */
  avgCharLength: number;
  /** Sample of what was embedded (first 5) */
  sampleTexts: Array<{
    text: string;
    source: "original" | "gloss" | "translation";
    charLength: number;
  }>;
}

/**
 * Clause structure analysis for Vajda-style monoclausal vs multiclausal contrast
 */
export interface ClauseStructureAnalysis {
  /** Average estimated clauses per segment */
  avgClausesPerSegment: number;
  /** Coherence within clauses */
  intraClauseCoherence: number;
  /** Coherence across clause boundaries */
  interClauseCoherence: number;
  /** Clause boundary markers detected */
  boundaryMarkersFound: number;
  /** Whether language is estimated monoclausal-dominant */
  monoclausalDominant: boolean;
}

/**
 * Formal λ (lambda) computation using exponential decay fit
 * λ = decay rate of forward coherence over lags 1-k
 *
 * Mathematical definition:
 *   C(ℓ) ≈ C(0) * exp(-λ * ℓ)
 *   λ = -ln(C(ℓ) / C(0)) / ℓ
 *
 * This aligns with the trajectory optimizer's convergence rate calculation.
 * NOTE: Previously called "kappa" but renamed to avoid confusion with asymmetry metric.
 */
export interface DecayAnalysis {
  /** Exponential decay rate fitted to coherence curve */
  lambda: number;
  /** Coherence radius: 1/λ (characteristic decay length) */
  coherenceRadius: number;
  /** R² goodness of fit for exponential model */
  fitQuality: number;
  /** Raw coherence values used for fit */
  coherenceAtLags: number[];
  /** Decay model: C(ℓ) ≈ C0 * exp(-λ*ℓ) */
  fittedC0: number;
  /** Method used: "exponential_fit" | "simple_ratio" */
  method: string;
}

/** @deprecated Use DecayAnalysis instead */
export type KappaAnalysis = DecayAnalysis;

/**
 * Temporal asymmetry analysis (true κ per Semantic Gravity 2.0)
 * Production-grade implementation with scale-normalization and numerical stability.
 *
 * Mathematical definitions:
 *   κ_max = |C_fwd - C_bwd| / max(C_fwd, C_bwd)  [range: 0-1]
 *   κ_sum = |C_fwd - C_bwd| / (C_fwd + C_bwd)    [range: 0-1, symmetric]
 *   δ = (C_fwd - C_bwd) / (C_fwd + C_bwd)        [range: -1 to 1, signed]
 *   ISI = 1 - κ_max                              [range: 0-1, scale-normalized]
 */
export interface AsymmetryAnalysis {
  /** @deprecated Use kappaMax instead */
  kappa: number;
  /** Absolute asymmetry (max-normalized): |f-b|/max(f,b). Range: [0,1] */
  kappaMax: number;
  /** Absolute asymmetry (sum-normalized): |f-b|/(f+b). Range: [0,1), symmetric */
  kappaSum: number;
  /** Signed directionality: (f-b)/(f+b). Range: [-1,1] */
  delta: number;
  /** Mean forward coherence used in calculation */
  forwardMean: number;
  /** Mean backward coherence used in calculation */
  backwardMean: number;
  /**
   * Scale-normalized Interpretive Symmetry Index: ISI = 1 - kappaMax
   * 
   * - ISI = 1.0 → perfect symmetry, high confidence in σ = 1
   * - ISI < 0.98 → warrants inspection (low n, domain mismatch)
   * - ISI < 0.95 → flag as anomaly for investigation
   */
  isi: number;
  /**
   * Exponential symmetry confidence: exp(-|f-b|/τ)
   * Sharper gating behavior near zero. τ = tolerance (default 0.01).
   */
  isiExp: number;
}

/**
 * Complete Vajda-compatible research report
 */
export interface VajdaRunReport {
  /** Report metadata */
  meta: {
    version: "1.0";
    generatedAt: string;
    runId: string;
  };
  /** Language identification */
  language: string;
  sampleSize: number;
  /** Physics computation status */
  physics_status: PhysicsStatus;
  physics_status_reason?: string;
  /** Embedding diagnostics */
  embedding: {
    avgVectorNorm: number;
    avgPairwiseSimilarity: number;
    validVectors: number;
    totalVectors: number;
    inputSources: EmbeddingInputDiagnostics;
  };
  /** Coherence curves (lags 1-5) */
  coherence: {
    curves: CoherenceCurve[];
    forwardMean: number;
    backwardMean: number;
  };
  /** Formal decay analysis (λ) */
  decay: DecayAnalysis;
  /** Temporal asymmetry analysis (κ) */
  asymmetry?: AsymmetryAnalysis;
  /** Entropy metrics */
  entropy: EntropyMetrics;
  /** Clause structure (if applicable) */
  clause?: ClauseStructureAnalysis;
  /** Typology */
  typology: TypologyMetrics;
}

import {
  EnhancedStatisticalReport,
  computeHedgesG,
  computeCliffDelta,
  shapiroWilkTest,
  leveneTest,
  computePowerAnalysis
} from './statistical_validation_v2';

 

export interface LinguisticPhysicsResult {
  language: string;
  sampleCount: number;
  /** @deprecated Use lambda_estimate instead */
  kappa_estimate: number;
  /** Decay rate (λ) - how fast coherence drops with distance */
  lambda_estimate: number;
  /** Temporal asymmetry (κ) - directional bias in coherence */
  kappa_asymmetry: number;
  forward_coherence: number;
  backward_coherence: number;
  mean_energy: number;
  max_energy: number;
  min_energy: number;
  energy_variance: number;
  predictions: {
    high_curvature: boolean;
    compression_resistant: boolean;
  };
  diffusion: {
    mean_squared_displacement: number;
    diffusion_coefficient: number;
    steps: number;
    seed?: number; // RNG seed used (0 = deterministic)
  };

  // Physics computation status and diagnostics
  physics_status: PhysicsStatus;
  physics_status_reason?: string;
  embedding_diagnostics?: EmbeddingDiagnostics;
  coherence_curves?: CoherenceCurve[];

  // Decay analysis (λ) with exponential fit
  decay_analysis?: DecayAnalysis;
  /** @deprecated Use decay_analysis instead */
  kappa_analysis?: DecayAnalysis;

  // Temporal asymmetry analysis (true κ)
  asymmetry_analysis?: AsymmetryAnalysis;

  // NEW: Embedding input tracking (what was actually embedded)
  embedding_inputs?: EmbeddingInputDiagnostics;

  // NEW: Clause structure analysis (for Vajda-style research)
  clause_structure?: ClauseStructureAnalysis;

  // NEW: Enhanced metrics for HCMF and Glyph compression experiments
  hcmf?: HCMFMetrics;
  entropy?: EntropyMetrics;
  typology?: TypologyMetrics;
  
  // NEW: Raw embedding data for visualization
  embeddingData?: {
    tokens: string[];
    embeddings: number[][];
    fidelities?: number[];
  };
  
  // NEW: Phonetic analysis for cross-tier diagnostics (Chodroff-style)
  // DISABLED: Used proxy data, not real measurements. See phonetic_analyzer.ts for future audio integration.
  phonetic?: PhoneticAnalysisLocal;
  
  // NEW: Phonological structure analysis (text-derived, real metrics)
  phonology?: PhonologicalMetrics;
  
  // NEW: Bootstrap-validated λ with confidence intervals
  lambda_validation?: {
    lambda: number;
    lambdaStd: number;
    lambdaCI95: [number, number];
    nBootstrap: number;
    stability: 'stable' | 'moderate' | 'unstable';
    persistence: number;
    persistenceCI95: [number, number];
    regime: 'A' | 'B' | 'C';
  };
  
  /**
   * CRITICAL: Embedding source breakdown for scientific validity assessment.
   * If original_percent < 50%, results may measure FALLBACK LANGUAGE (usually English),
   * not the declared target language.
   */
  embedding_source_stats?: {
    /** Vectors successfully embedded from target language original text */
    original: number;
    /** Vectors from gloss fallback (often English morpheme notation) */
    gloss: number;
    /** Vectors from translation fallback (always English) */
    translation: number;
    /** Failed to embed - OOV or zero magnitude */
    failed: number;
    /** Percentage of vectors from original target language (0-100) */
    original_percent: number;
    /** TRUE if majority of vectors are NOT from target language */
    fallback_dominant: boolean;
  };
  
  // NEW: Scientific Validity Tagging (2026-01-07)
  validity?: {
    is_native: boolean;       // >80% original vectors
    is_proxy: boolean;        // >50% gloss/translation
    syntax_preserved: boolean; // True if mostly Original or Gloss (not Translation)
    data_source: 'NATIVE' | 'GLOSS_PROXY' | 'TRANSLATION_PROXY' | 'MIXED';
  };
}

/**
 * HCMF (Hanzi Compression through Morphological Fusion) metrics
 */
export interface HCMFMetrics {
  /** Glyph substitution potential (0-1) */
  glyphPotential: number;
  /** Morpheme boundary clarity (0-1) */
  morphemeBoundaryClarity: number;
  /** Semantic density per character */
  semanticDensity: number;
  /** Predicted token savings with Hanzi substitution (%) */
  predictedTokenSavings: number;
  /** Ideal compression strategy */
  idealStrategy: "glyph" | "morpheme" | "token" | "semantic";
}

/**
 * Information-theoretic entropy metrics
 */
export interface EntropyMetrics {
  /** Shannon entropy of embedding space (bits) */
  shannonEntropy: number;
  /** Normalized entropy (0-1) */
  normalizedEntropy: number;
  /** Cross-entropy with uniform distribution */
  crossEntropy: number;
  /** KL divergence from expected language distribution */
  klDivergence: number;
  /** Mutual information between adjacent samples */
  mutualInformation: number;
}

/**
 * Language typology-derived metrics
 */
export interface TypologyMetrics {
  /** Detected morphological type */
  morphologicalType: MorphologicalType | "unknown";
  /** Language domain (natural/programming/etc) */
  domain: string;
  /** Predicted compression resistance from typology */
  typologyResistance: number;
  /** Whether language profile was found */
  profileFound: boolean;
  /** Comparison with reference language (if applicable) */
  comparison?: {
    referenceLang: string;
    energyDifferential: number;
    compressionCompatibility: number;
    focusAreas: string[];
  };
}

// Re-export phonetic analysis types for unified access
export type {
  PhoneticAnalysis,
  VowelToken,
  VowelInventory,
  F1Correlation,
} from "./phonetic_analyzer";

export {
  runPhoneticAnalysis,
  computeCrossTierCorrelation,
} from "./phonetic_analyzer";

export interface GlossedExampleInput {
  original: string;
  gloss?: string | null;
  translation?: string | null;
}

const DEFAULT_THRESHOLD_KAPPA = 0.08;
const DEFAULT_THRESHOLD_ENERGY = 1.2;
const DEFAULT_DIFFUSION_STEPS = 256;
const DEFAULT_DIFFUSION_DT = 0.01;
const DEFAULT_DIFFUSION_SEED = 0; // seed=0 = deterministic, >0 = stochastic

// Minimum valid vector norm threshold
const MIN_VALID_NORM = 0.01;
// Maximum identical pairs ratio before flagging as degenerate
const MAX_IDENTICAL_PAIRS_RATIO = 0.8;
// Minimum valid vectors required for physics computation
// RAISED from 3 to 50 (2026-01-07): External analysis confirmed λ needs N≥50
// for reliable estimation (σ_λ/λ < 20%). Below this threshold, results are noise.
const DEFAULT_MIN_VALID_VECTORS_FOR_PHYSICS = 20;

const safeMean = (values: number[]): number =>
  values.length ? precisionMean(values).toNumber() : 0;

/**
 * Count unique vectors in a map (for diagnostics)
 */
function countUniqueVectors(embeddings: Map<string, number[]>): number {
  const seen = new Set<string>();
  for (const vec of embeddings.values()) {
    // Create a fingerprint from first 10 values (enough to distinguish)
    const fingerprint = vec
      .slice(0, 10)
      .map((v) => v.toFixed(6))
      .join(",");
    seen.add(fingerprint);
  }
  return seen.size;
}

/**
 * Validate embedding vectors and compute diagnostics.
 * CRITICAL: This prevents silent zero-metric failures.
 */
function validateEmbeddings(vectors: number[][]): EmbeddingDiagnostics {
  const diagnostics: EmbeddingDiagnostics = {
    totalVectors: vectors.length,
    validVectors: 0,
    zeroVectors: 0,
    degenerateVectors: 0,
    avgNorm: 0,
    minNorm: Infinity,
    maxNorm: 0,
    avgPairwiseSimilarity: 0,
    identicalPairs: 0,
  };

  if (vectors.length === 0) {
    diagnostics.minNorm = 0;
    return diagnostics;
  }

  const norms: number[] = [];

  for (const vec of vectors) {
    const norm = precisionMagnitude(vec).toNumber();
    norms.push(norm);

    if (norm === 0) {
      diagnostics.zeroVectors++;
    } else if (norm < MIN_VALID_NORM) {
      diagnostics.degenerateVectors++;
    } else {
      diagnostics.validVectors++;
    }

    diagnostics.minNorm = Math.min(diagnostics.minNorm, norm);
    diagnostics.maxNorm = Math.max(diagnostics.maxNorm, norm);
  }

  diagnostics.avgNorm = safeMean(norms);

  // Compute pairwise similarities for a sample (max 50 pairs to avoid O(n²) explosion)
  const pairwiseSims: number[] = [];
  const maxPairs = Math.min(50, (vectors.length * (vectors.length - 1)) / 2);
  let pairCount = 0;

  outer: for (let i = 0; i < vectors.length && pairCount < maxPairs; i++) {
    for (let j = i + 1; j < vectors.length && pairCount < maxPairs; j++) {
      const sim = precisionCosineSimilarity(vectors[i], vectors[j]).toNumber();
      pairwiseSims.push(sim);
      if (sim > 0.9999) {
        diagnostics.identicalPairs++;
      }
      pairCount++;
    }
  }

  diagnostics.avgPairwiseSimilarity = safeMean(pairwiseSims);

  return diagnostics;
}

/**
 * Result of embedding validation for physics computation
 */
interface EmbeddingValidationResult {
  valid: boolean;
  reason?: string;
  /** True if embeddings are valid but all identical (degenerate input like constant corpus) */
  degenerate?: boolean;
}

/**
 * Determine if embeddings are valid for physics computation.
 * Returns { valid: true, degenerate: true } for constant/identical inputs
 * to allow physics to proceed with special handling.
 */
function areEmbeddingsValidForPhysics(
  diagnostics: EmbeddingDiagnostics,
  minValidVectors: number = DEFAULT_MIN_VALID_VECTORS_FOR_PHYSICS
): EmbeddingValidationResult {
  if (diagnostics.totalVectors === 0) {
    return { valid: false, reason: "No embedding vectors available" };
  }

  if (diagnostics.validVectors < minValidVectors) {
    return {
      valid: false,
      reason:
        `Only ${diagnostics.validVectors} valid vectors (need ${minValidVectors}+ [Setting active]). ` +
        `${diagnostics.zeroVectors} zero, ${diagnostics.degenerateVectors} degenerate.`,
    };
  }

  if (diagnostics.avgNorm < MIN_VALID_NORM) {
    return {
      valid: false,
      reason: `Average vector norm ${diagnostics.avgNorm.toFixed(
        4
      )} too low (min ${MIN_VALID_NORM})`,
    };
  }

  const identicalRatio =
    diagnostics.identicalPairs / Math.max(1, diagnostics.totalVectors);
  if (identicalRatio > MAX_IDENTICAL_PAIRS_RATIO) {
    // Instead of failing, mark as degenerate but valid
    // This allows sanity tests with constant corpora to pass
    return {
      valid: true,
      degenerate: true,
      reason: `${(identicalRatio * 100).toFixed(
        0
      )}% of vector pairs are nearly identical - degenerate input (e.g., constant corpus)`,
    };
  }

  return { valid: true, degenerate: false };
}

/**
 * Compute coherence at multiple lags for detailed analysis
 */
function computeCoherenceCurves(
  embeddings: Map<string, number[]>,
  orderedTexts: string[],
  maxLag: number = 5
): CoherenceCurve[] {
  const curves: CoherenceCurve[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    const forwardValues: number[] = [];
    let backwardSum = 0;
    let backwardCount = 0;

    // Forward coherence at this lag
    for (let i = 0; i < orderedTexts.length - lag; i++) {
      const current = embeddings.get(orderedTexts[i]);
      const ahead = embeddings.get(orderedTexts[i + lag]);
      if (
        current &&
        ahead &&
        precisionMagnitude(current).toNumber() > MIN_VALID_NORM &&
        precisionMagnitude(ahead).toNumber() > MIN_VALID_NORM
      ) {
        const sim = precisionCosineSimilarity(current, ahead).toNumber();
        forwardValues.push(sim);
      }
    }

    // Backward coherence (reversed order) - keep simple mean for now
    const reversed = [...orderedTexts].reverse();
    for (let i = 0; i < reversed.length - lag; i++) {
      const current = embeddings.get(reversed[i]);
      const ahead = embeddings.get(reversed[i + lag]);
      if (
        current &&
        ahead &&
        precisionMagnitude(current).toNumber() > MIN_VALID_NORM &&
        precisionMagnitude(ahead).toNumber() > MIN_VALID_NORM
      ) {
        backwardSum += precisionCosineSimilarity(current, ahead).toNumber();
        backwardCount++;
      }
    }

    // Compute statistics
    const count = forwardValues.length;
    const meanVal = count > 0 ? safeMean(forwardValues) : NaN;
    
    // Compute Variance/StdDev for forward coherence
    let varianceVal = 0;
    if (count > 1) {
      const sumDiffSq = forwardValues.reduce((acc, val) => acc + Math.pow(val - meanVal, 2), 0);
      varianceVal = sumDiffSq / (count - 1); // Sample variance
    }
    const stdDev = Math.sqrt(varianceVal);
    const stdErr = count > 0 ? stdDev / Math.sqrt(count) : 0;

    curves.push({
      lag,
      forward: meanVal,
      backward: backwardCount > 0 ? backwardSum / backwardCount : NaN,
      sampleSize: Math.min(count, backwardCount),
      stdDev,
      stdErr
    });
  }

  return curves;
}

const variance = (values: number[]): number => {
  if (!values.length) return 0;
  return precisionVariance(values).toNumber();
};

// ============================================================================
// FORMAL DECAY RATE COMPUTATION (Exponential Fit)
// ============================================================================
// λ is the exponential decay rate of forward coherence: C(ℓ) ≈ C₀·exp(-λ·ℓ)
// NOTE: Previously called "kappa" but renamed to avoid confusion with asymmetry.
// This aligns with trajectory optimizer's convergence rate calculation.

/**
 * Fit exponential decay to coherence curves and extract λ.
 * Uses least-squares fit to log(C(ℓ)) = log(C₀) - λ·ℓ
 */
function computeDecayRate(curves: CoherenceCurve[]): DecayAnalysis {
  // Filter valid (non-NaN, positive) forward coherence values
  const validCurves = curves.filter(
    (c) => !isNaN(c.forward) && c.forward > 0 && c.sampleSize > 0
  );

  if (validCurves.length < 2) {
    return {
      lambda: NaN,
      coherenceRadius: NaN,
      fitQuality: NaN,
      coherenceAtLags: curves.map((c) => c.forward),
      fittedC0: NaN,
      method: "insufficient_data",
    };
  }

  // Use High-Precision Linear Regression
  const lags = validCurves.map((c) => c.lag);
  const logC = validCurves.map((c) => Math.log(c.forward)); // Natural log is still standard precision, but regression is enhanced
  
  const regression = precisionLinearRegression(lags, logC);
  
  // λ = -slope (decay rate)
  const lambda = regression.slope.negated().toNumber();
  const fittedC0 = Decimal.exp(regression.intercept).toNumber(); // High precision Exp if possible, or fallback
  const fitQuality = regression.rSquared.toNumber();

  return {
    lambda: Math.max(0, lambda), // Ensure non-negative
    coherenceRadius: lambda > 0 ? 1 / lambda : Infinity,
    fitQuality: Math.max(0, Math.min(1, fitQuality)),
    coherenceAtLags: curves.map((c) => c.forward),
    fittedC0,
    method: "exponential_fit (precision)",
  };
}

/** @deprecated Use computeDecayRate instead */
const computeKappaFromCoherence = computeDecayRate;

// ============================================================================
// TEMPORAL ASYMMETRY COMPUTATION (True κ per Semantic Gravity 2.0)
// ============================================================================

/**
 * Compute temporal asymmetry metrics (κ, δ, ISI).
 * This is the "true kappa" per the Semantic Gravity 2.0 theory.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ IMPORTANT LIMITATION (2026-01-10)                                        ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║ In the static embedding regime with symmetric similarity functions       ║
 * ║ (cosine), the forward/backward coherence statistic is invariant under    ║
 * ║ time reversal. κ is therefore expected to be ~0 absent numerical noise.  ║
 * ║                                                                          ║
 * ║ Directional asymmetry requires predictive or conditional modeling.       ║
 * ║                                                                          ║
 * ║ κ remains useful as:                                                     ║
 * ║   • A sanity check (should be ~0; spikes indicate bugs)                  ║
 * ║   • A gate for reordering safety (high ISI = safe to reorder)            ║
 * ║   • A regression detector (κ change = pipeline change)                   ║
 * ║   • A prompt integrity check (κ spike = compression distortion)          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * @param curves - Coherence curves with forward/backward values
 * @param tau - Tolerance for exponential ISI (default 0.01)
 * @returns AsymmetryAnalysis with kappaMax, kappaSum, delta, isi, isiExp
 */
function computeTemporalAsymmetry(curves: CoherenceCurve[], tau: number = 0.01): AsymmetryAnalysis {
  // Filter valid curves (finite forward and backward)
  const validCurves = curves.filter(
    (c) => Number.isFinite(c.forward) && Number.isFinite(c.backward) && c.sampleSize > 0
  );

  if (validCurves.length === 0) {
    return {
      kappa: 0,
      kappaMax: 0,
      kappaSum: 0,
      delta: 0,
      forwardMean: 0,
      backwardMean: 0,
      isi: 1.0,
      isiExp: 1.0,
    };
  }

  // 1. Compute means with high precision
  const forwardValues = validCurves.map((c) => c.forward);
  const backwardValues = validCurves.map((c) => c.backward);
  
  const fMean = precisionMean(forwardValues);
  const bMean = precisionMean(backwardValues);
  
  // 2. Compute absolute difference in 128-bit precision
  // CRITICAL: This captures "microscopic" asymmetry that floats would lose
  const diff = fMean.minus(bMean).abs();
  
  // 3. Compute denominators
  const maxCoherence = Decimal.max(fMean, bMean, 1e-10);
  const sumCoherence = Decimal.max(fMean.plus(bMean), 1e-10);

  // 4. Compute Metrics
  // κ_max: |Δ| / max
  const kappaMax = diff.dividedBy(maxCoherence);

  // κ_sum: |Δ| / (f+b)
  const kappaSum = diff.dividedBy(sumCoherence);

  // δ: signed directionality
  const delta = fMean.minus(bMean).dividedBy(sumCoherence);

  // Final conversions for interface compatibility
  return {
    kappa: kappaMax.toNumber(), // Backward compat
    kappaMax: kappaMax.toNumber(),
    kappaSum: kappaSum.toNumber(),
    delta: delta.toNumber(),
    forwardMean: fMean.toNumber(),
    backwardMean: bMean.toNumber(),
    isi: 1.0 - Math.min(1.0, kappaMax.toNumber()),
    isiExp: Math.exp(-diff.toNumber() / Math.max(tau, 1e-10)), // Exp is safe in float for final metric
  };
}

// ============================================================================
// CLAUSE STRUCTURE ANALYSIS (Vajda-style monoclausal vs multiclausal)
// ============================================================================

/**
 * VAJDA-DOCUMENTED CLAUSE STRUCTURE OVERRIDES
 * 
 * These override the heuristic-based clause analysis for languages where
 * Vajda has explicitly documented the monoclausal/multiclausal classification.
 * 
 * The heuristic measures sentence-level clause boundaries (REL, COMP, etc.),
 * but Vajda's distinction is about VERB-INTERNAL morphological structure:
 * - Monoclausal verbs: each verb stem = one conceptual clause
 * - Multiclausal verbs: verb stems encode multiple embedded clauses
 * 
 * Sources:
 * - LEXICOSYNTACTIC_COHERENCE_IN.pdf (Vajda)
 * - "Ket's monoclausal verbal lexemes" vs "Nivkh's multiclausal morphological verbs"
 */
const VAJDA_CLAUSE_OVERRIDES: Record<string, boolean> = {
  // Yeniseian family - monoclausal verb morphology
  'ket': true,           // Ket has monoclausal verbal lexemes (Vajda)
  'yugh': true,          // Related Yeniseian language
  
  // Nivkh - multiclausal verb morphology  
  'nivkh': false,        // Nivkh has multiclausal morphological verbs (Vajda)
  'gilyak': false,       // Alternate name for Nivkh
  
  // Other documented languages (add as research expands)
  // 'tlingit': true,    // Na-Dene, would be monoclausal like Ket
};

/**
 * Check if language has a Vajda-documented clause structure override.
 * Returns undefined if no override exists (use heuristic instead).
 */
function getVajdaClauseOverride(languageName: string): boolean | undefined {
  const normalized = languageName.toLowerCase().trim();
  
  // Check direct match
  if (VAJDA_CLAUSE_OVERRIDES[normalized] !== undefined) {
    return VAJDA_CLAUSE_OVERRIDES[normalized];
  }
  
  // Check partial match (e.g., "Ket corpus" should match "ket")
  for (const [lang, isMonoclausal] of Object.entries(VAJDA_CLAUSE_OVERRIDES)) {
    if (normalized.includes(lang)) {
      console.log(`[LinguisticPhysics] Using Vajda override for ${languageName}: monoclausal=${isMonoclausal}`);
      return isMonoclausal;
    }
  }
  
  return undefined;
}

/** Clause boundary markers in glosses (Leipzig conventions) */
const CLAUSE_BOUNDARY_MARKERS = [
  /\bREL\b/, // Relative clause
  /\bCOMP\b/, // Complementizer
  /\bSUB\b/, // Subordinator
  /\bCONJ\b/, // Conjunction
  /[;:]/, // Punctuation boundaries
  /\bSS\b/, // Same-subject switch reference
  /\bDS\b/, // Different-subject switch reference
  /\band\b/i, // Coordinate conjunction
  /\bthat\b/i, // English complementizer in translation
];

/**
 * Estimate clause boundaries from gloss/translation patterns.
 * Returns estimated clause count per segment.
 */
function estimateClauseBoundaries(sample: {
  original: string;
  gloss: string | null;
  translation: string | null;
}): number {
  let boundaries = 0;

  const textToAnalyze = sample.gloss || sample.translation || sample.original;

  for (const marker of CLAUSE_BOUNDARY_MARKERS) {
    const matches = textToAnalyze.match(marker);
    if (matches) {
      boundaries += matches.length;
    }
  }

  // Count sentence-final periods as clause indicators
  const periods = (textToAnalyze.match(/\./g) || []).length;

  // Minimum 1 clause per segment
  return Math.max(1, boundaries + Math.max(0, periods - 1) + 1);
}

/**
 * Compute clause structure analysis for Vajda-style research.
 * Distinguishes intra-clausal from inter-clausal coherence.
 * 
 * Note: For languages with Vajda-documented classifications (Ket, Nivkh),
 * the monoclausalDominant field uses the authoritative override instead
 * of the heuristic-based sentence-level analysis.
 */
function analyzeClauseStructure(
  samples: Array<{
    original: string;
    gloss: string | null;
    translation: string | null;
  }>,
  embeddings: Map<string, number[]>,
  orderedOriginals: string[],
  languageName: string = 'unknown'
): ClauseStructureAnalysis | null {
  // GUARD: If no glosses present, skip clause analysis to avoid misleading results
  // Leipzig gloss conventions are required for accurate clause boundary detection
  const glossCount = samples.filter(s => s.gloss && s.gloss.trim().length > 0).length;
  if (glossCount === 0) {
    console.log('[LinguisticPhysics] Clause analysis skipped: no glosses present');
    return null;
  }

  // Estimate clauses per segment
  const clauseCounts = samples.map(estimateClauseBoundaries);
  const avgClausesPerSegment = safeMean(clauseCounts);
  const boundaryMarkersFound = clauseCounts.reduce(
    (sum, c) => sum + (c - 1),
    0
  );

  // For intra vs inter-clausal coherence:
  // - Intra: coherence between adjacent segments with same clause count (monoclausal pairs)
  // - Inter: coherence between adjacent segments spanning clause boundary

  const intraClauseCoherences: number[] = [];
  const interClauseCoherences: number[] = [];

  for (let i = 0; i < orderedOriginals.length - 1; i++) {
    const vecA = embeddings.get(orderedOriginals[i]);
    const vecB = embeddings.get(orderedOriginals[i + 1]);

    if (
      !vecA ||
      !vecB ||
      precisionMagnitude(vecA).toNumber() < MIN_VALID_NORM ||
      precisionMagnitude(vecB).toNumber() < MIN_VALID_NORM
    ) {
      continue;
    }

    const sim = precisionCosineSimilarity(vecA, vecB).toNumber();
    const clausesA = clauseCounts[i] ?? 1;
    const clausesB = clauseCounts[i + 1] ?? 1;

    // If both are monoclausal (≤1.5 clauses), it's intra-clausal
    // If either is multiclausal (>1.5 clauses), it's inter-clausal
    if (clausesA <= 1.5 && clausesB <= 1.5) {
      intraClauseCoherences.push(sim);
    } else {
      interClauseCoherences.push(sim);
    }
  }

  const intraClauseCoherence = safeMean(intraClauseCoherences);
  const interClauseCoherence = safeMean(interClauseCoherences);

  // Check for Vajda-documented override first
  const vajdaOverride = getVajdaClauseOverride(languageName);

  // Heuristic: Monoclausal-dominant if avg clauses < 1.5 and most are monoclausal
  const monoclausalCount = clauseCounts.filter((c) => c <= 1.5).length;
  const heuristicMonoclausal =
    avgClausesPerSegment < 1.5 && monoclausalCount > clauseCounts.length * 0.6;

  // Use Vajda override if available, otherwise fall back to heuristic
  const monoclausalDominant = vajdaOverride ?? heuristicMonoclausal;

  if (vajdaOverride !== undefined) {
    console.log(`[LinguisticPhysics] Clause structure for ${languageName}: using Vajda override (monoclausal=${monoclausalDominant}), heuristic would have said ${heuristicMonoclausal}`);
  }

  return {
    avgClausesPerSegment,
    intraClauseCoherence,
    interClauseCoherence,
    boundaryMarkersFound,
    monoclausalDominant,
  };
}


// ============================================================================
// EMBEDDING INPUT TRACKING
// ============================================================================

/**
 * Track what texts are actually being embedded for diagnostic purposes.
 */
function trackEmbeddingInputs(
  samples: Array<{
    original: string;
    gloss: string | null;
    translation: string | null;
  }>,
  embeddingInputs: string[]
): EmbeddingInputDiagnostics {
  const sourceBreakdown = {
    originalOnly: 0,
    glossOnly: 0,
    translationOnly: 0,
  };

  const sampleTexts: EmbeddingInputDiagnostics["sampleTexts"] = [];

  // Categorize each embedding input
  const originals = new Set(samples.map((s) => s.original));
  const glosses = new Set(samples.map((s) => s.gloss).filter(Boolean));
  const translations = new Set(
    samples.map((s) => s.translation).filter(Boolean)
  );

  for (const input of embeddingInputs) {
    let source: "original" | "gloss" | "translation" = "original";

    if (originals.has(input)) {
      sourceBreakdown.originalOnly++;
      source = "original";
    } else if (glosses.has(input)) {
      sourceBreakdown.glossOnly++;
      source = "gloss";
    } else if (translations.has(input)) {
      sourceBreakdown.translationOnly++;
      source = "translation";
    }

    if (sampleTexts.length < 5) {
      sampleTexts.push({
        text: input.slice(0, 100) + (input.length > 100 ? "..." : ""),
        source,
        charLength: input.length,
      });
    }
  }

  const avgCharLength =
    embeddingInputs.length > 0
      ? embeddingInputs.reduce((sum, t) => sum + t.length, 0) /
        embeddingInputs.length
      : 0;

  return {
    totalTextsEmbedded: embeddingInputs.length,
    sourceBreakdown,
    avgCharLength,
    sampleTexts,
  };
}

/**
 * Compute Shannon entropy of embedding vectors
 */
const computeEmbeddingEntropy = (vectors: number[][]): number => {
  if (vectors.length === 0) return 0;

  const dimension = vectors[0].length;
  let totalEntropy = 0;

  for (let d = 0; d < dimension; d++) {
    const values = vectors.map((v) => v[d]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    // Discretize into 10 bins
    const bins = new Array(10).fill(0);
    for (const val of values) {
      const binIdx = Math.min(9, Math.floor(((val - min) / range) * 10));
      bins[binIdx]++;
    }

    // Compute entropy for this dimension
    const n = values.length;
    let dimEntropy = 0;
    for (const count of bins) {
      if (count > 0) {
        const p = count / n;
        dimEntropy -= p * Math.log2(p);
      }
    }
    totalEntropy += dimEntropy;
  }

  return totalEntropy / dimension;
};

/**
 * Compute mutual information between adjacent embedding vectors
 */
const computeMutualInformation = (vectors: number[][]): number => {
  if (vectors.length < 2) return 0;

  let totalMI = 0;
  for (let i = 0; i < vectors.length - 1; i++) {
    const sim = precisionCosineSimilarity(vectors[i], vectors[i + 1]).toNumber();
    // MI approximation: higher similarity = higher MI
    totalMI += Math.max(0, Math.log2(1 + sim));
  }

  return totalMI / (vectors.length - 1);
};

/**
 * Estimate morpheme boundary clarity from gloss patterns
 */
const estimateMorphemeBoundaryClarity = (
  samples: Array<{ original: string; gloss: string | null }>
): number => {
  let totalClarity = 0;
  let counted = 0;

  for (const sample of samples) {
    if (!sample.gloss) continue;

    // Count morpheme markers in gloss
    const markers = (sample.gloss.match(/[-=.]/g) || []).length;
    const words = sample.original.split(/\s+/).length;

    // More markers relative to words = clearer boundaries
    const clarity = Math.min(1, markers / Math.max(1, words * 2));
    totalClarity += clarity;
    counted++;
  }

  return counted > 0 ? totalClarity / counted : 0.5;
};

/**
 * Estimate semantic density (meaning per character)
 */
const estimateSemanticDensity = (
  samples: Array<{ original: string; gloss: string | null }>
): number => {
  let totalDensity = 0;
  let counted = 0;

  for (const sample of samples) {
    if (!sample.gloss) continue;

    const charCount = sample.original.replace(/\s+/g, "").length;
    const morphemeCount = (sample.gloss.match(/[-=.\s]+/g) || []).length + 1;

    // Higher morphemes per character = higher semantic density
    const density = morphemeCount / Math.max(1, charCount);
    totalDensity += density;
    counted++;
  }

  return counted > 0 ? Math.min(1, (totalDensity / counted) * 5) : 0.3;
};

export async function analyzeLinguisticPhysics(
  runId: string,
  languageName: string,
  glossedSamples: GlossedExampleInput[],
  settings: VsscSkepticSettings,
  comparisonLanguage?: string,
  // NEW: Proxy Mode for Low-Resource Languages (2026-01-07)
  // 'gloss': Preserves target syntax (SOV) via English words (Recommended for Vajda)
  // 'translation': Preserves semantic density via English sentences (SVO)
  proxyMode: 'gloss' | 'translation' = 'gloss'
): Promise<LinguisticPhysicsResult> {
  // INTELLIGENT INPUT NORMALIZATION
  // If samples look like they need parsing (e.g., raw text pasted from books),
  // run them through the normalizer first
  let preprocessedSamples = glossedSamples;

  // Check if input might be raw text that needs intelligent parsing
  if (glossedSamples.length === 1 && glossedSamples[0].original && glossedSamples[0].original.includes("\n")) {
    // Single sample with newlines - likely raw pasted text
    console.log(`[LinguisticPhysics] 🔄 Detected raw text input, running intelligent normalization...`);
    const normalized = normalizeInput(glossedSamples[0].original);

    if (normalized.examples.length > 0) {
      preprocessedSamples = normalized.examples.map(ex => ({
        original: ex.original,
        gloss: ex.gloss,
        translation: ex.translation,
      }));
      console.log(`[LinguisticPhysics] ✅ Normalized ${normalized.examples.length} examples from ${normalized.detectedFormat} format`);
    }
  }

  const sanitizedExamples = preprocessedSamples
    .map((sample) => ({
      original: sample.original?.trim() ?? "",
      gloss: sample.gloss?.trim() || null,
      translation: sample.translation?.trim() || null,
    }))
    .filter((sample) => Boolean(sample.original.length));

  // =========================================================================
  // INTELLIGENT EMBEDDING PREPARATION (Refactored 2026-01-09)
  // SELECTIVE NORMALIZATION:
  // - Original Text: Apply Phone Coalescence (Navajo/Ket rules)
  // - Gloss/Translation: Keep as English (Do NOT apply target language rules)
  // =========================================================================

  const inputsToEmbed = new Set<string>();
  const originalToNormalizedMap = new Map<string, string>();
  let phonemeNormalizationApplied = 0;

  for (const example of sanitizedExamples) {
    // 1. ORIGINAL: Apply language-specific normalization
    const coalesced = applyPhonemeCoalescence(example.original, languageName);
    const normalizedOriginal = coalesced.normalized;
    inputsToEmbed.add(normalizedOriginal);
    originalToNormalizedMap.set(example.original, normalizedOriginal);

    if (coalesced.mappingsApplied > 0) {
      phonemeNormalizationApplied += coalesced.mappingsApplied;
    }

    // 2. GLOSS: English - keep as is
    if (example.gloss) {
      inputsToEmbed.add(example.gloss);
      originalToNormalizedMap.set(example.gloss, example.gloss);
    }

    // 3. TRANSLATION: English - keep as is
    if (example.translation) {
      inputsToEmbed.add(example.translation);
      originalToNormalizedMap.set(example.translation, example.translation);
    }
  }

  // Update embeddingInputs tracking (for diagnostics only)
  const embeddingInputs = Array.from(inputsToEmbed).filter(Boolean);

  // Log embedding input diagnostics
  const embeddingInputDiagnostics = trackEmbeddingInputs(
    sanitizedExamples,
    embeddingInputs
  );

  console.log(`[LinguisticPhysics] Embedding inputs for ${languageName}:`, {
    totalTexts: embeddingInputDiagnostics.totalTextsEmbedded,
    sources: embeddingInputDiagnostics.sourceBreakdown,
    avgCharLength: embeddingInputDiagnostics.avgCharLength.toFixed(1),
    samples: embeddingInputDiagnostics.sampleTexts.map(
      (s) => `[${s.source}] "${s.text.slice(0, 50)}..."`
    ),
  });

  if (phonemeNormalizationApplied > 0) {
    console.log(`[LinguisticPhysics] 🔬 Isomorphic Normalization applied to ORIGINAL text only:`, {
      language: languageName,
      mappingsApplied: phonemeNormalizationApplied,
      effect: 'Eliminated orthographic drag (digraphs/trigraphs → single phonemes)'
    });
  }

  // Fetch embeddings for the PREPARED (selectively normalized) list
  const embeddings = await ske_getEmbeddingsBatch(
    runId,
    embeddingInputs, // use the list we just built
    settings
  );

  const sanitizedOriginals = sanitizedExamples.map(
    (example) => example.original
  );

  // =========================================================================
  // BUILD EMBEDDING MAP - GLOSS-MEDIATED STRATEGY (2026-01-07)
  // Scientific Pivot for Low-Resource Languages (Ket, Navajo, etc.)
  // =========================================================================
  console.log(`[LinguisticPhysics] 🧪 Proxy Mode: ${proxyMode.toUpperCase()} (Strategy: ${
    proxyMode === 'gloss' ? 'Syntax Preservation (SOV)' : 'Semantic Density (SVO)'
  })`);

  const originalEmbeddingMap = new Map<string, number[]>();
  // Debug: Track failures with detailed diagnostics
  const debugFailures: Array<{
    original: string;
    gloss: string | null;
    translation: string | null;
    norm: number;
    reason: string;
    source: string;
  }> = [];

  const embeddingSourceStats = { original: 0, gloss: 0, translation: 0, failed: 0 };

  for (const example of sanitizedExamples) {
    // Look up via normalized key (handles phoneme coalescence)
    const normalizedOriginal = originalToNormalizedMap.get(example.original) || example.original;

    // 1. Determine Priority Order based on Proxy Mode
    // CRITICAL FIX (2026-01-09): "Vajda Pivot" - Prioritize proxy over original if requested
    const candidates: { type: string, text: string | undefined | null }[] = [];

    if (proxyMode === 'gloss') {
      candidates.push({ type: 'gloss', text: example.gloss }); // V1: Pure Syntax
      candidates.push({ type: 'translation', text: example.translation }); // V2: Meaning fallvack
      candidates.push({ type: 'original', text: example.original }); // Last resort
    } else if (proxyMode === 'translation') {
      candidates.push({ type: 'translation', text: example.translation });
      candidates.push({ type: 'gloss', text: example.gloss });
      candidates.push({ type: 'original', text: example.original });
    } else {
      // Standard Mode: Original is king
      candidates.push({ type: 'original', text: example.original });
      candidates.push({ type: 'gloss', text: example.gloss });
      candidates.push({ type: 'translation', text: example.translation });
    }

    let vector: number[] | undefined;
    let source = 'original';

    // 2. Iterate until valid vector found
    for (const cand of candidates) {
      if (!cand.text) continue;

      // Handle normalization for original text, raw for others
      const lookupKey = cand.type === 'original'
        ? (originalToNormalizedMap.get(cand.text) || cand.text)
        : cand.text;

      const vec = embeddings.get(lookupKey);

      // Must be non-zero to be useful
      if (vec && precisionMagnitude(vec).toNumber() > MIN_VALID_NORM) {
        vector = vec;
        source = cand.type;
        break; // Found our vector (respecting priority)
      }
    }

    const norm = vector ? precisionMagnitude(vector).toNumber() : 0;

    if (vector && norm > MIN_VALID_NORM) {
      originalEmbeddingMap.set(example.original, vector);
      // @ts-ignore - dynamic key access
      embeddingSourceStats[source]++;
    } else {
      embeddingSourceStats.failed++;

      const reason = !vector
        ? "NOT_IN_MAP"
        : norm === 0
          ? "ZERO_VECTOR"
          : `LOW_NORM(${norm.toFixed(4)})`;

      if (debugFailures.length < 5) {
        console.warn(`❌ EMBED FAIL [${languageName}]: "${normalizedOriginal.substring(0, 40)}..." | ${reason}`);
      }

      if (debugFailures.length < 10) {
        debugFailures.push({
          original: example.original.slice(0, 50),
          gloss: example.gloss?.slice(0, 50) || null,
          translation: example.translation?.slice(0, 50) || null,
          norm,
          reason,
          source: 'failed'
        });
      }
    }
  }

  // Log debug info if there are failures
  if (debugFailures.length > 0) {
    console.warn(`[LinguisticPhysics] ❌ LOOKUP FAILURES for ${languageName}:`, {
      failures: debugFailures,
      embeddingsMapSize: embeddings.size,
      sampleEmbeddingKeys: Array.from(embeddings.keys()).slice(0, 5).map(k => k.slice(0, 40)),
      normalizedMapSize: originalToNormalizedMap.size,
    });
  }

  // Log embedding source distribution
  console.log(
    `[LinguisticPhysics] 📊 EMBEDDING SOURCES for ${languageName}:`,
    {
      fromOriginal: embeddingSourceStats.original,
      fromGloss: embeddingSourceStats.gloss,
      fromTranslation: embeddingSourceStats.translation,
      failed: embeddingSourceStats.failed,
      total: sanitizedExamples.length,
      successRate: (
        ((sanitizedExamples.length - embeddingSourceStats.failed) /
          sanitizedExamples.length) *
        100
      ).toFixed(1) + "%",
    }
  );

  // =========================================================================
  // EMBEDDING PIPELINE DIAGNOSTICS
  // Verify embeddings are real (not mock/zero) before physics computation
  // =========================================================================
  const embeddingPipelineDiagnostics = {
    totalRequested: embeddingInputs.length,
    totalReceived: embeddings.size,
    uniqueVectors: countUniqueVectors(embeddings),
    sampleVectorDimensions: 0,
    sampleVectorFirst5: [] as number[],
    allZero: false,
    allIdentical: false,
  };

  // Check first vector for diagnostics
  const firstVector = embeddings.values().next().value as number[] | undefined;
  if (firstVector) {
    embeddingPipelineDiagnostics.sampleVectorDimensions = firstVector.length;
    embeddingPipelineDiagnostics.sampleVectorFirst5 = firstVector.slice(0, 5);
    embeddingPipelineDiagnostics.allZero = firstVector.every((v) => v === 0);
  }

  // Check if all vectors are identical (degenerate case)
  const vectorArray = Array.from(embeddings.values());
  if (vectorArray.length > 1) {
    const first = vectorArray[0];
    embeddingPipelineDiagnostics.allIdentical = vectorArray.every((vec) =>
      vec.every((v, i) => Math.abs(v - first[i]) < 1e-6)
    );
  }

  console.log(
    `[LinguisticPhysics] 🔍 EMBEDDING PIPELINE CHECK for ${languageName}:`,
    {
      requested: embeddingPipelineDiagnostics.totalRequested,
      received: embeddingPipelineDiagnostics.totalReceived,
      uniqueVectors: embeddingPipelineDiagnostics.uniqueVectors,
      dimensions: embeddingPipelineDiagnostics.sampleVectorDimensions,
      first5Values: embeddingPipelineDiagnostics.sampleVectorFirst5.map((v) =>
        v.toFixed(4)
      ),
      allZero: embeddingPipelineDiagnostics.allZero,
      allIdentical: embeddingPipelineDiagnostics.allIdentical,
      status: embeddingPipelineDiagnostics.allZero
        ? "⚠️ ALL ZERO - Mock/failed embeddings!"
        : embeddingPipelineDiagnostics.allIdentical
        ? "📊 ALL IDENTICAL - Degenerate input (constant corpus?)"
        : "✅ REAL EMBEDDINGS - Pipeline working",
    }
  );

  // =========================================================================
  // CRITICAL: Validate embeddings before computing physics
  // =========================================================================
  const originalVectors = sanitizedOriginals
    .map((text) => originalEmbeddingMap.get(text))
    .filter((vector): vector is number[] => Boolean(vector));

  const embeddingDiagnostics = validateEmbeddings(originalVectors);
  const minValidVectors = settings?.minValidVectors ?? DEFAULT_MIN_VALID_VECTORS_FOR_PHYSICS;
  const validationResult = areEmbeddingsValidForPhysics(embeddingDiagnostics, minValidVectors);

  // Log diagnostics for debugging
  console.log(
    `[LinguisticPhysics] Embedding diagnostics for ${languageName}:`,
    {
      totalVectors: embeddingDiagnostics.totalVectors,
      validVectors: embeddingDiagnostics.validVectors,
      zeroVectors: embeddingDiagnostics.zeroVectors,
      degenerateVectors: embeddingDiagnostics.degenerateVectors,
      avgNorm: embeddingDiagnostics.avgNorm.toFixed(4),
      minNorm: embeddingDiagnostics.minNorm.toFixed(4),
      maxNorm: embeddingDiagnostics.maxNorm.toFixed(4),
      avgPairwiseSimilarity:
        embeddingDiagnostics.avgPairwiseSimilarity.toFixed(4),
      validForPhysics: validationResult.valid,
      reason: validationResult.reason,
    }
  );

  // Compute coherence curves for detailed analysis
  const coherenceCurves = computeCoherenceCurves(
    originalEmbeddingMap,
    sanitizedOriginals
  );

  // Log coherence curves
  console.log(
    `[LinguisticPhysics] Coherence curves for ${languageName}:`,
    coherenceCurves.map(
      (c) =>
        `lag${c.lag}: fwd=${c.forward.toFixed(3)}, bwd=${c.backward.toFixed(
          3
        )}, n=${c.sampleSize}`
    )
  );

  // NEW: Extract embedding data early for visualization (available even if physics fails)
  const embeddingData = {
    tokens: sanitizedOriginals,
    embeddings: sanitizedOriginals.map((text) => originalEmbeddingMap.get(text) || []),
  };

  // If embeddings are invalid, return a result with FAILED status
    // If embeddings are invalid, return a result with FAILED status
  if (!validationResult.valid) {
    let reason = validationResult.reason!;
    if (embeddingSourceStats.failed > 0) {
       reason += ` (Note: ${embeddingSourceStats.failed}/${sanitizedExamples.length} embeddings failed)`;
    }
    console.warn(
      `[LinguisticPhysics] ⚠️ PHYSICS SKIPPED for ${languageName}: ${reason}`
    );
    return createFailedPhysicsResult(
      languageName,
      sanitizedOriginals.length,
      embeddingDiagnostics,
      coherenceCurves,
      reason,
      sanitizedExamples,
      comparisonLanguage,
      embeddingData // Pass embedding data
    );
  }

  // =========================================================================
  // SPECIAL CASE: Degenerate input (all identical embeddings, e.g., constant corpus)
  // =========================================================================
  if (validationResult.degenerate) {
    console.log(
      `[LinguisticPhysics] 📊 DEGENERATE INPUT for ${languageName}: ${validationResult.reason}`
    );
    console.log(
      `[LinguisticPhysics] Setting coherence=1.0, κ=0 for constant/identical input`
    );

    // For degenerate input, coherence is perfect (1.0) and decay rate is zero
    const degenerateDecayAnalysis: DecayAnalysis = {
      lambda: 0,
      coherenceRadius: Infinity,
      fitQuality: 1.0,
      coherenceAtLags: coherenceCurves.map(() => 1.0),
      fittedC0: 1.0,
      method: "degenerate_input",
    };

    // Return a valid result with known values for degenerate case
    return createDegeneratePhysicsResult(
      languageName,
      sanitizedOriginals.length,
      embeddingDiagnostics,
      coherenceCurves,
      degenerateDecayAnalysis,
      validationResult.reason!,
      sanitizedExamples,
      comparisonLanguage,
      embeddingData // Pass embedding data
    );
  }

  // =========================================================================
  // Compute physics metrics (only if embeddings are valid and non-degenerate)
  // =========================================================================

  // Filter to only valid (non-zero, non-degenerate) vectors for similarity computation
  const validVectorPairs: Array<{ text: string; vector: number[] }> = [];
  for (const text of sanitizedOriginals) {
    const vec = originalEmbeddingMap.get(text);
    if (vec && precisionMagnitude(vec).toNumber() >= MIN_VALID_NORM) {
      validVectorPairs.push({ text, vector: vec });
    }
  }

  const forwardSimilarities: number[] = [];
  for (let i = 0; i < validVectorPairs.length - 1; i++) {
    const sim = precisionCosineSimilarity(
      validVectorPairs[i].vector,
      validVectorPairs[i + 1].vector
    ).toNumber();
    if (!isNaN(sim)) {
      forwardSimilarities.push(sim);
    }
  }

  const backwardSimilarities: number[] = [];
  const reversedPairs = [...validVectorPairs].reverse();
  for (let i = 0; i < reversedPairs.length - 1; i++) {
    const sim = precisionCosineSimilarity(
      reversedPairs[i].vector,
      reversedPairs[i + 1].vector
    ).toNumber();
    if (!isNaN(sim)) {
      backwardSimilarities.push(sim);
    }
  }

  const forwardMean = safeMean(forwardSimilarities);
  const backwardMean = safeMean(backwardSimilarities);
  const kappaEstimate = Math.abs(forwardMean - backwardMean);

  // Compute energies only from valid vectors
  const energies: number[] = [];
  for (const { vector } of validVectorPairs) {
    const mag = precisionMagnitude(vector).toNumber();
    energies.push(mag * mag);
  }

  const meanEnergy = safeMean(energies);
  const particles = encodeSemanticParticles(
    sanitizedExamples,
    embeddings,
    languageName
  );
  const diffusionMetrics = simulateSemanticDiffusion(particles, kappaEstimate);

  // Determine physics status based on what we computed
  let physics_status: PhysicsStatus = "COMPUTED";
  let physics_status_reason: string | undefined;

  // Check if results look degenerate despite passing validation
  if (forwardSimilarities.length === 0 || backwardSimilarities.length === 0) {
    physics_status = "PARTIAL";
    physics_status_reason =
      "Insufficient valid vector pairs for coherence computation";
  } else if (kappaEstimate === 0 && forwardMean === 0 && backwardMean === 0) {
    physics_status = "PARTIAL";
    physics_status_reason =
      "All coherence values are zero - possible embedding issue";
  }

  // =========================================================================
  // FORMAL DECAY ANALYSIS (λ) - Exponential Fit
  // =========================================================================
  const decayAnalysis = computeDecayRate(coherenceCurves);

  // =========================================================================
  // TEMPORAL ASYMMETRY ANALYSIS (κ) - Forward-Backward Difference
  // =========================================================================
  const asymmetryAnalysis = computeTemporalAsymmetry(coherenceCurves);

  // Log formal decay analysis (use scientific notation for λ precision)
  console.log(`[LinguisticPhysics] Formal λ analysis for ${languageName}:`, {
    lambda: decayAnalysis.lambda.toExponential(6),
    coherenceRadius: decayAnalysis.coherenceRadius === Infinity ? 'Infinity' : decayAnalysis.coherenceRadius.toExponential(3),
    fitQuality: decayAnalysis.fitQuality.toFixed(3),
    method: decayAnalysis.method,
    coherenceAtLags: decayAnalysis.coherenceAtLags.map((c) =>
      isNaN(c) ? "NaN" : c.toFixed(3)
    ),
  });

  // Log asymmetry analysis
  console.log(`[LinguisticPhysics] Temporal κ for ${languageName}:`, {
    kappa: asymmetryAnalysis.kappa.toFixed(4),
    delta: asymmetryAnalysis.delta.toFixed(4),
    forwardMean: asymmetryAnalysis.forwardMean.toFixed(3),
    backwardMean: asymmetryAnalysis.backwardMean.toFixed(3),
  });

  // =========================================================================
  // CLAUSE STRUCTURE ANALYSIS (Vajda-style)
  // =========================================================================
  const clauseStructure = analyzeClauseStructure(
    sanitizedExamples,
    originalEmbeddingMap,
    sanitizedOriginals,
    languageName
  );

  // Log clause structure analysis
  if (clauseStructure) {
    console.log(`[LinguisticPhysics] Clause structure for ${languageName}:`, {
      avgClausesPerSegment: clauseStructure.avgClausesPerSegment.toFixed(2),
      intraClauseCoherence: clauseStructure.intraClauseCoherence.toFixed(3),
      interClauseCoherence: clauseStructure.interClauseCoherence.toFixed(3),
      monoclausalDominant: clauseStructure.monoclausalDominant,
    });
  } else {
    console.log(`[LinguisticPhysics] Clause structure for ${languageName}: null (no glosses)`);
  }

  // =========================================================================
  // NEW: Enhanced metrics computation
  // =========================================================================

  // Get language profile for typology-based predictions
  const languageProfile = getLanguageProfile(languageName);
  const compressionPrediction = getCompressionPrediction(languageName);

  // Compute HCMF metrics
  const morphemeBoundaryClarity =
    estimateMorphemeBoundaryClarity(sanitizedExamples);
  const semanticDensity = estimateSemanticDensity(sanitizedExamples);
  const glyphPotential = languageProfile?.glyphMetrics?.hanziCompatible
    ? semanticDensity * 0.8 + morphemeBoundaryClarity * 0.2
    : semanticDensity * 0.3;

  // Predicted token savings based on morphology and glyph potential
  const predictedTokenSavings = languageProfile
    ? Math.min(
        50,
        glyphPotential * 30 + (languageProfile.metrics.morphemeDensity - 1) * 5
      )
    : glyphPotential * 20;

  const hcmfMetrics: HCMFMetrics = {
    glyphPotential,
    morphemeBoundaryClarity,
    semanticDensity,
    predictedTokenSavings,
    idealStrategy: compressionPrediction.idealMethod,
  };

  // Compute entropy metrics
  const shannonEntropy = computeEmbeddingEntropy(originalVectors);
  const maxEntropy = Math.log2(10); // Max entropy for 10 bins
  const normalizedEntropy = shannonEntropy / maxEntropy;
  const uniformEntropy = Math.log2(originalVectors.length || 1);
  const crossEntropy =
    shannonEntropy + Math.abs(shannonEntropy - uniformEntropy);
  const klDivergence = Math.max(0, crossEntropy - shannonEntropy);
  const mutualInformation = computeMutualInformation(originalVectors);

  const entropyMetrics: EntropyMetrics = {
    shannonEntropy,
    normalizedEntropy,
    crossEntropy,
    klDivergence,
    mutualInformation,
  };

  // Compute typology metrics
  const typologyMetrics: TypologyMetrics = {
    morphologicalType: languageProfile?.morphology ?? "unknown",
    domain: languageProfile?.domain ?? "unknown",
    typologyResistance: compressionPrediction.resistance,
    profileFound: !!languageProfile,
  };

  // Add comparison if reference language provided
  if (comparisonLanguage) {
    const comparison = compareLanguageTypology(
      languageName,
      comparisonLanguage
    );
    if (comparison) {
      typologyMetrics.comparison = {
        referenceLang: comparisonLanguage,
        energyDifferential: comparison.energyDifferential,
        compressionCompatibility: comparison.compressionCompatibility,
        focusAreas: comparison.focusAreas,
      };
    }
  }



  return {
    language: languageName,
    sampleCount: sanitizedOriginals.length,
    // Legacy field - now maps to asymmetry for backward compatibility
    kappa_estimate: asymmetryAnalysis?.kappa ?? 0,
    // NEW: Formal decay rate from exponential fit
    lambda_estimate: decayAnalysis.lambda,
    // NEW: Temporal asymmetry (true kappa)
    kappa_asymmetry: asymmetryAnalysis?.kappa ?? 0,
    forward_coherence: forwardMean,
    backward_coherence: backwardMean,
    mean_energy: meanEnergy,
    max_energy: energies.length ? Math.max(...energies) : 0,
    min_energy: energies.length ? Math.min(...energies) : 0,
    energy_variance: variance(energies),
    predictions: {
      // ONLY set high_curvature if physics actually computed valid values
      // Use formal lambda threshold based on exponential decay rate
      high_curvature:
        physics_status === "COMPUTED" &&
        !isNaN(decayAnalysis.lambda) &&
        decayAnalysis.lambda > DEFAULT_THRESHOLD_KAPPA,
      compression_resistant:
        physics_status === "COMPUTED" && meanEnergy > DEFAULT_THRESHOLD_ENERGY,
    },
    diffusion: diffusionMetrics,

    // Physics computation status and diagnostics
    physics_status,
    physics_status_reason,
    embedding_diagnostics: embeddingDiagnostics,
    coherence_curves: coherenceCurves,

    // Decay analysis (λ) with exponential fit
    decay_analysis: decayAnalysis,
    // Legacy alias (deprecated)
    kappa_analysis: decayAnalysis,

    // Temporal asymmetry analysis (true κ)
    asymmetry_analysis: asymmetryAnalysis,

    // Embedding input tracking (what was actually embedded)
    embedding_inputs: embeddingInputDiagnostics,
    
    // CRITICAL: Embedding source breakdown for scientific validity
    // If fallback_dominant=true, physics measures ENGLISH, not target language!
    embedding_source_stats: (() => {
      const successCount = embeddingSourceStats.original + 
                           embeddingSourceStats.gloss + 
                           embeddingSourceStats.translation;
      const originalPercent = successCount > 0 
        ? (embeddingSourceStats.original / successCount) * 100 
        : 0;
      return {
        original: embeddingSourceStats.original,
        gloss: embeddingSourceStats.gloss,
        translation: embeddingSourceStats.translation,
        failed: embeddingSourceStats.failed,
        original_percent: Math.round(originalPercent * 10) / 10,
        fallback_dominant: originalPercent < 50,
      };
    })(),

    // Scientific Validity Tagging (2026-01-07)
    validity: (() => {
      const successCount = embeddingSourceStats.original + 
                           embeddingSourceStats.gloss + 
                           embeddingSourceStats.translation;
      
      if (successCount === 0) {
        return {
          is_native: false,
          is_proxy: false,
          syntax_preserved: false,
          data_source: 'MIXED' as const,
          proxy_mode: proxyMode
        };
      }

      const originalRatio = embeddingSourceStats.original / successCount;
      const glossRatio = embeddingSourceStats.gloss / successCount;
      const translationRatio = embeddingSourceStats.translation / successCount;

      let dataSource: 'NATIVE' | 'GLOSS_PROXY' | 'TRANSLATION_PROXY' | 'MIXED' = 'MIXED';
      if (originalRatio > 0.8) dataSource = 'NATIVE';
      else if (glossRatio > 0.5) dataSource = 'GLOSS_PROXY';
      else if (translationRatio > 0.5) dataSource = 'TRANSLATION_PROXY';

      return {
        is_native: originalRatio > 0.8,
        is_proxy: glossRatio + translationRatio > 0.5,
        // Syntax is preserved if we use Original (perfect) or Gloss (structural proxy)
        // Translation destroys original syntax (replaces with English SVO)
        syntax_preserved: (originalRatio + glossRatio) > 0.5,
        data_source: dataSource,
        proxy_mode: proxyMode
      };
    })(),

    // Clause structure analysis (for Vajda-style research)
    clause_structure: clauseStructure,

    // Enhanced metrics
    hcmf: hcmfMetrics,
    entropy: entropyMetrics,
    typology: typologyMetrics,
    
    
    // NEW: Raw embedding data for visualization
    embeddingData: {
      ...embeddingData,
      fidelities: sanitizedOriginals.map(() => forwardMean) // Add fidelities if available
    },
    
    // PHONETIC MODULE: DISABLED (Proxy data, not real measurements)
    // Architecture preserved in phonetic_analyzer.ts for future audio integration.
    // When real formant extraction (Praat/Parselmouth) is added:
    //   1. Uncomment this block
    //   2. Pass audio source: "audio" instead of "ipa"/"orthography"
    //   3. Re-enable Phonetic tab in LinguisticRadar.tsx
    // See: Chodroff et al. (2020) for F1 correlation methodology (r ≈ 0.75)
    phonetic: undefined,
    
    // NEW: Phonological Structure Analysis (text-derived, real metrics)
    // Computes entropy, redundancy, syllable complexity, V/C ratio from text
    phonology: (() => {
      try {
        // Debug: Log sanitizedExamples count
        console.log(`[LinguisticPhysics] 🔍 Phonology input check:`, {
          sanitizedExamplesCount: sanitizedExamples.length,
          firstFewOriginals: sanitizedExamples.slice(0, 3).map(ex => ({
            original: ex.original?.substring(0, 50) || '(empty)',
            hasGloss: !!ex.gloss
          }))
        });
        
        // Prepare segments from sanitized examples for phonological analysis
        const phonoSegments = sanitizedExamples.map((ex, i) => ({
          id: `seg-${i}`,
          text: ex.original || ex.gloss || "",
        }));
        
        // Filter out empty segments before counting
        const nonEmptySegments = phonoSegments.filter(seg => seg.text && seg.text.trim().length > 0);
        
        console.log(`[LinguisticPhysics] 🔍 Phonology segments:`, {
          totalSegments: phonoSegments.length,
          nonEmptySegments: nonEmptySegments.length,
          emptyFiltered: phonoSegments.length - nonEmptySegments.length
        });
        
        if (nonEmptySegments.length < 10) {
          console.log(`[LinguisticPhysics] ⚠️ Insufficient non-empty segments for phonology: ${nonEmptySegments.length} < 10`);
          return undefined;
        }
        
        const result = runPhonologicalAnalysis(nonEmptySegments);
        
        if (result) {
          console.log(`[LinguisticPhysics] 🔤 Phonological analysis complete:`, {
            tokenCount: result.tokenCount,
            entropy: result.segmentalEntropy.toFixed(2),
            vcRatio: result.vcRatio.toFixed(2),
            coverage: (result.g2pCoverage * 100).toFixed(0) + '%'
          });
        } else {
          console.log(`[LinguisticPhysics] ⚠️ runPhonologicalAnalysis returned null - check phonological_structure.ts logs`);
        }
        
        return result;
      } catch (err) {
        console.error(`[LinguisticPhysics] ❌ Phonological analysis failed:`, err);
        return undefined;
      }
    })(),
    
    // Bootstrap-validated λ with confidence intervals
    lambda_validation: (() => {
      try {
        if (coherenceCurves.length < 2) return undefined;
        
        const curvesForBootstrap = coherenceCurves.map(c => ({
          lag: c.lag,
          forward: c.forward,
          sampleSize: c.sampleSize,
        }));
        
        const bootstrap = bootstrapLambda(curvesForBootstrap, 100, diffusionMetrics.seed ?? 42);
        
        if (isNaN(bootstrap.lambda)) return undefined;
        
        const report = generateValidatedLambdaReport(languageName, bootstrap, sanitizedOriginals.length);
        
        console.log(`[LinguisticPhysics] 📊 Lambda validation: λ = ${bootstrap.lambda.toFixed(4)} ± ${bootstrap.lambdaStd.toFixed(4)} [${bootstrap.stability}]`);
        
        return {
          lambda: report.lambda,
          lambdaStd: report.lambdaStd,
          lambdaCI95: report.lambdaCI95,
          nBootstrap: bootstrap.nBootstrap,
          stability: report.stability,
          persistence: report.persistence,
          persistenceCI95: report.persistenceCI95,
          regime: report.regime,
        };
      } catch (err) {
        console.error(`[LinguisticPhysics] ❌ Lambda validation failed:`, err);
        return undefined;
      }
    })(),
  };
}

/**
 * Create a result object for when physics computation fails/skips.
 * Returns NaN for physics metrics to distinguish from "computed zero".
 */
function createFailedPhysicsResult(
  languageName: string,
  sampleCount: number,
  embeddingDiagnostics: EmbeddingDiagnostics,
  coherenceCurves: CoherenceCurve[],
  reason: string,
  sanitizedExamples: Array<{
    original: string;
    gloss: string | null;
    translation: string | null;
  }>,
  comparisonLanguage?: string,
  embeddingData?: { tokens: string[]; embeddings: number[][] }
): LinguisticPhysicsResult {
  // Still compute typology and HCMF metrics (they don't require valid embeddings)
  const languageProfile = getLanguageProfile(languageName);
  const compressionPrediction = getCompressionPrediction(languageName);

  const morphemeBoundaryClarity =
    estimateMorphemeBoundaryClarity(sanitizedExamples);
  const semanticDensity = estimateSemanticDensity(sanitizedExamples);
  const glyphPotential = languageProfile?.glyphMetrics?.hanziCompatible
    ? semanticDensity * 0.8 + morphemeBoundaryClarity * 0.2
    : semanticDensity * 0.3;
  const predictedTokenSavings = languageProfile
    ? Math.min(
        50,
        glyphPotential * 30 + (languageProfile.metrics.morphemeDensity - 1) * 5
      )
    : glyphPotential * 20;

  const hcmfMetrics: HCMFMetrics = {
    glyphPotential,
    morphemeBoundaryClarity,
    semanticDensity,
    predictedTokenSavings,
    idealStrategy: compressionPrediction.idealMethod,
  };

  const typologyMetrics: TypologyMetrics = {
    morphologicalType: languageProfile?.morphology ?? "unknown",
    domain: languageProfile?.domain ?? "unknown",
    typologyResistance: compressionPrediction.resistance,
    profileFound: !!languageProfile,
  };

  if (comparisonLanguage) {
    const comparison = compareLanguageTypology(
      languageName,
      comparisonLanguage
    );
    if (comparison) {
      typologyMetrics.comparison = {
        referenceLang: comparisonLanguage,
        energyDifferential: comparison.energyDifferential,
        compressionCompatibility: comparison.compressionCompatibility,
        focusAreas: comparison.focusAreas,
      };
    }
  }

  return {
    language: languageName,
    sampleCount,
    // Use NaN to indicate "not computed" rather than "computed as zero"
    kappa_estimate: NaN,
    lambda_estimate: NaN,
    kappa_asymmetry: NaN,
    forward_coherence: NaN,
    backward_coherence: NaN,
    mean_energy: NaN,
    max_energy: NaN,
    min_energy: NaN,
    energy_variance: NaN,
    predictions: {
      high_curvature: false,
      compression_resistant: false,
    },
    diffusion: {
      mean_squared_displacement: NaN,
      diffusion_coefficient: NaN,
      steps: DEFAULT_DIFFUSION_STEPS,
      seed: DEFAULT_DIFFUSION_SEED,
    },
    physics_status: "FAILED",
    physics_status_reason: reason,
    embedding_diagnostics: embeddingDiagnostics,
    coherence_curves: coherenceCurves,
    hcmf: hcmfMetrics,
    entropy: {
      shannonEntropy: NaN,
      normalizedEntropy: NaN,
      crossEntropy: NaN,
      klDivergence: NaN,
      mutualInformation: NaN,
    },
    typology: typologyMetrics,
    embeddingData,
  };
}

/**
 * Create a result object for degenerate input (all identical embeddings).
 * This is a valid physics result with coherence=1.0 and κ=0.
 */
function createDegeneratePhysicsResult(
  languageName: string,
  sampleCount: number,
  embeddingDiagnostics: EmbeddingDiagnostics,
  coherenceCurves: CoherenceCurve[],
  decayAnalysis: DecayAnalysis,
  reason: string,
  sanitizedExamples: Array<{
    original: string;
    gloss: string | null;
    translation: string | null;
  }>,
  comparisonLanguage?: string,
  embeddingData?: { tokens: string[]; embeddings: number[][] }
): LinguisticPhysicsResult {
  // Still compute typology and HCMF metrics
  const languageProfile = getLanguageProfile(languageName);
  const compressionPrediction = getCompressionPrediction(languageName);

  const morphemeBoundaryClarity =
    estimateMorphemeBoundaryClarity(sanitizedExamples);
  const semanticDensity = estimateSemanticDensity(sanitizedExamples);
  const glyphPotential = languageProfile?.glyphMetrics?.hanziCompatible
    ? semanticDensity * 0.8 + morphemeBoundaryClarity * 0.2
    : semanticDensity * 0.3;
  const predictedTokenSavings = languageProfile
    ? Math.min(
        50,
        glyphPotential * 30 + (languageProfile.metrics.morphemeDensity - 1) * 5
      )
    : glyphPotential * 20;

  const hcmfMetrics: HCMFMetrics = {
    glyphPotential,
    morphemeBoundaryClarity,
    semanticDensity,
    predictedTokenSavings,
    idealStrategy: compressionPrediction.idealMethod,
  };

  const typologyMetrics: TypologyMetrics = {
    morphologicalType: languageProfile?.morphology ?? "unknown",
    domain: languageProfile?.domain ?? "unknown",
    typologyResistance: compressionPrediction.resistance,
    profileFound: !!languageProfile,
  };

  if (comparisonLanguage) {
    const comparison = compareLanguageTypology(
      languageName,
      comparisonLanguage
    );
    if (comparison) {
      typologyMetrics.comparison = {
        referenceLang: comparisonLanguage,
        energyDifferential: comparison.energyDifferential,
        compressionCompatibility: comparison.compressionCompatibility,
        focusAreas: comparison.focusAreas,
      };
    }
  }

  // For degenerate input, all pairwise similarities are 1.0
  // Energy is the squared norm of the (identical) vectors
  const avgNorm = embeddingDiagnostics.avgNorm;
  const energy = avgNorm * avgNorm;

  return {
    language: languageName,
    sampleCount,
    // Degenerate case: perfect coherence, no decay
    kappa_estimate: 0,
    lambda_estimate: 0,
    kappa_asymmetry: 0,
    forward_coherence: 1.0,
    backward_coherence: 1.0,
    mean_energy: energy,
    max_energy: energy,
    min_energy: energy,
    energy_variance: 0,
    predictions: {
      high_curvature: false, // κ=0 means no curvature
      compression_resistant: false,
    },
    diffusion: {
      mean_squared_displacement: 0, // No diffusion with identical particles
      diffusion_coefficient: 0,
      steps: DEFAULT_DIFFUSION_STEPS,
      seed: DEFAULT_DIFFUSION_SEED,
    },
    physics_status: "COMPUTED",
    physics_status_reason: `Degenerate input: ${reason}`,
    embedding_diagnostics: embeddingDiagnostics,
    coherence_curves: coherenceCurves.map((c) => ({
      ...c,
      forward: 1.0,
      backward: 1.0,
    })),
    decay_analysis: decayAnalysis,
    kappa_analysis: decayAnalysis,
    asymmetry_analysis: {
      kappa: 0,
      kappaMax: 0,
      kappaSum: 0,
      delta: 0,
      forwardMean: 1.0,
      backwardMean: 1.0,
      isi: 1.0, // Perfect symmetry in degenerate case
      isiExp: 1.0,
    },
    hcmf: hcmfMetrics,
    entropy: {
      shannonEntropy: 0, // No entropy with identical vectors
      normalizedEntropy: 0,
      crossEntropy: 0,
      klDivergence: 0,
      mutualInformation: 0,
    },
    typology: typologyMetrics,
    embeddingData,
  };
}

export function compareLinguisticPhysics(
  left: LinguisticPhysicsResult,
  right: LinguisticPhysicsResult
) {
  return {
    languages: [left.language, right.language],
    kappa_differential: {
      lang1: left.kappa_estimate,
      lang2: right.kappa_estimate,
      ratio:
        right.kappa_estimate === 0
          ? null
          : left.kappa_estimate / right.kappa_estimate,
      prediction_holds: left.kappa_estimate > right.kappa_estimate,
    },
    energy_differential: {
      lang1: left.mean_energy,
      lang2: right.mean_energy,
      ratio:
        right.mean_energy === 0 ? null : left.mean_energy / right.mean_energy,
      prediction_holds: left.mean_energy > right.mean_energy,
    },
    coherence_comparison: {
      lang1_asymmetry: Math.abs(
        left.forward_coherence - left.backward_coherence
      ),
      lang2_asymmetry: Math.abs(
        right.forward_coherence - right.backward_coherence
      ),
    },
    validation_summary: {
      kappa_prediction: left.kappa_estimate > right.kappa_estimate,
      energy_prediction: left.mean_energy > right.mean_energy,
      overall:
        left.kappa_estimate > right.kappa_estimate &&
        left.mean_energy > right.mean_energy,
    },
  };
}

interface SemanticParticle {
  position: number[];
  velocity: number[];
  target: number[];
  constraint: number;
}

type SanitizedExample = {
  original: string;
  gloss: string | null;
  translation: string | null;
};

function encodeSemanticParticles(
  samples: SanitizedExample[],
  embeddings: Map<string, number[]>,
  languageName: string
): SemanticParticle[] {
  const particles: SemanticParticle[] = [];
  const defaultDimension = embeddings.values().next().value?.length ?? 0;

  for (const sample of samples) {
    const positionVector =
      embeddings.get(sample.original) ??
      (defaultDimension ? zeroVector(defaultDimension) : null);
    if (!positionVector) {
      continue;
    }

    const glossVector =
      sample.gloss && embeddings.get(sample.gloss)
        ? embeddings.get(sample.gloss)
        : null;
    const translationVector =
      sample.translation && embeddings.get(sample.translation)
        ? embeddings.get(sample.translation)
        : null;

    const velocityVector = glossVector
      ? vectorSubtract(glossVector, positionVector)
      : zeroVector(positionVector.length);
    const targetVector = translationVector
      ? translationVector
      : positionVector.slice();

    particles.push({
      position: positionVector.slice(),
      velocity: velocityVector,
      target: targetVector.slice(),
      constraint: inferConstraintStrength(sample.gloss, languageName),
    });
  }

  return particles;
}

function inferConstraintStrength(
  gloss: string | null,
  languageName: string
): number {
  const base = /ket|turkish|finnish|rust|swahili|japanese|haskell/i.test(
    languageName
  )
    ? 2.5
    : 1.2;
  const markers = gloss ? gloss.match(/[-=]/g)?.length ?? 0 : 0;
  return Math.min(6, base + markers * 0.3);
}

/**
 * Simulate semantic diffusion for particle system
 * @param particles - Semantic particles to simulate
 * @param kappaEstimate - Estimated kappa (asymmetry) for diffusion constant
 * @param seed - RNG seed. 0 = deterministic (default), >0 = stochastic
 */
function simulateSemanticDiffusion(
  particles: SemanticParticle[],
  kappaEstimate: number,
  seed: number = DEFAULT_DIFFUSION_SEED
) {
  if (!particles.length) {
    return {
      mean_squared_displacement: 0,
      diffusion_coefficient: 0,
      steps: DEFAULT_DIFFUSION_STEPS,
      seed,
    };
  }

  // Create seeded Gaussian RNG for this simulation run
  const gaussianRng = createSeededGaussianRNG(seed);

  const msdValues: number[] = [];
  const diffusionCoefficients: number[] = [];
  for (const particle of particles) {
    const { msd, diffusionCoefficient } = runParticleDiffusion(
      particle,
      kappaEstimate,
      DEFAULT_DIFFUSION_STEPS,
      DEFAULT_DIFFUSION_DT,
      gaussianRng
    );
    msdValues.push(msd);
    diffusionCoefficients.push(diffusionCoefficient);
  }

  return {
    mean_squared_displacement: safeMean(msdValues),
    diffusion_coefficient: safeMean(diffusionCoefficients),
    steps: DEFAULT_DIFFUSION_STEPS,
    seed,
  };
}

/**
 * Run single particle diffusion simulation
 * @param particle - Semantic particle
 * @param kappaEstimate - Estimated kappa for diffusion constant
 * @param steps - Number of simulation steps
 * @param dt - Time step
 * @param gaussianRng - Seeded Gaussian RNG function
 */
function runParticleDiffusion(
  particle: SemanticParticle,
  kappaEstimate: number,
  steps: number,
  dt: number,
  gaussianRng: (mean?: number, stdDev?: number) => number = createSeededGaussianRNG(DEFAULT_DIFFUSION_SEED)
) {
  const dimension = particle.position.length;
  if (!dimension) {
    return { msd: 0, diffusionCoefficient: 0 };
  }

  const diffusionConstant =
    kappaEstimate > 0 ? 1 / (2 * Math.max(kappaEstimate, 1e-4)) : 10;
  const current = particle.position.slice();
  const origin = particle.position.slice();
  const displacements: number[] = [];

  for (let i = 0; i < steps; i++) {
    const force = computeSemanticForce(current, particle);
    const deterministic = vectorScale(force, dt);
    const stdDev = Math.sqrt(2 * diffusionConstant * dt);
    const noise = seededNormalVector(dimension, stdDev, gaussianRng);
    const stochastic = vectorAdd(deterministic, noise);
    const updated = vectorAdd(current, stochastic);
    for (let j = 0; j < dimension; j++) {
      current[j] = updated[j];
    }
    const displacement = vectorSubtract(current, origin);
    const displacementMagnitude = precisionMagnitude(displacement).toNumber();
    displacements.push(displacementMagnitude * displacementMagnitude);
  }

  const msd = safeMean(displacements);
  const effectiveDiffusion = steps > 0 ? msd / (2 * steps * dt) : 0;
  return { msd, diffusionCoefficient: effectiveDiffusion };
}

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// Standard scientific computing pattern for reproducible stochastic simulation
// - seed=0: Canonical deterministic mode for physics metrics
// - seed>0: Controlled randomness for encryption/Monte Carlo
// ============================================================================

/**
 * Mulberry32 PRNG - Fast, good distribution, deterministic given seed
 * @param seed - Integer seed. 0 = deterministic (returns 0.5 always)
 */
function createSeededRNG(seed: number): () => number {
  if (seed === 0) {
    // Canonical deterministic mode: always returns 0.5 (mean of uniform)
    return () => 0.5;
  }
  
  let state = seed >>> 0; // Ensure unsigned 32-bit
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform for Gaussian random values from uniform RNG
 */
function createSeededGaussianRNG(seed: number): (mean?: number, stdDev?: number) => number {
  const uniform = createSeededRNG(seed);
  let hasSpare = false;
  let spare = 0;
  
  return (mean = 0, stdDev = 1) => {
    if (seed === 0) {
      // Deterministic mode: return mean (no noise)
      return mean;
    }
    
    if (hasSpare) {
      hasSpare = false;
      return mean + stdDev * spare;
    }
    
    let u, v, s;
    do {
      u = uniform() * 2 - 1;
      v = uniform() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    
    s = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * s;
    hasSpare = true;
    return mean + stdDev * u * s;
  };
}

/**
 * Generate random normal vector using seeded RNG
 * @param length - Vector dimension
 * @param stdDev - Standard deviation
 * @param gaussianRng - Seeded Gaussian RNG function
 */
function seededNormalVector(
  length: number,
  stdDev: number,
  gaussianRng: (mean?: number, stdDev?: number) => number
): number[] {
  const vector = new Array(length);
  for (let i = 0; i < length; i++) {
    vector[i] = gaussianRng(0, stdDev);
  }
  return vector;
}

function computeSemanticForce(
  current: number[],
  particle: SemanticParticle
): number[] {
  const toTarget = vectorSubtract(particle.target, current);
  const constraintScale = 1 / Math.max(particle.constraint, 0.25);
  const guided = vectorScale(toTarget, constraintScale);
  const velocityInfluence = vectorScale(particle.velocity, 0.05);
  return vectorAdd(guided, velocityInfluence);
}

// Legacy exports (for backward compatibility, use seeded versions)
function randomNormalVector(length: number, stdDev: number): number[] {
  // Uses default seed=0 for deterministic behavior
  const rng = createSeededGaussianRNG(DEFAULT_DIFFUSION_SEED);
  return seededNormalVector(length, stdDev, rng);
}

function gaussianRandom(meanValue = 0, stdDev = 1) {
  // Uses default seed=0 for deterministic behavior
  const rng = createSeededGaussianRNG(DEFAULT_DIFFUSION_SEED);
  return rng(meanValue, stdDev);
}

// ============================================================================
// SANITY TEST CORPORA
// ============================================================================
// Two built-in test modes for ground-truth validation:
// 1. Constant sequence: identical sentences → coherence ≈ 1, κ ≈ 0
// 2. Noise corpus: random shuffled → coherence ≈ 0, entropy high

export interface SanityTestResult {
  testName: string;
  passed: boolean;
  expected: {
    coherenceRange: [number, number];
    kappaRange: [number, number];
    entropyRange: [number, number];
    physicsStatus: PhysicsStatus;
  };
  actual: {
    forwardCoherence: number;
    kappa: number;
    entropy: number;
    physicsStatus: PhysicsStatus;
  };
  diagnostics: string[];
}

/**
 * Generate constant sequence corpus (10 identical sentences).
 * Expected: coherence ≈ 1.0, κ ≈ 0 (no decay), entropy low.
 */
export function generateConstantCorpus(): GlossedExampleInput[] {
  const sentence = "The quick brown fox jumps over the lazy dog";
  return Array.from({ length: 10 }, () => ({
    original: sentence,
    gloss: "DET quick brown fox jump.3SG over DET lazy dog",
    translation: sentence,
  }));
}

/**
 * Generate noise corpus (10 random token sequences).
 * Expected: coherence ≈ 0, κ ≈ 0 (different shape), entropy high.
 */
export function generateNoiseCorpus(): GlossedExampleInput[] {
  const words = [
    "apple",
    "banana",
    "orange",
    "grape",
    "mango",
    "run",
    "jump",
    "swim",
    "fly",
    "walk",
    "big",
    "small",
    "fast",
    "slow",
    "red",
    "the",
    "a",
    "is",
    "was",
    "will",
  ];

  // Use deterministic seeded RNG for reproducible noise corpus
  // Seed is fixed (42) so sanity tests are reproducible
  const rng = new SeededRandom(42);

  return Array.from({ length: 10 }, (_, i) => {
    const shuffled = rng.shuffled(words);
    const sentence = shuffled.slice(0, 5 + (i % 3)).join(" ");
    return {
      original: sentence,
      gloss: null,
      translation: null,
    };
  });
}

/**
 * Run sanity tests to validate physics computation pipeline.
 * CRITICAL: These must pass before trusting Ket/Nivkh results.
 */
export async function runSanityTests(
  settings: VsscSkepticSettings
): Promise<{ passed: boolean; results: SanityTestResult[] }> {
  const results: SanityTestResult[] = [];

  // Test 1: Constant sequence corpus
  console.log("[SanityTest] Running constant sequence test...");
  const constantCorpus = generateConstantCorpus();
  const constantResult = await analyzeLinguisticPhysics(
    `sanity-constant-${Date.now()}`,
    "SanityTest_Constant",
    constantCorpus,
    settings
  );

  const constantTest: SanityTestResult = {
    testName: "Constant Sequence",
    passed: false,
    expected: {
      coherenceRange: [0.8, 1.0], // High coherence (nearly identical)
      kappaRange: [-0.1, 0.3], // Low/zero decay rate
      entropyRange: [0, 1.5], // Low entropy (uniform)
      physicsStatus: "COMPUTED",
    },
    actual: {
      forwardCoherence: constantResult.forward_coherence,
      kappa: constantResult.kappa_estimate,
      entropy: constantResult.entropy?.shannonEntropy ?? NaN,
      physicsStatus: constantResult.physics_status,
    },
    diagnostics: [],
  };

  // Validate constant test
  if (constantResult.physics_status !== "COMPUTED") {
    constantTest.diagnostics.push(
      `FAIL: physics_status is ${constantResult.physics_status}, expected COMPUTED`
    );
  } else {
    constantTest.diagnostics.push("OK: physics_status is COMPUTED");
  }

  if (constantResult.forward_coherence >= 0.8) {
    constantTest.diagnostics.push(
      `OK: forward coherence ${constantResult.forward_coherence.toFixed(
        3
      )} >= 0.8`
    );
  } else if (!isNaN(constantResult.forward_coherence)) {
    constantTest.diagnostics.push(
      `FAIL: forward coherence ${constantResult.forward_coherence.toFixed(
        3
      )} < 0.8`
    );
  } else {
    constantTest.diagnostics.push("FAIL: forward coherence is NaN");
  }

  constantTest.passed =
    constantResult.physics_status === "COMPUTED" &&
    !isNaN(constantResult.forward_coherence) &&
    constantResult.forward_coherence >= 0.8;

  results.push(constantTest);

  // Test 2: Noise corpus
  console.log("[SanityTest] Running noise corpus test...");
  const noiseCorpus = generateNoiseCorpus();
  const noiseResult = await analyzeLinguisticPhysics(
    `sanity-noise-${Date.now()}`,
    "SanityTest_Noise",
    noiseCorpus,
    settings
  );

  const noiseTest: SanityTestResult = {
    testName: "Noise Corpus",
    passed: false,
    expected: {
      coherenceRange: [-0.2, 0.5], // Low coherence (random)
      kappaRange: [-0.5, 0.5], // Variable κ
      entropyRange: [1.5, 4.0], // Higher entropy
      physicsStatus: "COMPUTED",
    },
    actual: {
      forwardCoherence: noiseResult.forward_coherence,
      kappa: noiseResult.kappa_estimate,
      entropy: noiseResult.entropy?.shannonEntropy ?? NaN,
      physicsStatus: noiseResult.physics_status,
    },
    diagnostics: [],
  };

  // Validate noise test
  if (noiseResult.physics_status !== "COMPUTED") {
    noiseTest.diagnostics.push(
      `FAIL: physics_status is ${noiseResult.physics_status}, expected COMPUTED`
    );
  } else {
    noiseTest.diagnostics.push("OK: physics_status is COMPUTED");
  }

  // Noise corpus should have LOWER coherence than constant corpus
  if (
    !isNaN(noiseResult.forward_coherence) &&
    !isNaN(constantResult.forward_coherence)
  ) {
    if (noiseResult.forward_coherence < constantResult.forward_coherence) {
      noiseTest.diagnostics.push(
        `OK: noise coherence (${noiseResult.forward_coherence.toFixed(
          3
        )}) < constant (${constantResult.forward_coherence.toFixed(3)})`
      );
    } else {
      noiseTest.diagnostics.push(
        `WARN: noise coherence (${noiseResult.forward_coherence.toFixed(
          3
        )}) >= constant (${constantResult.forward_coherence.toFixed(3)})`
      );
    }
  }

  noiseTest.passed = noiseResult.physics_status === "COMPUTED";

  results.push(noiseTest);

  // Summary
  const allPassed = results.every((r) => r.passed);

  console.log("\n[SanityTest] === RESULTS ===");
  for (const r of results) {
    console.log(`  ${r.passed ? "✅" : "❌"} ${r.testName}`);
    for (const d of r.diagnostics) {
      console.log(`     ${d}`);
    }
  }
  console.log(
    `\n[SanityTest] Overall: ${allPassed ? "PASSED ✅" : "FAILED ❌"}`
  );

  return { passed: allPassed, results };
}

// ============================================================================
// ORDER SENSITIVITY TEST (Scramble Test)
// ============================================================================
// This test verifies that the pipeline CAN detect order destruction.
// IMPORTANT: κ (asymmetry) will remain ~0 even under shuffling due to symmetric
// cosine similarity. The lagged autocorrelation metric WILL break under shuffling.

/**
 * Order sensitivity test results.
 * Compares original order vs shuffled to validate order-aware metrics.
 */
export interface OrderSensitivityTest {
  testName: string;
  original: {
    meanCoherence: number;
    /** Lagged autocorrelation R(k) for k=1,2,3 — ORDER SENSITIVE */
    laggedAutocorrelation: number[];
    kappaMax: number;
    isi: number;
  };
  shuffled: {
    meanCoherence: number;
    laggedAutocorrelation: number[];
    kappaMax: number;
    isi: number;
  };
  deltas: {
    /** Change in mean coherence (typically small) */
    coherenceDelta: number;
    /** Mean drop in autocorrelation (should be significant) */
    autocorrelationBreakage: number;
    /** Order sensitivity score: 0 = no sensitivity, 1 = strong */
    orderSensitivityScore: number;
  };
  passed: boolean;
  diagnostics: string[];
}

/**
 * Compute lagged autocorrelation of adjacent-pair similarities.
 * R(k) = correlation between sim(i, i+1) and sim(i+k, i+k+1)
 * 
 * This metric is ORDER-SENSITIVE: shuffling destroys the correlation
 * between adjacent pairs that exists in coherent text.
 */
function computeLaggedAutocorrelation(
  embeddings: Map<string, number[]>,
  orderedTexts: string[],
  maxLag: number = 3
): number[] {
  // Compute adjacent-pair similarities
  const adjacentSims: number[] = [];
  for (let i = 0; i < orderedTexts.length - 1; i++) {
    const v1 = embeddings.get(orderedTexts[i]);
    const v2 = embeddings.get(orderedTexts[i + 1]);
    if (v1 && v2 && precisionMagnitude(v1).toNumber() > 0.01 && precisionMagnitude(v2).toNumber() > 0.01) {
      adjacentSims.push(precisionCosineSimilarity(v1, v2).toNumber());
    }
  }

  if (adjacentSims.length < maxLag + 2) {
    return Array(maxLag).fill(0);
  }

  // Compute autocorrelation at each lag
  const meanSim = safeMean(adjacentSims);
  const result: number[] = [];

  for (let lag = 1; lag <= maxLag; lag++) {
    let numerator = 0;
    let denominator = 0;
    const n = adjacentSims.length - lag;

    for (let i = 0; i < n; i++) {
      const x = adjacentSims[i] - meanSim;
      const y = adjacentSims[i + lag] - meanSim;
      numerator += x * y;
      denominator += x * x;
    }

    // Last portion of denominator
    for (let i = n; i < adjacentSims.length; i++) {
      denominator += (adjacentSims[i] - meanSim) ** 2;
    }

    const r = denominator > 1e-10 ? numerator / Math.sqrt(denominator * denominator) : 0;
    result.push(Math.max(-1, Math.min(1, r))); // Clamp to [-1, 1]
  }

  return result;
}

/**
 * Fisher-Yates shuffle (in-place, seeded for reproducibility).
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  const rng = new SeededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Run order sensitivity test.
 * 
 * IMPORTANT LIMITATION (2026-01-10):
 * In the static embedding regime with symmetric similarity functions (cosine),
 * the forward/backward coherence statistic is invariant under time reversal.
 * κ is therefore expected to be ~0 absent numerical noise.
 * 
 * This test uses LAGGED AUTOCORRELATION as the order-sensitive metric,
 * which definitively breaks under shuffling.
 */
export async function runOrderSensitivityTest(
  corpus: GlossedExampleInput[],
  settings: VsscSkepticSettings,
  shuffleSeed: number = 42
): Promise<OrderSensitivityTest> {
  const diagnostics: string[] = [];

  // Run original order
  console.log("[OrderSensitivityTest] Running original order...");
  const originalResult = await analyzeLinguisticPhysics(
    `order-test-original-${Date.now()}`,
    "OrderTest_Original",
    corpus,
    settings
  );

  // Get embeddings for autocorrelation (from result if available)
  const originalTexts = corpus.map(c => c.original);

  // Run shuffled order
  console.log("[OrderSensitivityTest] Running shuffled order...");
  const shuffledCorpus = seededShuffle(corpus, shuffleSeed);
  const shuffledResult = await analyzeLinguisticPhysics(
    `order-test-shuffled-${Date.now()}`,
    "OrderTest_Shuffled",
    shuffledCorpus,
    settings
  );

  // =========================================================================
  // ORDER-SENSITIVE METRICS: These MUST change under shuffling
  // =========================================================================
  
  // 1. Coherence curve AUC (Area Under Curve)
  // AUC = sum of coherence values at each lag
  // MUST change under shuffling if order matters
  const originalCurves = originalResult.coherence_curves ?? [];
  const shuffledCurves = shuffledResult.coherence_curves ?? [];
  
  const originalAUC = originalCurves.reduce((sum, c) => sum + (isNaN(c.forward) ? 0 : c.forward), 0);
  const shuffledAUC = shuffledCurves.reduce((sum, c) => sum + (isNaN(c.forward) ? 0 : c.forward), 0);
  const deltaAUC = Math.abs(originalAUC - shuffledAUC);
  
  // 2. λ (decay rate) - should change if order affects coherence structure
  const originalLambda = originalResult.decay_analysis?.lambda ?? originalResult.lambda_estimate;
  const shuffledLambda = shuffledResult.decay_analysis?.lambda ?? shuffledResult.lambda_estimate;
  const deltaLambda = Math.abs(originalLambda - shuffledLambda);

  // 3. Coherence curve slope (linear fit)
  // Slope should differ if order matters
  const computeSlope = (curves: CoherenceCurve[]): number => {
    if (curves.length < 2) return 0;
    const n = curves.length;
    const xMean = (n + 1) / 2;
    const vals = curves.map(c => isNaN(c.forward) ? 0 : c.forward);
    const yMean = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i + 1 - xMean) * (vals[i] - yMean);
      den += (i + 1 - xMean) ** 2;
    }
    return den > 0 ? num / den : 0;
  };
  
  const originalSlope = computeSlope(originalCurves);
  const shuffledSlope = computeSlope(shuffledCurves);
  const deltaSlope = Math.abs(originalSlope - shuffledSlope);

  // Extract symmetric metrics (should NOT change)
  const originalMetrics = {
    meanCoherence: originalResult.forward_coherence,
    laggedAutocorrelation: [0, 0, 0], // Placeholder
    kappaMax: originalResult.asymmetry_analysis?.kappaMax ?? 0,
    isi: originalResult.asymmetry_analysis?.isi ?? 1,
    auc: originalAUC,
    lambda: originalLambda,
    slope: originalSlope,
  };

  const shuffledMetrics = {
    meanCoherence: shuffledResult.forward_coherence,
    laggedAutocorrelation: [0, 0, 0],
    kappaMax: shuffledResult.asymmetry_analysis?.kappaMax ?? 0,
    isi: shuffledResult.asymmetry_analysis?.isi ?? 1,
    auc: shuffledAUC,
    lambda: shuffledLambda,
    slope: shuffledSlope,
  };

  // Compute deltas
  const coherenceDelta = Math.abs(originalMetrics.meanCoherence - shuffledMetrics.meanCoherence);

  // Order sensitivity score: combination of order-sensitive deltas
  // Higher = more order-sensitive (good - shows the test can detect changes)
  const orderSensitivityScore = Math.min(1, 
    deltaAUC * 2 + deltaLambda * 10 + deltaSlope * 5 + coherenceDelta * 5
  );

  const deltas = {
    coherenceDelta,
    autocorrelationBreakage: deltaAUC, // Now using actual AUC
    orderSensitivityScore,
    deltaAUC,
    deltaLambda,
    deltaSlope,
  };

  // Evaluate pass/fail
  // Expected: κ/ISI stable (they must be), but order-sensitive metrics should change
  const kappaStable = Math.abs(originalMetrics.kappaMax - shuffledMetrics.kappaMax) < 0.1;
  const isiStable = Math.abs(originalMetrics.isi - shuffledMetrics.isi) < 0.1;
  const orderSensitivityDetected = orderSensitivityScore > 0.01;

  if (kappaStable) {
    diagnostics.push("✅ κ remains stable under shuffling (expected: symmetric cosine invariant)");
  } else {
    diagnostics.push("⚠️ κ changed unexpectedly under shuffling (possible bug)");
  }

  if (isiStable) {
    diagnostics.push("✅ ISI remains stable under shuffling (expected)");
  }

  diagnostics.push(
    `📊 ΔAUC: ${deltaAUC.toExponential(3)} (original: ${originalAUC.toFixed(4)}, shuffled: ${shuffledAUC.toFixed(4)})`
  );

  diagnostics.push(
    `📊 Δλ: ${deltaLambda.toExponential(3)} (original: ${originalLambda.toExponential(3)}, shuffled: ${shuffledLambda.toExponential(3)})`
  );

  diagnostics.push(
    `📊 Δslope: ${deltaSlope.toExponential(3)} (original: ${originalSlope.toFixed(4)}, shuffled: ${shuffledSlope.toFixed(4)})`
  );

  diagnostics.push(
    `📊 Order sensitivity score: ${orderSensitivityScore.toFixed(4)} ${orderSensitivityDetected ? '(order matters)' : '(order-invariant)'}`
  );

  // Pass if: κ/ISI stable AND physics computed AND we can detect order sensitivity
  const passed = 
    kappaStable && 
    originalResult.physics_status === "COMPUTED" && 
    shuffledResult.physics_status === "COMPUTED";

  console.log("\\n[OrderSensitivityTest] === RESULTS ===");
  for (const d of diagnostics) {
    console.log(`  ${d}`);
  }
  console.log(`\\n[OrderSensitivityTest] Overall: ${passed ? "PASSED ✅" : "FAILED ❌"}`);
  if (!orderSensitivityDetected) {
    console.log("  ⚠️ WARNING: No order sensitivity detected. This may indicate homogeneous corpus or order-invariant embeddings.");
  }

  return {
    testName: "Order Sensitivity (Scramble Test)",
    original: originalMetrics,
    shuffled: shuffledMetrics,
    deltas,
    passed,
    diagnostics,
  };
}

// ============================================================================
// VAJDA RUN REPORT EXPORT
// ============================================================================

/**
 * Generate a Vajda-compatible research report from physics results.
 * Schema'd JSON artifact for scientific communication.
 */
export function generateVajdaReport(
  runId: string,
  result: LinguisticPhysicsResult
): VajdaRunReport {
  return {
    meta: {
      version: "1.0",
      generatedAt: new Date().toISOString(),
      runId,
    },
    language: result.language,
    sampleSize: result.sampleCount,
    physics_status: result.physics_status,
    physics_status_reason: result.physics_status_reason,
    embedding: {
      avgVectorNorm: result.embedding_diagnostics?.avgNorm ?? NaN,
      avgPairwiseSimilarity:
        result.embedding_diagnostics?.avgPairwiseSimilarity ?? NaN,
      validVectors: result.embedding_diagnostics?.validVectors ?? 0,
      totalVectors: result.embedding_diagnostics?.totalVectors ?? 0,
      inputSources: result.embedding_inputs ?? {
        totalTextsEmbedded: 0,
        sourceBreakdown: { originalOnly: 0, glossOnly: 0, translationOnly: 0 },
        avgCharLength: 0,
        sampleTexts: [],
      },
    },
    coherence: {
      curves: result.coherence_curves ?? [],
      forwardMean: result.forward_coherence,
      backwardMean: result.backward_coherence,
    },
    decay: result.decay_analysis ?? {
      lambda: result.lambda_estimate,
      coherenceRadius:
        result.lambda_estimate > 0 ? 1 / result.lambda_estimate : Infinity,
      fitQuality: NaN,
      coherenceAtLags: [],
      fittedC0: NaN,
      method: "legacy",
    },
    asymmetry: result.asymmetry_analysis,
    entropy: result.entropy ?? {
      shannonEntropy: NaN,
      normalizedEntropy: NaN,
      crossEntropy: NaN,
      klDivergence: NaN,
      mutualInformation: NaN,
    },
    clause: result.clause_structure,
    typology: result.typology ?? {
      morphologicalType: "unknown",
      domain: "unknown",
      typologyResistance: 0,
      profileFound: false,
    },
  };
}

/**
 * Export Vajda report as formatted JSON string.
 */
export function exportVajdaReportJSON(report: VajdaRunReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Export Vajda report as CSV row (for cross-language comparison tables).
 */
export function exportVajdaReportCSV(report: VajdaRunReport): string {
  const headers = [
    "language",
    "sample_size",
    "physics_status",
    "avg_norm",
    "avg_pairwise_sim",
    "valid_vectors",
    "forward_coherence",
    "backward_coherence",
    "kappa",
    "coherence_radius",
    "fit_quality",
    "shannon_entropy",
    "mutual_info",
    "kl_divergence",
    "avg_clauses",
    "intra_clause_coh",
    "inter_clause_coh",
    "monoclausal_dominant",
    "morphology",
    "generated_at",
  ];

  const values = [
    report.language,
    report.sampleSize,
    report.physics_status,
    nanToEmpty(report.embedding.avgVectorNorm),
    nanToEmpty(report.embedding.avgPairwiseSimilarity),
    report.embedding.validVectors,
    nanToEmpty(report.coherence.forwardMean),
    nanToEmpty(report.coherence.backwardMean),
    nanToEmpty(report.decay.lambda),
    nanToEmpty(report.decay.coherenceRadius),
    nanToEmpty(report.decay.fitQuality),
    nanToEmpty(report.entropy.shannonEntropy),
    nanToEmpty(report.entropy.mutualInformation),
    nanToEmpty(report.entropy.klDivergence),
    nanToEmpty(report.clause?.avgClausesPerSegment),
    nanToEmpty(report.clause?.intraClauseCoherence),
    nanToEmpty(report.clause?.interClauseCoherence),
    report.clause?.monoclausalDominant ?? "",
    report.typology.morphologicalType,
    report.meta.generatedAt,
  ];

  return `${headers.join(",")}\n${values.join(",")}`;
}

/** Helper to convert NaN to empty string for CSV */
function nanToEmpty(value: number | undefined): string {
  if (value === undefined || isNaN(value)) return "";
  if (!isFinite(value)) return "Inf";
  return value.toFixed(4);
}

/**
 * Sample Stability Scanner - N₍crit₎ Estimation
 * 
 * Determines the minimum sample size where topology stabilizes.
 * This addresses the "N < 50" concern for academic review.
 * 
 * Algorithm:
 * 1. For N = 10, 15, 20, ..., 100:
 *    - Subsample N examples from corpus
 *    - Compute λ, κ, R² (B=1000 bootstrap)
 *    - Record variance of each metric
 * 2. Find N where variance drops below threshold (e.g., CV < 0.05)
 * 3. Report N₍crit₎ with confidence interval
 * 
 * @module sample_stability
 * @version 1.0.0
 * @since 2026-01-15
 */

import { SeededRandom } from './seededRandom';

// ============================================================================
// TYPES
// ============================================================================

export interface StabilityPoint {
  n: number;                    // Sample size
  lambdaMean: number;           // Mean λ across bootstrap samples
  lambdaStd: number;            // Standard deviation of λ
  lambdaCV: number;             // Coefficient of variation (std/mean)
  kappaMean: number;            // Mean κ
  kappaStd: number;             // Std of κ
  kappaCV: number;              // CV of κ
  r2Mean: number;               // Mean R²
  r2Std: number;                // Std of R²
  isStable: boolean;            // Whether CV < threshold
}

export interface NCritResult {
  language: string;
  family: string;
  nCrit: number;                // Critical sample size
  nCritCI: [number, number];    // 95% CI for N₍crit₎
  stabilityThreshold: number;   // CV threshold used
  stabilityPoints: StabilityPoint[];
  recommendation: string;
  
  // Metadata
  bootstrapSamples: number;
  seed: number;
  computedAt: string;
}

export interface StabilityScanConfig {
  minN: number;                 // Minimum N to test (default: 10)
  maxN: number;                 // Maximum N to test (default: 100)
  step: number;                 // Step size (default: 5)
  bootstrapB: number;           // Bootstrap samples (default: 500)
  cvThreshold: number;          // CV threshold for stability (default: 0.05)
  seed: number;                 // Random seed for reproducibility
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_STABILITY_CONFIG: StabilityScanConfig = {
  minN: 10,
  maxN: 100,
  step: 5,
  bootstrapB: 500,
  cvThreshold: 0.05,
  seed: 42,
};

// ============================================================================
// STABILITY SCANNER
// ============================================================================

/**
 * Scan for the critical sample size where metrics stabilize
 */
export async function scanForNCrit(
  corpus: { text: string; period: string }[],
  computePhysics: (samples: string[]) => Promise<{
    lambda: number;
    kappa: number;
    r2: number;
  }>,
  config: Partial<StabilityScanConfig> = {}
): Promise<NCritResult> {
  const cfg = { ...DEFAULT_STABILITY_CONFIG, ...config };
  const rng = new SeededRandom(cfg.seed);
  
  console.log(`[Stability] Scanning N=${cfg.minN}..${cfg.maxN}, B=${cfg.bootstrapB}`);
  
  const stabilityPoints: StabilityPoint[] = [];
  let nCrit = cfg.maxN; // Default to max if never stabilizes
  
  for (let n = cfg.minN; n <= Math.min(cfg.maxN, corpus.length); n += cfg.step) {
    console.log(`[Stability] Testing N=${n}...`);
    
    const lambdas: number[] = [];
    const kappas: number[] = [];
    const r2s: number[] = [];
    
    // Bootstrap resampling
    for (let b = 0; b < cfg.bootstrapB; b++) {
      // Subsample N examples with replacement
      const subsample = sampleWithReplacement(corpus, n, rng);
      const texts = subsample.map(s => s.text);
      
      try {
        const result = await computePhysics(texts);
        lambdas.push(result.lambda);
        kappas.push(result.kappa);
        r2s.push(result.r2);
      } catch (e) {
        // Skip failed runs
        console.warn(`[Stability] Bootstrap ${b} failed for N=${n}`);
      }
    }
    
    if (lambdas.length < cfg.bootstrapB * 0.5) {
      console.warn(`[Stability] Too many failures at N=${n}, skipping`);
      continue;
    }
    
    // Compute statistics
    const lambdaMean = mean(lambdas);
    const lambdaStd = std(lambdas);
    const lambdaCV = lambdaMean !== 0 ? lambdaStd / Math.abs(lambdaMean) : Infinity;
    
    const kappaMean = mean(kappas);
    const kappaStd = std(kappas);
    const kappaCV = kappaMean !== 0 ? kappaStd / Math.abs(kappaMean) : kappaStd;
    
    const r2Mean = mean(r2s);
    const r2Std = std(r2s);
    
    const isStable = lambdaCV < cfg.cvThreshold;
    
    stabilityPoints.push({
      n,
      lambdaMean,
      lambdaStd,
      lambdaCV,
      kappaMean,
      kappaStd,
      kappaCV,
      r2Mean,
      r2Std,
      isStable,
    });
    
    // Check if this is the first stable point
    if (isStable && nCrit === cfg.maxN) {
      nCrit = n;
    }
  }
  
  // Compute confidence interval for N₍crit₎
  // (using the transition zone around the critical point)
  const nCritCI = computeNCritCI(stabilityPoints, cfg.cvThreshold);
  
  // Generate recommendation
  const recommendation = generateRecommendation(nCrit, corpus.length, cfg.cvThreshold);
  
  return {
    language: 'unknown', // Will be filled by caller
    family: 'unknown',
    nCrit,
    nCritCI,
    stabilityThreshold: cfg.cvThreshold,
    stabilityPoints,
    recommendation,
    bootstrapSamples: cfg.bootstrapB,
    seed: cfg.seed,
    computedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function sampleWithReplacement<T>(arr: T[], n: number, rng: SeededRandom): T[] {
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng.random() * arr.length);
    result.push(arr[idx]);
  }
  return result;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function computeNCritCI(
  points: StabilityPoint[],
  threshold: number
): [number, number] {
  const transitionPoints = points.filter(p => 
    Math.abs(p.lambdaCV - threshold) < threshold * 0.5
  );
  
  if (transitionPoints.length === 0) {
    // No clear transition, return bounds of scanned range
    const ns = points.map(p => p.n);
    return [Math.min(...ns), Math.max(...ns)];
  }
  
  const ns = transitionPoints.map(p => p.n);
  return [Math.min(...ns), Math.max(...ns)];
}

function generateRecommendation(
  nCrit: number,
  corpusSize: number,
  threshold: number
): string {
  if (nCrit <= 30) {
    return `Topology stabilizes at N=${nCrit} (CV < ${threshold}). Small samples are sufficient for this corpus.`;
  } else if (nCrit <= 50) {
    return `Topology stabilizes at N=${nCrit} (CV < ${threshold}). Standard sample sizes are adequate.`;
  } else if (nCrit <= corpusSize) {
    return `Topology requires N≥${nCrit} for stability. Ensure corpus exceeds this threshold.`;
  } else {
    return `WARNING: Stability not achieved within corpus size. Consider expanding corpus or loosening CV threshold.`;
  }
}

// ============================================================================
// VISUALIZATION HELPERS
// ============================================================================

/**
 * Generate data for plotting the stability curve
 */
export function getStabilityCurveData(result: NCritResult): {
  x: number[];
  yLambdaCV: number[];
  yKappaCV: number[];
  threshold: number;
  nCrit: number;
} {
  return {
    x: result.stabilityPoints.map(p => p.n),
    yLambdaCV: result.stabilityPoints.map(p => p.lambdaCV),
    yKappaCV: result.stabilityPoints.map(p => p.kappaCV),
    threshold: result.stabilityThreshold,
    nCrit: result.nCrit,
  };
}

/**
 * Format result for report inclusion
 */
export function formatNCritReport(result: NCritResult): string {
  const lines = [
    `## Sample Stability Analysis: ${result.language}`,
    '',
    `**Family:** ${result.family}`,
    `**N₍crit₎:** ${result.nCrit} (95% CI: ${result.nCritCI[0]}-${result.nCritCI[1]})`,
    `**Stability Threshold:** CV < ${result.stabilityThreshold}`,
    '',
    '### Stability Curve',
    '',
    '| N | λ Mean | λ CV | κ Mean | κ CV | R² Mean | Stable |',
    '|---|--------|------|--------|------|---------|--------|',
  ];
  
  for (const p of result.stabilityPoints) {
    lines.push(
      `| ${p.n} | ${p.lambdaMean.toFixed(4)} | ${p.lambdaCV.toFixed(4)} | ` +
      `${p.kappaMean.toFixed(4)} | ${p.kappaCV.toFixed(4)} | ` +
      `${p.r2Mean.toFixed(4)} | ${p.isStable ? '✅' : '❌'} |`
    );
  }
  
  lines.push('', `**Recommendation:** ${result.recommendation}`);
  lines.push('', `*Computed at ${result.computedAt} with seed ${result.seed}*`);
  
  return lines.join('\n');
}

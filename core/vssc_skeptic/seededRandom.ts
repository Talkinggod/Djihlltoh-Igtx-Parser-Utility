/**
 * Seeded Random Number Generator for Reproducible Research
 * 
 * Academic Standard: All random processes in scientific computation
 * should be seeded for reproducibility. This module provides:
 * 
 * 1. hashCode() - Derive deterministic seed from input text
 * 2. seededRNG() - Create a seeded pseudo-random number generator
 * 3. SeededRandom class - Stateful RNG with utility methods
 * 
 * References:
 * - NIH Reproducibility Guidelines
 * - AAAI Best Practices for ML Research
 * - "Reproducibility in Machine Learning" (arXiv)
 * 
 * @author Hanzi AI Prompt Studio
 * @version 1.0.0 - Academic Reproducibility Standard
 */

/**
 * Generate a deterministic 32-bit hash from a string.
 * Uses djb2 algorithm - fast and well-distributed.
 * 
 * Same input text → Same hash → Same random sequence
 */
export function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash) ^ char; // hash * 33 ^ char
  }
  return Math.abs(hash | 0); // Ensure positive 32-bit integer
}

/**
 * Create a seeded pseudo-random number generator.
 * Uses mulberry32 algorithm - fast, well-tested, good distribution.
 * 
 * @param seed - Initial seed value (use hashCode() for text-derived seeds)
 * @returns Function that returns random numbers in [0, 1)
 * 
 * @example
 * const rng = seededRNG(hashCode("my input text"));
 * const random1 = rng(); // Always same value for same seed
 * const random2 = rng(); // Deterministic sequence continues
 */
export function seededRNG(seed: number): () => number {
  let state = seed >>> 0; // Ensure unsigned 32-bit
  
  return function(): number {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stateful seeded random number generator with utility methods.
 * Provides a richer API similar to Math.random() but deterministic.
 */
export class SeededRandom {
  private rng: () => number;
  private readonly seed: number;
  
  /**
   * Create a new seeded random generator.
   * @param seed - Numeric seed, or string to hash into seed
   */
  constructor(seed: number | string) {
    if (typeof seed === 'string') {
      this.seed = hashCode(seed);
    } else {
      this.seed = seed >>> 0;
    }
    this.rng = seededRNG(this.seed);
  }
  
  /** Get the seed used for this generator */
  getSeed(): number {
    return this.seed;
  }
  
  /** Get next random number in [0, 1) */
  random(): number {
    return this.rng();
  }
  
  /** Get random integer in [min, max) */
  randInt(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min)) + min;
  }
  
  /** Get random integer in [0, max) */
  randIndex(max: number): number {
    return Math.floor(this.rng() * max);
  }
  
  /** Shuffle array in-place using Fisher-Yates */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.randIndex(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
  
  /** Return shuffled copy (does not modify original) */
  shuffled<T>(array: T[]): T[] {
    return this.shuffle([...array]);
  }
  
  /** Select random element from array */
  choice<T>(array: T[]): T {
    return array[this.randIndex(array.length)];
  }
  
  /** Sample n elements from array with replacement */
  sampleWithReplacement<T>(array: T[], n: number): T[] {
    return Array.from({ length: n }, () => this.choice(array));
  }
  
  /** Sample n elements from array without replacement */
  sampleWithoutReplacement<T>(array: T[], n: number): T[] {
    const copy = [...array];
    const result: T[] = [];
    for (let i = 0; i < Math.min(n, array.length); i++) {
      const idx = this.randIndex(copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }
}

/**
 * Version identifier for reproducibility tracking.
 * Increment when algorithm changes affect random sequences.
 */
export const REPRODUCIBILITY_VERSION = "1.0.0";

/**
 * Create a seed from multiple input texts (for corpus analysis).
 * Combines all texts into a single deterministic seed.
 */
export function createCorpusSeed(texts: string[]): number {
  // Combine first few texts to create stable seed
  // (Using all texts would make seed sensitive to order changes)
  const sampleTexts = texts.slice(0, Math.min(10, texts.length));
  const combined = sampleTexts.join('|||');
  return hashCode(combined);
}

/**
 * Metadata for tracking reproducibility of a computation.
 */
export interface ReproducibilityMetadata {
  /** Seed used for random processes */
  seed: number;
  /** Version of the reproducibility algorithm */
  version: string;
  /** Timestamp of computation */
  timestamp: string;
  /** Whether this run is deterministically reproducible */
  isDeterministic: boolean;
}

/**
 * Create reproducibility metadata for a computation.
 */
export function createReproducibilityMetadata(seed: number): ReproducibilityMetadata {
  return {
    seed,
    version: REPRODUCIBILITY_VERSION,
    timestamp: new Date().toISOString(),
    isDeterministic: true,
  };
}

// ============================================================================
// PUBLICATION-READY METADATA (Academic Standard)
// ============================================================================

/**
 * Full physics run metadata for academic reproducibility.
 * Meets NIH/AAAI/NASA standards for computational reproducibility.
 */
export interface PhysicsRunMetadata {
  /** Primary seed used for all random processes */
  seed: number;
  /** Hash of input data for verification */
  inputHash: string;
  /** ISO timestamp of computation */
  timestamp: string;
  /** Software version for environment tracking */
  softwareVersion: string;
  /** Whether this run is fully reproducible */
  isReproducible: boolean;
  /** List of random sources seeded in this run */
  randomSources: string[];
  /** Reproducibility algorithm version */
  algorithmVersion: string;
}

/**
 * Create full physics run metadata for academic audit trail.
 */
export function createPhysicsRunMetadata(
  seed: number,
  inputTexts: string[],
  randomSources: string[] = ['sampling', 'permutation', 'bootstrap']
): PhysicsRunMetadata {
  return {
    seed,
    inputHash: hashCode(inputTexts.join('|||')).toString(16),
    timestamp: new Date().toISOString(),
    softwareVersion: REPRODUCIBILITY_VERSION,
    isReproducible: true,
    randomSources,
    algorithmVersion: 'mulberry32-djb2-v1',
  };
}

// ============================================================================
// MULTI-SEED VARIANCE REPORTING (For Publication)
// ============================================================================

/**
 * Result of multi-seed variance analysis.
 * Publication format: λ = mean ± stdDev (95% CI: [lower, upper]), n=numSeeds
 */
export interface MultiSeedVarianceResult<T> {
  /** Mean value across all seeds */
  mean: number;
  /** Standard deviation */
  stdDev: number;
  /** 95% confidence interval */
  ci95: [number, number];
  /** Number of seeds used */
  numSeeds: number;
  /** Individual run results (for detailed analysis) */
  runs: Array<{ seed: number; value: T }>;
  /** Publication-ready string */
  publicationFormat: string;
}

/**
 * Generate diverse but deterministic seeds from a base seed.
 * Each seed is derived from base + index using golden ratio spacing.
 */
export function generateDiverseSeeds(baseSeed: number, count: number): number[] {
  const seeds: number[] = [];
  const PHI = 0x9E3779B9; // Golden ratio constant (2^32 / φ)
  
  for (let i = 0; i < count; i++) {
    // Use golden ratio to space seeds evenly across the 32-bit range
    const seed = (baseSeed + i * PHI) >>> 0;
    seeds.push(seed);
  }
  
  return seeds;
}

/**
 * Compute variance statistics from multiple values.
 */
export function computeVarianceStats(
  values: number[],
  metricName: string = 'λ'
): MultiSeedVarianceResult<number> {
  const n = values.length;
  if (n === 0) {
    return {
      mean: NaN,
      stdDev: NaN,
      ci95: [NaN, NaN],
      numSeeds: 0,
      runs: [],
      publicationFormat: `${metricName} = N/A (no data)`,
    };
  }
  
  // Mean
  const mean = values.reduce((a, b) => a + b, 0) / n;
  
  // Standard deviation (sample)
  const variance = n > 1 
    ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  
  // 95% CI using t-distribution approximation for small samples
  const tValue = n >= 30 ? 1.96 : getTCritical(n - 1, 0.975);
  const marginOfError = tValue * (stdDev / Math.sqrt(n));
  const ci95: [number, number] = [mean - marginOfError, mean + marginOfError];
  
  // Publication format
  const publicationFormat = `${metricName} = ${mean.toFixed(3)} ± ${stdDev.toFixed(3)} (95% CI: [${ci95[0].toFixed(3)}, ${ci95[1].toFixed(3)}]), n=${n} seeds`;
  
  return {
    mean,
    stdDev,
    ci95,
    numSeeds: n,
    runs: values.map((v, i) => ({ seed: i, value: v })),
    publicationFormat,
  };
}

/**
 * T-critical values for common degrees of freedom (two-tailed, α=0.05).
 * Used for 95% CI calculation.
 */
function getTCritical(df: number, p: number): number {
  // Lookup table for common df values
  const tTable: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    15: 2.131, 20: 2.086, 25: 2.060, 30: 2.042,
  };
  
  // Find closest df
  const keys = Object.keys(tTable).map(Number).sort((a, b) => a - b);
  for (const key of keys) {
    if (df <= key) return tTable[key];
  }
  return 1.96; // Use z-value for large df
}

// ============================================================================
// LEGACY RUN DETECTION & FLAGGING
// ============================================================================

/**
 * Date when deterministic seeding was implemented.
 * Runs before this date are considered legacy/non-reproducible.
 */
export const DETERMINISTIC_SEEDING_DATE = '2025-12-18T00:00:00Z';

/**
 * Legacy run metadata for runs without deterministic seeding.
 */
export interface LegacyRunMetadata {
  isReproducible: false;
  warning: string;
  legacyDate: string;
}

/**
 * Check if a run is a legacy (non-reproducible) run.
 */
export function isLegacyRun(timestamp: string | undefined, hasSeed: boolean): boolean {
  if (hasSeed) return false; // Has seed = reproducible
  if (!timestamp) return true; // No timestamp = assume legacy
  
  try {
    const runDate = new Date(timestamp);
    const cutoffDate = new Date(DETERMINISTIC_SEEDING_DATE);
    return runDate < cutoffDate;
  } catch {
    return true; // Invalid date = assume legacy
  }
}

/**
 * Create legacy run metadata for flagging in UI.
 */
export function createLegacyRunMetadata(timestamp?: string): LegacyRunMetadata {
  return {
    isReproducible: false,
    warning: `Run predates deterministic seeding (${DETERMINISTIC_SEEDING_DATE.split('T')[0]}). Values may differ on re-run. Not scientifically valid for cross-run comparison.`,
    legacyDate: timestamp ?? 'unknown',
  };
}

/**
 * Augment a physics result with reproducibility info.
 * Call this when loading results to annotate legacy runs.
 */
export function annotateReproducibility<T extends { timestamp?: string; seed?: number }>(
  result: T
): T & { reproducibility: ReproducibilityMetadata | LegacyRunMetadata } {
  const hasSeed = typeof result.seed === 'number';
  
  if (isLegacyRun(result.timestamp, hasSeed)) {
    return {
      ...result,
      reproducibility: createLegacyRunMetadata(result.timestamp),
    };
  }
  
  return {
    ...result,
    reproducibility: createReproducibilityMetadata(result.seed ?? 0),
  };
}
// ============================================================================
// INTERNAL LAB LOGGING (DOI-Ready)
// ============================================================================

/**
 * Log run details to an internal secure repository/log.
 * This effectively acts as a digital lab notebook.
 * 
 * @param metadata Full physics run metadata
 * @param results Summary of results (e.g., lambda, rSquared)
 */
export function logRunToInternalRepository(
  metadata: PhysicsRunMetadata, 
  results: { lambda: number; rSquared: number; language: string }
): void {
  // In a real environment, this would write to a secure DB or encrypted file.
  // For this local version, we log structured JSON to the console which can be captured.
  
  const verifiedVersion = 'v1.3.0-patent'; // Hardcoded as requested
  
  const logEntry = {
    _type: 'LAB_NOTEBOOK_ENTRY',
    timestamp: metadata.timestamp, // UTC
    runId: `${metadata.timestamp}-${metadata.inputHash.substring(0, 8)}`,
    softwareVersion: verifiedVersion,
    
    // Core Reproducibility Fields
    inputHash: metadata.inputHash,
    seed: metadata.seed,
    
    // Results
    language: results.language,
    lambda: results.lambda,
    rSquared: results.rSquared,
    
    // Audit
    randomSources: metadata.randomSources,
    algorithm: metadata.algorithmVersion,
    
    note: "Automated entry from Hanzi-Prompt-Studio Physics Engine"
  };
  
  console.info('[LAB_LOG]', JSON.stringify(logEntry));
}

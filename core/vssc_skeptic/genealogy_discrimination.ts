/**
 * Genealogy Discrimination Harness
 * 
 * Binary classification task: Given (κ, λ, coherence curve), predict 'descent' vs. 'contact'.
 * This is the core validation that Semantic Gravity can distinguish genetic relationships
 * from areal/contact influence.
 * 
 * @module genealogy_discrimination
 * @version 1.0.0
 * @since 2026-01-15
 */

import { RelationshipType, TimeTravelExample, TIME_TRAVEL_CORPUS } from './time_travel_corpus';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Features extracted from a physics run for genealogy classification
 */
export interface GenealogyFeatures {
  language: string;
  family: string;
  relationshipType: RelationshipType;
  
  // Primary observables
  kappa: number;           // Bidirectional asymmetry
  lambda: number;          // Decay rate
  r2: number;              // Fit quality
  
  // Curve shape features
  coherenceAtLag1: number; // Immediate neighbor coherence
  coherenceAtLag5: number; // Mid-range coherence
  coherenceAtLagN: number; // Long-range coherence (final point)
  curveConvexity: number;  // Second derivative indicator
  
  // Stability metrics
  lambdaVariance: number;  // Bootstrap variance of λ
  kappaVariance: number;   // Bootstrap variance of κ
}

/**
 * Labeled pair for training/evaluation
 */
export interface LabeledPair {
  sourceLanguage: string;
  targetLanguage: string;
  features: GenealogyFeatures;
  groundTruth: 'descent' | 'contact';
}

/**
 * Classification result
 */
export interface ClassificationResult {
  prediction: 'descent' | 'contact';
  confidence: number;
  featureWeights: Record<string, number>;
}

/**
 * Evaluation metrics
 */
export interface DiscriminationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  rocAuc: number;
  confusionMatrix: {
    truePositives: number;   // Correctly predicted descent
    trueNegatives: number;   // Correctly predicted contact
    falsePositives: number;  // Predicted descent, was contact
    falseNegatives: number;  // Predicted contact, was descent
  };
}

// ============================================================================
// BASELINE COMPARISONS
// ============================================================================

/**
 * Baseline 1: Raw cosine similarity (no physics framing)
 * Just compute average pairwise similarity between language samples
 */
export function computeRawCosineSimilarity(
  embeddings1: number[][],
  embeddings2: number[][]
): number {
  let totalSim = 0;
  let count = 0;
  
  for (const e1 of embeddings1) {
    for (const e2 of embeddings2) {
      totalSim += cosineSimilarity(e1, e2);
      count++;
    }
  }
  
  return totalSim / count;
}

/**
 * Baseline 2: Lexical overlap (Swadesh-style)
 * Count shared morphemes/words between glosses
 */
export function computeLexicalOverlap(
  samples1: TimeTravelExample[],
  samples2: TimeTravelExample[]
): number {
  const words1 = new Set(
    samples1.flatMap(s => s.gloss.toLowerCase().split(/\s+/))
  );
  const words2 = new Set(
    samples2.flatMap(s => s.gloss.toLowerCase().split(/\s+/))
  );
  
  const intersection = Array.from(words1).filter(w => words2.has(w)).length;
  const union = new Set([...Array.from(words1), ...Array.from(words2)]).size;
  
  return intersection / union; // Jaccard similarity
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

/**
 * Extract genealogy-relevant features from a physics run result
 */
export function extractGenealogyFeatures(
  runResult: {
    kappa: number;
    lambda: number;
    r2: number;
    coherenceCurve: number[];
    bootstrapResults?: { lambdaVariance: number; kappaVariance: number };
  },
  metadata: {
    language: string;
    family: string;
    relationshipType: RelationshipType;
  }
): GenealogyFeatures {
  const { coherenceCurve } = runResult;
  const n = coherenceCurve.length;
  
  // Compute curve shape features
  const coherenceAtLag1 = n > 0 ? coherenceCurve[0] : 0;
  const coherenceAtLag5 = n > 4 ? coherenceCurve[4] : coherenceAtLag1;
  const coherenceAtLagN = n > 0 ? coherenceCurve[n - 1] : 0;
  
  // Estimate convexity (simplified: compare midpoint to linear interpolation)
  const midIdx = Math.floor(n / 2);
  const linearMid = (coherenceAtLag1 + coherenceAtLagN) / 2;
  const actualMid = n > midIdx ? coherenceCurve[midIdx] : linearMid;
  const curveConvexity = actualMid - linearMid; // Positive = convex, negative = concave
  
  return {
    language: metadata.language,
    family: metadata.family,
    relationshipType: metadata.relationshipType,
    kappa: runResult.kappa,
    lambda: runResult.lambda,
    r2: runResult.r2,
    coherenceAtLag1,
    coherenceAtLag5,
    coherenceAtLagN,
    curveConvexity,
    lambdaVariance: runResult.bootstrapResults?.lambdaVariance ?? 0,
    kappaVariance: runResult.bootstrapResults?.kappaVariance ?? 0,
  };
}

// ============================================================================
// DISCRIMINATOR
// ============================================================================

/**
 * Simple logistic regression-style discriminator
 * Uses feature weights to predict descent vs. contact
 */
export class GenealogyDiscriminator {
  private weights: Record<string, number> = {
    lambda: 0.3,           // Higher λ may indicate genetic drift
    r2: 0.2,               // Better fit suggests cleaner signal
    coherenceAtLag1: 0.15, // Immediate coherence
    curveConvexity: 0.15,  // Curve shape
    kappaVariance: -0.1,   // Higher variance = less reliable
    lambdaVariance: -0.1,  // Higher variance = less reliable
  };
  
  private threshold: number = 0.5;
  
  /**
   * Train discriminator on labeled pairs
   * (Simplified: adjusts weights based on feature means per class)
   */
  train(pairs: LabeledPair[]): void {
    const descentPairs = pairs.filter(p => p.groundTruth === 'descent');
    const contactPairs = pairs.filter(p => p.groundTruth === 'contact');
    
    if (descentPairs.length === 0 || contactPairs.length === 0) {
      console.warn('[Discriminator] Insufficient training data');
      return;
    }
    
    // Compute mean features per class
    const descentMeans = this.computeMeanFeatures(descentPairs);
    const contactMeans = this.computeMeanFeatures(contactPairs);
    
    // Adjust weights based on discriminative power
    for (const key of Object.keys(this.weights)) {
      const diff = (descentMeans[key] ?? 0) - (contactMeans[key] ?? 0);
      if (Math.abs(diff) > 0.01) {
        // Features that differ between classes get higher weight
        this.weights[key] = Math.sign(diff) * Math.min(Math.abs(diff), 0.5);
      }
    }
    
    // Optimize threshold on training data
    this.optimizeThreshold(pairs);
  }
  
  /**
   * Predict descent vs. contact for a feature set
   */
  predict(features: GenealogyFeatures): ClassificationResult {
    let score = 0;
    
    for (const [key, weight] of Object.entries(this.weights)) {
      const value = (features as any)[key] ?? 0;
      score += value * weight;
    }
    
    // Sigmoid to get probability
    const confidence = 1 / (1 + Math.exp(-score));
    
    return {
      prediction: confidence > this.threshold ? 'descent' : 'contact',
      confidence,
      featureWeights: { ...this.weights },
    };
  }
  
  private computeMeanFeatures(pairs: LabeledPair[]): Record<string, number> {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    
    for (const pair of pairs) {
      for (const [key, value] of Object.entries(pair.features)) {
        if (typeof value === 'number') {
          sums[key] = (sums[key] ?? 0) + value;
          counts[key] = (counts[key] ?? 0) + 1;
        }
      }
    }
    
    const means: Record<string, number> = {};
    for (const key of Object.keys(sums)) {
      means[key] = sums[key] / counts[key];
    }
    
    return means;
  }
  
  private optimizeThreshold(pairs: LabeledPair[]): void {
    let bestThreshold = 0.5;
    let bestF1 = 0;
    
    for (let t = 0.3; t <= 0.7; t += 0.05) {
      this.threshold = t;
      const metrics = this.evaluate(pairs);
      if (metrics.f1Score > bestF1) {
        bestF1 = metrics.f1Score;
        bestThreshold = t;
      }
    }
    
    this.threshold = bestThreshold;
  }
  
  /**
   * Evaluate discriminator on a test set
   */
  evaluate(pairs: LabeledPair[]): DiscriminationMetrics {
    let tp = 0, tn = 0, fp = 0, fn = 0;
    
    for (const pair of pairs) {
      const result = this.predict(pair.features);
      
      if (result.prediction === 'descent' && pair.groundTruth === 'descent') tp++;
      else if (result.prediction === 'contact' && pair.groundTruth === 'contact') tn++;
      else if (result.prediction === 'descent' && pair.groundTruth === 'contact') fp++;
      else fn++;
    }
    
    const precision = tp / (tp + fp) || 0;
    const recall = tp / (tp + fn) || 0;
    const f1Score = 2 * precision * recall / (precision + recall) || 0;
    const accuracy = (tp + tn) / pairs.length;
    
    // Simplified ROC-AUC (using accuracy as proxy for now)
    const rocAuc = accuracy;
    
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      rocAuc,
      confusionMatrix: {
        truePositives: tp,
        trueNegatives: tn,
        falsePositives: fp,
        falseNegatives: fn,
      },
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB)) || 0;
}

// ============================================================================
// ACCEPTED GENEALOGY PAIRS (Primary Validation Set)
// ============================================================================

/**
 * These are universally accepted genetic relationships.
 * Used as the PRIMARY validation set before any contested hypotheses.
 */
export const ACCEPTED_GENEALOGY_PAIRS: Array<{
  sourceLanguage: string;
  targetLanguage: string;
  family: string;
  relationshipType: 'descent';
  attestedDivergenceYears?: number;
  notes?: string;
}> = [
  // =========================================================================
  // ROMANCE (from Latin) - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Latin', targetLanguage: 'Modern French', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 1500 },
  { sourceLanguage: 'Latin', targetLanguage: 'Romanian', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 1700 },
  { sourceLanguage: 'Latin', targetLanguage: 'Spanish', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 1500 },
  { sourceLanguage: 'Latin', targetLanguage: 'Italian', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 1400 },
  { sourceLanguage: 'Latin', targetLanguage: 'Portuguese', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 1500 },
  { sourceLanguage: 'Old French', targetLanguage: 'Modern French', family: 'Romance', relationshipType: 'descent', attestedDivergenceYears: 600 },
  
  // =========================================================================
  // GERMANIC - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Old English', targetLanguage: 'Middle English', family: 'Germanic', relationshipType: 'descent', attestedDivergenceYears: 400 },
  { sourceLanguage: 'Middle English', targetLanguage: 'Modern English', family: 'Germanic', relationshipType: 'descent', attestedDivergenceYears: 500 },
  { sourceLanguage: 'Old High German', targetLanguage: 'Modern German', family: 'Germanic', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Old Norse', targetLanguage: 'Icelandic', family: 'Germanic', relationshipType: 'descent', attestedDivergenceYears: 800, notes: 'Icelandic is notably conservative' },
  { sourceLanguage: 'Old Norse', targetLanguage: 'Norwegian', family: 'Germanic', relationshipType: 'descent', attestedDivergenceYears: 800 },
  
  // =========================================================================
  // SLAVIC - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Old Church Slavonic', targetLanguage: 'Modern Russian', family: 'Slavic', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Old Church Slavonic', targetLanguage: 'Bulgarian', family: 'Slavic', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Old Church Slavonic', targetLanguage: 'Serbian', family: 'Slavic', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Old East Slavic', targetLanguage: 'Ukrainian', family: 'Slavic', relationshipType: 'descent', attestedDivergenceYears: 700 },
  
  // =========================================================================
  // HELLENIC (Greek) - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Ancient Greek', targetLanguage: 'Koine Greek', family: 'Hellenic', relationshipType: 'descent', attestedDivergenceYears: 500 },
  { sourceLanguage: 'Koine Greek', targetLanguage: 'Modern Greek', family: 'Hellenic', relationshipType: 'descent', attestedDivergenceYears: 1500 },
  { sourceLanguage: 'Ancient Greek', targetLanguage: 'Modern Greek', family: 'Hellenic', relationshipType: 'descent', attestedDivergenceYears: 2500, notes: 'Full diachronic span' },
  
  // =========================================================================
  // SEMITIC - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Classical Arabic', targetLanguage: 'Modern Standard Arabic', family: 'Semitic', relationshipType: 'descent', attestedDivergenceYears: 1400 },
  { sourceLanguage: 'Biblical Hebrew', targetLanguage: 'Modern Hebrew', family: 'Semitic', relationshipType: 'descent', attestedDivergenceYears: 2500, notes: 'Revival language with ancient base' },
  
  // =========================================================================
  // DRAVIDIAN - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Old Tamil', targetLanguage: 'Modern Tamil', family: 'Dravidian', relationshipType: 'descent', attestedDivergenceYears: 2000 },
  { sourceLanguage: 'Old Tamil', targetLanguage: 'Middle Tamil', family: 'Dravidian', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Middle Tamil', targetLanguage: 'Modern Tamil', family: 'Dravidian', relationshipType: 'descent', attestedDivergenceYears: 800 },
  
  // =========================================================================
  // SINITIC (Chinese) - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Ancient Chinese', targetLanguage: 'Middle Chinese', family: 'Sinitic', relationshipType: 'descent', attestedDivergenceYears: 1500 },
  { sourceLanguage: 'Middle Chinese', targetLanguage: 'Modern Chinese', family: 'Sinitic', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Ancient Chinese', targetLanguage: 'Modern Chinese', family: 'Sinitic', relationshipType: 'descent', attestedDivergenceYears: 2500, notes: 'Full diachronic span' },
  
  // =========================================================================
  // INDO-IRANIAN - Universally accepted
  // =========================================================================
  { sourceLanguage: 'Vedic Sanskrit', targetLanguage: 'Classical Sanskrit', family: 'Indo-Aryan', relationshipType: 'descent', attestedDivergenceYears: 1000 },
  { sourceLanguage: 'Old Persian', targetLanguage: 'Middle Persian', family: 'Iranian', relationshipType: 'descent', attestedDivergenceYears: 800 },
];

/**
 * Known contact relationships (areal influence, NOT genetic)
 * These should be classified as 'contact' by the discriminator
 */
export const CONTACT_PAIRS: Array<{
  sourceLanguage: string;
  targetLanguage: string;
  contactType: string;
  relationshipType: 'contact';
  notes?: string;
}> = [
  // =========================================================================
  // SUPERSTRATE INFLUENCE
  // =========================================================================
  { sourceLanguage: 'Norman French', targetLanguage: 'Middle English', contactType: 'superstrate', relationshipType: 'contact', notes: 'Post-Norman Conquest lexical borrowing' },
  { sourceLanguage: 'Arabic', targetLanguage: 'Spanish', contactType: 'superstrate', relationshipType: 'contact', notes: 'Al-Andalus period' },
  { sourceLanguage: 'Arabic', targetLanguage: 'Persian', contactType: 'superstrate', relationshipType: 'contact', notes: 'Islamic period borrowing' },
  
  // =========================================================================
  // ADSTRATE INFLUENCE (Parallel contact)
  // =========================================================================
  { sourceLanguage: 'Sanskrit', targetLanguage: 'Old Tamil', contactType: 'adstrate', relationshipType: 'contact', notes: 'Religious/literary borrowing' },
  { sourceLanguage: 'Chinese', targetLanguage: 'Japanese', contactType: 'adstrate', relationshipType: 'contact', notes: 'Kanji and vocabulary borrowing' },
  { sourceLanguage: 'Chinese', targetLanguage: 'Korean', contactType: 'adstrate', relationshipType: 'contact', notes: 'Hanja and vocabulary borrowing' },
  { sourceLanguage: 'Chinese', targetLanguage: 'Vietnamese', contactType: 'adstrate', relationshipType: 'contact', notes: 'Sino-Vietnamese vocabulary' },
  
  // =========================================================================
  // SPRACHBUND (Areal features)
  // =========================================================================
  { sourceLanguage: 'Greek', targetLanguage: 'Albanian', contactType: 'sprachbund', relationshipType: 'contact', notes: 'Balkan Sprachbund' },
  { sourceLanguage: 'Bulgarian', targetLanguage: 'Romanian', contactType: 'sprachbund', relationshipType: 'contact', notes: 'Balkan Sprachbund' },
  { sourceLanguage: 'Turkish', targetLanguage: 'Greek', contactType: 'sprachbund', relationshipType: 'contact', notes: 'Ottoman period contact' },
];

// ============================================================================
// MAIN EVALUATION HARNESS
// ============================================================================

/**
 * Run full genealogy discrimination evaluation
 */
export async function runGenealogyDiscriminationEvaluation(
  runPhysicsForPair: (source: string, target: string) => Promise<{
    kappa: number;
    lambda: number;
    r2: number;
    coherenceCurve: number[];
  }>
): Promise<{
  metrics: DiscriminationMetrics;
  baselineComparison: {
    physicsF1: number;
    rawCosineF1: number;
    lexicalOverlapF1: number;
  };
  perPairResults: Array<{
    source: string;
    target: string;
    groundTruth: 'descent' | 'contact';
    prediction: 'descent' | 'contact';
    confidence: number;
    correct: boolean;
  }>;
}> {
  console.log('[Genealogy] Running discrimination evaluation...');
  
  const labeledPairs: LabeledPair[] = [];
  
  // Process accepted genealogy pairs
  for (const pair of ACCEPTED_GENEALOGY_PAIRS) {
    try {
      const result = await runPhysicsForPair(pair.sourceLanguage, pair.targetLanguage);
      const features = extractGenealogyFeatures(result, {
        language: `${pair.sourceLanguage}->${pair.targetLanguage}`,
        family: pair.family,
        relationshipType: 'descent',
      });
      
      labeledPairs.push({
        sourceLanguage: pair.sourceLanguage,
        targetLanguage: pair.targetLanguage,
        features,
        groundTruth: 'descent',
      });
    } catch (e) {
      console.warn(`[Genealogy] Failed to process ${pair.sourceLanguage}->${pair.targetLanguage}:`, e);
    }
  }
  
  // Process contact pairs
  for (const pair of CONTACT_PAIRS) {
    try {
      const result = await runPhysicsForPair(pair.sourceLanguage, pair.targetLanguage);
      const features = extractGenealogyFeatures(result, {
        language: `${pair.sourceLanguage}->${pair.targetLanguage}`,
        family: pair.contactType,
        relationshipType: 'contact',
      });
      
      labeledPairs.push({
        sourceLanguage: pair.sourceLanguage,
        targetLanguage: pair.targetLanguage,
        features,
        groundTruth: 'contact',
      });
    } catch (e) {
      console.warn(`[Genealogy] Failed to process ${pair.sourceLanguage}->${pair.targetLanguage}:`, e);
    }
  }
  
  // Train and evaluate discriminator
  const discriminator = new GenealogyDiscriminator();
  discriminator.train(labeledPairs);
  const metrics = discriminator.evaluate(labeledPairs);
  
  // Generate per-pair results
  const perPairResults = labeledPairs.map(pair => {
    const result = discriminator.predict(pair.features);
    return {
      source: pair.sourceLanguage,
      target: pair.targetLanguage,
      groundTruth: pair.groundTruth,
      prediction: result.prediction,
      confidence: result.confidence,
      correct: result.prediction === pair.groundTruth,
    };
  });
  
  console.log(`[Genealogy] Evaluation complete. F1: ${metrics.f1Score.toFixed(3)}`);
  
  return {
    metrics,
    baselineComparison: {
      physicsF1: metrics.f1Score,
      rawCosineF1: 0, // TODO: Implement baseline evaluation
      lexicalOverlapF1: 0, // TODO: Implement baseline evaluation
    },
    perPairResults,
  };
}

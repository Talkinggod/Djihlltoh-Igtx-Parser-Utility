/**
 * Precision Math Module
 * 
 * Implements Arbitrary Precision Arithmetic (128-bit+) for Linguistic Physics.
 * Wraps decimal.js to eliminate IEEE 754 floating-point artifacts (epsilon noise).
 * 
 * @copyright MClaxton Talkinggod AI 2026
 * @see docs/COMPUTATIONAL_METHODS.md
 */

import Decimal from 'decimal.js';

// Configure global precision
// 128 digits is sufficient to distinguish "True Zero" (< 1e-100) from Epsilon Noise (~1e-16)
Decimal.set({ precision: 128, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

// ============================================================================
// BASIC AGGREGATION
// ============================================================================

/**
 * High-precision arithmetic mean.
 */
export function precisionMean(values: number[]): Decimal {
  if (values.length === 0) return new Decimal(0);
  
  let sum = new Decimal(0);
  for (const val of values) {
    sum = sum.plus(val);
  }
  
  return sum.dividedBy(values.length);
}

/**
 * High-precision variance (sample variance, n-1 denominator).
 * Uses robust two-pass algorithm or direct Decimal calculation to avoid cancellation.
 */
export function precisionVariance(values: number[]): Decimal {
  if (values.length < 2) return new Decimal(0);
  
  const mean = precisionMean(values);
  let sumSqDiff = new Decimal(0);
  
  for (const val of values) {
    const d = new Decimal(val).minus(mean);
    sumSqDiff = sumSqDiff.plus(d.times(d));
  }
  
  return sumSqDiff.dividedBy(values.length - 1);
}

/**
 * High-precision standard deviation.
 */
export function precisionStdDev(values: number[]): Decimal {
  return precisionVariance(values).sqrt();
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

/**
 * High-precision vector magnitude (L2 norm).
 */
export function precisionMagnitude(vector: number[]): Decimal {
  if (vector.length === 0) return new Decimal(0);
  
  let sumSq = new Decimal(0);
  for (const val of vector) {
    const d = new Decimal(val);
    sumSq = sumSq.plus(d.times(d));
  }
  
  return sumSq.sqrt();
}

/**
 * High-precision cosine similarity.
 */
export function precisionCosineSimilarity(vecA: number[], vecB: number[]): Decimal {
  if (vecA.length !== vecB.length || vecA.length === 0) return new Decimal(0);
  
  let dotProduct = new Decimal(0);
  let sumSqA = new Decimal(0);
  let sumSqB = new Decimal(0);
  
  for (let i = 0; i < vecA.length; i++) {
    const a = new Decimal(vecA[i]);
    const b = new Decimal(vecB[i]);
    
    dotProduct = dotProduct.plus(a.times(b));
    sumSqA = sumSqA.plus(a.times(a));
    sumSqB = sumSqB.plus(b.times(b));
  }
  
  const denominator = sumSqA.sqrt().times(sumSqB.sqrt());
  
  if (denominator.isZero()) return new Decimal(0);
  
  return dotProduct.dividedBy(denominator);
}

// ============================================================================
// REGRESSION & PHYSICS
// ============================================================================

export interface PrecisionRegressionResult {
  slope: Decimal;
  intercept: Decimal;
  rSquared: Decimal;
}

/**
 * High-precision simple linear regression (Least Squares).
 * y = slope * x + intercept
 */
export function precisionLinearRegression(x: number[], y: number[]): PrecisionRegressionResult {
  const n = new Decimal(x.length);
  if (n.lessThan(2)) {
    return { slope: new Decimal(0), intercept: new Decimal(0), rSquared: new Decimal(0) };
  }

  let sumX = new Decimal(0);
  let sumY = new Decimal(0);
  let sumXY = new Decimal(0);
  let sumX2 = new Decimal(0); // Sum of x^2

  for (let i = 0; i < x.length; i++) {
    const xi = new Decimal(x[i]);
    const yi = new Decimal(y[i]);
    
    sumX = sumX.plus(xi);
    sumY = sumY.plus(yi);
    sumXY = sumXY.plus(xi.times(yi));
    sumX2 = sumX2.plus(xi.times(xi));
  }

  // Denominator: n * sum(x^2) - sum(x)^2
  const denominator = n.times(sumX2).minus(sumX.times(sumX));

  if (denominator.abs().lessThan(1e-20)) {
     // Vertical line or single point degeneracy
     return { slope: new Decimal(0), intercept: new Decimal(0), rSquared: new Decimal(0) };
  }

  // Slope: (n * sum(xy) - sum(x) * sum(y)) / denominator
  const slope = n.times(sumXY).minus(sumX.times(sumY)).dividedBy(denominator);
  
  // Intercept: (sum(y) - slope * sum(x)) / n
  const intercept = sumY.minus(slope.times(sumX)).dividedBy(n);

  // R Squared
  // SSres = sum((yi - (slope*xi + intercept))^2)
  // SStot = sum((yi - meanY)^2)
  const meanY = sumY.dividedBy(n);
  let ssRes = new Decimal(0);
  let ssTot = new Decimal(0);

  for (let i = 0; i < x.length; i++) {
    const xi = new Decimal(x[i]);
    const yi = new Decimal(y[i]);
    const predicted = slope.times(xi).plus(intercept);
    
    ssRes = ssRes.plus(yi.minus(predicted).pow(2));
    ssTot = ssTot.plus(yi.minus(meanY).pow(2));
  }
  
  const rSquared = ssTot.isZero() ? new Decimal(1) : new Decimal(1).minus(ssRes.dividedBy(ssTot));

  return { slope, intercept, rSquared };
}

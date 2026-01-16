
/**
 * Vector Math Utilities
 */

export function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((val, i) => val + b[i]);
}

export function vectorSubtract(a: number[], b: number[]): number[] {
  return a.map((val, i) => val - b[i]);
}

export function vectorScale(a: number[], s: number): number[] {
  return a.map(val => val * s);
}

export function zeroVector(dim: number): number[] {
  return new Array(dim).fill(0);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB)) || 0;
}

/**
 * Structured logger for physics pipeline events
 */
export function ske_structuredLog(run_id: string, event: string, data: any) {
  console.log(`[VSSC_SKEPTIC][${run_id}][${event}]`, data);
}


export type CoherencePattern = 'linear' | 'exponential' | 'random';
export type CoherencePlotData = { x: number[], y: number[] };

export function classifyCoherencePattern() {
  return "exponential";
}

export function generateCoherencePlotData() {
  return { x: [], y: [] };
}

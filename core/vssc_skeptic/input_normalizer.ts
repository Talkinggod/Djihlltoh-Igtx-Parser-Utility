
export interface NormalizedExample {
  original: string;
  gloss: string | null;
  translation: string | null;
}

export function normalizeInput(text: string): { examples: NormalizedExample[], detectedFormat: string } {
  const lines = text.split('\n').filter(l => l.trim());
  return {
    examples: lines.map(l => ({ original: l, gloss: null, translation: null })),
    detectedFormat: "raw_lines"
  };
}

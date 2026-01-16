
export type RelationshipType = 'descent' | 'contact';

export interface TimeTravelExample {
  period: string;
  family?: string;
  sourceLanguage?: string;
  gloss: string;
  original: string;
}

export const TIME_TRAVEL_CORPUS: TimeTravelExample[] = [];

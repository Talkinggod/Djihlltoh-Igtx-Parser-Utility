export interface ParserMetadata {
  sourceType: string;
  igtxVersion: string;
  timestamp: string;
  fileSource?: string;
}

export interface ExtractedBlock {
  id: string;
  rawSource: string;
  extractedLanguageLine: string;
  confidence: number;
  warnings: string[];
  lineNumber: number;
}

export interface ParseReport {
  blocks: ExtractedBlock[];
  fullExtractedText: string;
  metadata: ParserMetadata;
  stats: {
    totalLines: number;
    extractedLines: number;
    averageConfidence: number;
  };
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  JSON = 'JSON',
  REPORT = 'REPORT'
}

export type LanguageProfile = 'generic' | 'polysynthetic' | 'analytic' | 'morphological_dense';

export type UILanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ar';

// --- Internal Parse Types ---

export interface PdfTextDiagnostics {
  fragmentedLineRatio: number;
  avgLineLength: number;
  hyphenBreakCount: number;
  isOcr: boolean;
  totalLines: number;
}

export interface Tier4Signal {
  feature: 'orthographic_complexity' | 'morpheme_density' | 'gloss_interaction' | 'metadata_context' | 'layout_structure';
  weight: number;
  description: string;
}

export interface Tier4Assessment {
  requiresTier4: boolean;
  confidence: number;
  signals: Tier4Signal[];
  recommendedAction: string;
}

export interface ParserMetadata {
  sourceType: string;
  igtxVersion: string;
  timestamp: string;
  fileSource?: string;
  tier4Assessment?: Tier4Assessment;
  profileUsed: LanguageProfile;
  provenanceHash: string; 
  blockDefinition: string; 
  pdfDiagnostics?: PdfTextDiagnostics;
}

export interface StructuralAnalysis {
    complexityScore: number; // 0.0 to 1.0
    clauseType: 'simple' | 'chain_clause' | 'compound' | 'complex_embedded' | 'fragment';
    tokenCount: number;
    avgTokenLength: number;
}

export interface SemanticState {
  provenance?: {
    source: 'ai' | 'human';
    model: string;
    generated_at: string;
  };
  predicate: string | null; 
  arguments: string[];
  features: {
    tense: string | null;
    aspect: string | null;
    modality: string | null;
    polarity: string | null;
  };
}

export interface ExtractedBlock {
  id: string;
  rawSource: string;
  extractedLanguageLine: string;
  confidence: number;
  warnings: string[];
  lineNumber: number;
  // Tier 4 Contextual Data
  tier4?: {
    contextual_boost: number;
    warnings: string[];
  };
  structural?: StructuralAnalysis;
  semantic_state?: SemanticState;
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
  // The rigorous schema representation
  igtxDocument: IGTXDocument;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  JSON = 'JSON',
  REPORT = 'REPORT'
}

// --- Scientific / Semantic Gravity Schema (IGTX) ---

export interface IGTXSource {
  title: string;
  author: string;
  year: number | null;
  language: string; // ISO-639-3
  orthography: string;
  source_type: 'pdf' | 'scan' | 'field_notes' | 'legacy_text' | 'web_scrape' | 'unknown';
  // Guardrail 1: Explicit Provenance for AI/Web sources
  source_url?: string;
  retrieval_method?: string;
  model?: string;
  retrieved_at?: string;
}

export interface IGTXProcessingInfo {
  tool: string;
  version: string;
  deterministic: boolean;
  timestamp: string;
  profile_used: LanguageProfile;
  unicode_normalization: 'NFC' | 'NFD' | 'None';
  tier4_assessment?: {
    requires_tier4: boolean;
    confidence: number;
    signals: Tier4Signal[];
    stage2_enrichment?: {
      model: string;
      timestamp: string;
    };
  };
}

export interface IGTXBlock {
  block_id: string; // Deterministic hash
  position: number;
  raw_text: string;
  clean_text: string;
  segmentation: {
    type: 'clause' | 'sentence' | 'discourse_unit';
    confidence: number;
  };
  igt: {
    surface: string[];
    morphology: string[];
    gloss: string[];
    translation: string | null;
  };
  // Stage 3: Semantic Normalization (Placeholders for downstream tools)
  semantic_state: SemanticState;
  // Stage 4: Vector Projection (Placeholders)
  vector_state: {
    embedding: number[] | null; 
    model: string | null;
    dimensionality: number | null;
  };
  integrity: {
      hash: string;
      warnings: string[];
      ai_enrichment?: string;
  };
  tier4?: {
      contextual_boost: number;
      warnings: string[];
  };
}

export interface IGTXDocument {
  document_id: string; // Provenance hash of all blocks
  source: IGTXSource;
  processing: IGTXProcessingInfo;
  blocks: IGTXBlock[];
}

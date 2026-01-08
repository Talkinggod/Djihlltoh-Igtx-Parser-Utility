

export type ParserDomain = 'linguistic' | 'legal';

export type LanguageProfile = 
  | 'generic' 
  | 'polysynthetic' 
  | 'analytic' 
  | 'morphological_dense'
  // Legal Profiles
  | 'legal_pleading'
  | 'legal_contract'
  | 'legal_statute';

export type UILanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ar';

// --- Intelligent Document Type System ---

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';
export type ActionType = 'filing' | 'response' | 'appearance' | 'service' | 'internal';

export interface DocumentTypeAction {
  id: string;
  label: string;
  type: ActionType;
  priority: PriorityLevel;
  description?: string;
}

export interface DocumentTypeDeadline {
  label: string;
  trigger: string; // e.g., "Date of Service"
  duration: number; // days
  isJurisdictional: boolean; // If true, missing this is fatal
}

export interface DocumentTypeStrategy {
  scenario: string;
  recommendation: string;
}

export interface DocumentTypeDefinition {
  id: string; // normalized key e.g. "motion_to_dismiss"
  name: string; // Display name e.g. "Motion to Dismiss"
  category: 'pleading' | 'motion' | 'discovery' | 'judgment' | 'contract' | 'other';
  description: string;
  
  // The "Knowledge Graph" of this document type
  actions: DocumentTypeAction[];
  deadlines: DocumentTypeDeadline[];
  relatedMotions: string[]; // IDs of other document types
  strategies: DocumentTypeStrategy[];
  
  // Validation rules for the parser
  requiredSections?: string[]; // e.g. ["Wherefore Clause", "Verification"]
  isUserDefined?: boolean;
}

// --- Internal Parse Types ---

export interface PdfTextDiagnostics {
  fragmentedLineRatio: number;
  avgLineLength: number;
  hyphenBreakCount: number;
  isOcr: boolean;
  totalLines: number;
}

export interface Tier4Signal {
  feature: 'orthographic_complexity' | 'morpheme_density' | 'gloss_interaction' | 'metadata_context' | 'layout_structure' | 'legal_header' | 'legal_citation';
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
  domain: ParserDomain;
  // Enhanced Metadata
  documentType?: string; // The ID of the selected DocumentTypeDefinition
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

// Linguistic State
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

export type DocStatus = 'checked_in' | 'missing' | 'unavailable' | 'unknown';
export type DocCategory = 'statute' | 'case_law' | 'evidence' | 'contract' | 'affidavit';

export interface FoundationalDocument {
    name: string;      // e.g. "CPLR 3211", "Lease Agreement", "Exhibit A"
    category: DocCategory;
    status: DocStatus;
    context: string;   // Contextual snippet e.g. "Attached as Exhibit A" or "Plaintiff failed to provide"
    description?: string;
}

// Legal State
export interface LegalState {
  provenance?: {
    source: 'ai' | 'human';
    model: string;
    generated_at: string;
  };
  parties: { role: string; name: string }[];
  case_meta: {
    index_number: string | null;
    court: string | null;
    doc_type: string | null;
  };
  legal_points: string[];
  foundational_docs: FoundationalDocument[];
  logic_trace?: string[]; // For "If/Then" logic output and warnings
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
  semantic_state?: SemanticState; // Linguistic Mode
  legal_state?: LegalState;       // Legal Mode
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
  domain: ParserDomain;
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
    type: 'clause' | 'sentence' | 'discourse_unit' | 'legal_paragraph';
    confidence: number;
  };
  igt: {
    surface: string[];
    morphology: string[];
    gloss: string[];
    translation: string | null;
  };
  // Stage 3: Semantic Normalization (Placeholders for downstream tools)
  semantic_state?: SemanticState;
  legal_state?: LegalState;
  
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

// --- Case Management State ---

export interface CaseEvent {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'deadline';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    relatedBlockId?: string;
}

export interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    history: { timestamp: string, content: string }[];
}

export interface StoredDocument {
    id: string;
    name: string;
    content: string; // Text content
    type: string; // PDF, txt
    side: 'plaintiff' | 'defendant' | 'court' | 'neutral';
    dateAdded: string;
}

export interface StoredExhibit {
    id: string;
    label: string; // e.g., "Exhibit A"
    description: string;
    content: string;
    dateAdded: string;
}

export type CaseType = 'LT' | 'Civil' | 'Federal' | 'Small Claims' | 'Other';

export interface CaseMetadata {
    type: CaseType;
    jurisdiction: string;
    plaintiffs: string[];
    defendants: string[];
    indexNumber: string;
}

export interface CaseState {
    id: string;
    name: string; // e.g. "Complaint - Smith v Jones"
    domain: ParserDomain;
    
    // Core Meta
    caseMeta: CaseMetadata;

    // Content State (Active Work Buffer)
    input: string;
    report: ParseReport | null;
    
    // Configuration
    profile: LanguageProfile;
    docTypeId: string;
    referenceDate: Date; // e.g. Filing Date
    
    // Metadata
    sourceMeta: Partial<IGTXSource>;
    pdfDiagnostics?: PdfTextDiagnostics;
    pdfFile?: File; // Store reference to file in memory
    
    // Temporal / Event State
    events: CaseEvent[];
    lastActive: Date;
    isProcessing: boolean;

    // Repositories
    documents: StoredDocument[];
    exhibits: StoredExhibit[];
    notes: Note[];
    
    // Local File System Sync
    localSyncEnabled: boolean;
    directoryHandle?: any; // FileSystemDirectoryHandle (Not serializable to localStorage)
}


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

export interface GoogleUser {
    name: string;
    email: string;
    picture: string;
    accessToken: string;
}

// --- LegalBench Types ---
export type LegalBenchTaskType = 
    | 'hearsay' 
    | 'contract_nli' 
    | 'abercrombie' 
    | 'rule_application' 
    | 'case_hold' 
    | 'proa' 
    | 'cuad_extraction' 
    | 'citation_retrieval'
    | 'unfair_tos'
    | 'ledgar_classification'
    | 'spa_extraction';

export interface LegalBenchResult {
    task: LegalBenchTaskType;
    conclusion: string; // e.g. "Hearsay", "Entailment", "Suggestive"
    reasoning: string;
    confidence: number;
    citations?: string[]; // Referenced rules/cases
    // For CUAD/Retrieval/Extraction
    extracted_clauses?: { type: string; text: string }[];
}

// --- Anomaly Detection Types ---
export interface ExtractedDate {
  date: Date;
  text: string;
  context: string;
  type: 'jurat' | 'filing' | 'signature' | 'reference' | 'service' | 'hearing';
  location: { start: number; end: number };
}

export interface Violation {
  constraintId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  dates: ExtractedDate[];
}

export interface DocumentReference {
  text: string;
  year?: number;
  documentType?: string;
  location: { start: number; end: number };
}

export interface Signature {
  party: string;
  date?: Date;
  location: { start: number; end: number };
}

export interface LegalAnalysisResult {
  documentId: string;
  dates: ExtractedDate[];
  references: DocumentReference[];
  signatures: Signature[];
  violations: Violation[];
  criticalCount: number;
  timestamp: Date;
}

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

// --- CONTRACT AWARENESS TYPES ---

export type ContractComponent = 
    | 'preamble' 
    | 'recitals' 
    | 'definitions' 
    | 'operative_clause' 
    | 'rep_warranty' 
    | 'boilerplate' 
    | 'signature_block'
    | 'other';

export type CoreElement = 'offer' | 'acceptance' | 'consideration' | 'capacity' | 'legality' | null;

export interface ContractRisk {
    severity: 'critical' | 'high' | 'moderate' | 'low';
    category: 'ambiguity' | 'compliance' | 'financial' | 'liability' | 'termination' | 'vulnerability';
    impact: 'adverse' | 'favorable' | 'neutral'; // adverse (Red), favorable (Green), neutral (Amber)
    description: string;
    mitigation?: string;
}

export interface ContractObligation {
    actor: string; // The party responsible
    action: string; // What they must do
    deadline?: string; // When they must do it
    condition?: string; // "If X happens..."
}

export interface ContractAnalysis {
    component_type: ContractComponent;
    core_element: CoreElement;
    risks: ContractRisk[];
    obligations: ContractObligation[];
    statutory_conflict?: string; // e.g. "Conflicts with UCC 2-207"
    missing_elements?: string[]; // e.g. "Missing definition for X"
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
  logic_trace?: string[]; 
  // NEW: Contract Specific Logic
  contract_analysis?: ContractAnalysis;
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
  source_type: 'pdf' | 'scan' | 'field_notes' | 'legacy_text' | 'web_scrape' | 'google_drive' | 'unknown';
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

// --- Advanced Tagging System ---
export type TagCategory = 'temporal' | 'implication' | 'relevance' | 'outcome';

export interface EvidenceTag {
    id: string;
    category: TagCategory;
    label: string; // e.g., "Breach of Contract", "Pre-Incident", "Damages Proof"
    confidence: number; // 0.0 to 1.0 (AI confidence)
    description?: string; // AI explanation of why this tag applies
}

export interface StoredDocument {
    id: string;
    name: string;
    content: string; // Text content
    type: string; // PDF, txt
    side: 'plaintiff' | 'defendant' | 'court' | 'neutral';
    dateAdded: string;
    // New: Semantic Tagging
    tags?: EvidenceTag[];
    markedAsExhibit?: string; // ID of the exhibit if marked
}

export type ExhibitStatus = 'potential' | 'marked' | 'offered' | 'admitted' | 'excluded';

export interface TrialExhibit {
    id: string; // Internal UUID
    designation: string; // The legal mark: "Exhibit A", "PX-1", "DX-A"
    description: string; // "Lease Agreement dated 2024"
    sourceDocumentId?: string; // Link to StoredDocument
    status: ExhibitStatus;
    markedDate: string;
}

export type CaseType = 'LT' | 'Civil' | 'Federal' | 'Small Claims' | 'Other';

export interface CaseMetadata {
    type: CaseType;
    jurisdiction: string;
    plaintiffs: string[];
    defendants: string[];
    indexNumber: string;
}

// NEW: Case Viability / Balance of Equities
export interface ViabilityFactor {
    category: string; // Loose string to allow "Experience Sourced" custom factors
    score: number; // 0-100
    rationale: string;
    key_strengths: string[];
    key_weaknesses: string[];
}

export interface ViabilityAssessment {
    overall_probability: number; // 0-100
    factors: ViabilityFactor[];
    executive_summary: string;
    balance_of_equities: {
        plaintiff_equities: string[];
        defendant_equities: string[];
        conclusion: string;
    };
    generated_at: string;
}

// NEW: Drafting & Templates
export interface Template {
    id: string;
    name: string;
    content: string; // The markdown/text structure
    category: 'Motion' | 'Affidavit' | 'Contract' | 'Order' | 'Other';
}

export interface Draft {
    id: string;
    title: string;
    content: string; // The editable text
    createdAt: string;
    updatedAt: string;
    status: 'Draft' | 'Final';
}

export interface DriveScope {
    id: string;
    name: string;
    type: 'folder' | 'file_set';
}

// NEW: AI Access Control
export interface AIPrivileges {
    allowFullCaseContext: boolean; // Access all documents in case
    allowTemplates: boolean; // Access to stored templates
    allowWebSearch: boolean; // Access to Google Search
    allowLocalFileSystem: boolean; // Access to synced local folder
    driveScope?: DriveScope; // The "Intent Tunnel" Scope
}

// --- File Explorer Types ---
export interface ExplorerItem {
    id: string;
    name: string;
    kind: 'file' | 'directory';
    mimeType?: string; // for Google
    handle?: any; // For Local FileSystemHandle
    size?: string;
    modified?: string;
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
    exhibits: TrialExhibit[];
    notes: Note[];

    // NEW: Strategic Assessment
    viabilityAssessment?: ViabilityAssessment;

    // NEW: Drafting
    templates: Template[];
    drafts: Draft[];
    activeDraftId?: string;
    
    // Local File System Sync
    localSyncEnabled: boolean;
    directoryHandle?: any; // FileSystemDirectoryHandle (Not serializable to localStorage)

    // Google Drive Sync
    googleFolderId?: string;
    googleFolderName?: string;
}

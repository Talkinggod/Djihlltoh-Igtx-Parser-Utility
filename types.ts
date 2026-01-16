
export type ParserDomain = 'linguistic' | 'legal' | 'scientific' | 'belief_system';

export type LanguageProfile = 
  | 'generic' 
  | 'polysynthetic' 
  | 'analytic' 
  | 'morphological_dense'
  | 'legal_pleading'
  | 'legal_contract'
  | 'legal_statute'
  | 'narrative';

export interface GoogleUser {
    name: string;
    email: string;
    picture: string;
    accessToken: string;
}

// --- TWO-LAYER ARCHITECTURE (Semantic Gravity 2.0) ---

/**
 * Measurement Layer: Passive, Descriptive, Non-Interventionist
 * Derived directly from the linguistic object's properties as physical observables.
 */
export interface MeasurementLayer {
    λ_measured: number;     // Coherence Decay Observable: C(ℓ) = C₀ · e^(−λℓ)
    κ_physics: number;      // Trajectory Symmetry Observable: |λ_fwd − λ_bwd| / avg
    r_squared: number;      // Fit quality (Descriptive validity)
    is_admissible: boolean; // Eligibility Gate status
    refusal_reason?: string;
}

/**
 * Application Layer: Active, Goal-Directed, Domain-Conditioned
 * User-defined intent and constraints for transformation.
 */
export interface ApplicationLayer {
    λ_control: number;      // Transformation Aggressiveness (0-1)
    κ_preserve: number;     // Forward Preservation (Obligations/Constraints)
    κ_ground: number;       // Backward Grounding (Claim Support)
    target_domain: string;
}

export interface CalibrationEntry {
    domain: string;
    λ_baseline: [number, number]; // Expected range [min, max]
    κ_threshold: number;         // Max allowable asymmetry
}

// --- Internal Parse Types ---

export interface Tier4Assessment {
    isConsistent: boolean;
    detectedFeatures: string[];
    avgWordLength: number;
    polysynthesisScore: number;
    notes: string;
}

export interface ParserMetadata {
  sourceType: string;
  igtxVersion: string;
  timestamp: string;
  profileUsed: LanguageProfile;
  domain: ParserDomain;
  provenanceHash: string; 
  twoLayerState: {
      physics: MeasurementLayer;
      control: ApplicationLayer;
  };
  // Added documentType property
  documentType?: string;
  tier4Assessment?: Tier4Assessment;
}

export interface StructuralAnalysis {
    complexityScore: number;
    clauseType: 'simple' | 'chain_clause' | 'compound' | 'complex_embedded' | 'fragment';
    tokenCount: number;
}

export interface ExtractedBlock {
  id: string;
  rawSource: string;
  extractedLanguageLine: string;
  confidence: number;
  lineNumber: number;
  structural?: StructuralAnalysis;
  // Added warnings, semantic_state, and legal_state properties
  warnings?: string[];
  semantic_state?: any;
  legal_state?: any;
}

export interface ParseReport {
  blocks: ExtractedBlock[];
  fullExtractedText: string;
  metadata: ParserMetadata;
  coherenceCurve: number[];
  stats: {
    totalLines: number;
    extractedLines: number;
    averageConfidence: number;
  };
  // Added igtxDocument property
  igtxDocument?: any;
}

// --- Case Management ---

export type CaseType = 'Civil' | 'LT' | 'Federal' | 'Small Claims';

export interface CaseMetadata {
    type: CaseType;
    jurisdiction: string;
    plaintiffs: string[];
    defendants: string[];
    indexNumber: string;
}

export interface CaseState {
    id: string;
    name: string;
    domain: ParserDomain;
    input: string;
    report: ParseReport | null;
    profile: LanguageProfile;
    referenceDate: Date;
    lastActive: Date;
    isProcessing: boolean;
    documents: StoredDocument[];
    caseMeta: CaseMetadata;
    events: CaseEvent[];
    drafts: Draft[];
    activeDraftId?: string;
    notes: Note[];
    exhibits: TrialExhibit[];
    localSyncEnabled: boolean;
    googleFolderId?: string;
    // Two-Layer Params
    λ_control: number;
    // Added missing properties for workspace management
    docTypeId?: string;
    viabilityAssessment?: ViabilityAssessment;
    directoryHandle?: any;
    customRules?: CustomRule[];
    templates?: Template[];
    sourceMeta?: Partial<IGTXSource>;
    claims?: Claim[]; // Intelligent Claim Notification System
}

export interface IGTXSource {
  title: string;
  source_type: 'pdf' | 'legacy_text' | 'web_scrape';
  // Added source_url and other metadata fields
  source_url?: string;
  retrieval_method?: string;
  model?: string;
  retrieved_at?: string;
}

export interface PdfTextDiagnostics {
    totalLines: number;
    isOcr: boolean;
    // Added extended diagnostics fields
    fragmentedLineRatio?: number;
    avgLineLength?: number;
    hyphenBreakCount?: number;
}

export interface EvidenceTag {
    id: string;
    category: 'temporal' | 'implication' | 'relevance' | 'outcome';
    label: string;
    confidence: number;
    description?: string;
}

export interface StoredDocument {
    id: string;
    name: string;
    content: string;
    type: string;
    dateAdded: string;
    // Added metadata fields for case management
    side?: 'plaintiff' | 'defendant' | 'neutral';
    category?: string;
    folderPath?: string;
    tags?: EvidenceTag[];
}

export interface TrialExhibit {
    id: string;
    designation: string;
    description: string;
    status: ExhibitStatus;
    markedDate: string;
    // Added reference to source document
    sourceDocumentId?: string;
}

export type ExhibitStatus = 'potential' | 'marked' | 'offered' | 'admitted' | 'excluded';

export interface Draft {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    status: 'Draft' | 'Final';
}

export interface Note {
    id: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    // Added history field
    history?: any[];
}

export interface CaseEvent {
    id: string;
    // Added 'success' type
    type: 'info' | 'warning' | 'error' | 'deadline' | 'success';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

export interface Claim {
    id: string;
    title: string; // e.g. "Breach of Contract"
    description: string;
    status: 'potential' | 'asserted' | 'defended' | 'dismissed';
    likelihood: number; // 0-100
    supportingEvidenceIds?: string[];
    detectedAt: string;
}

export type UILanguage = 'en' | 'zh-CN' | 'zh-TW' | 'ar';

// --- AI & Strategy Types ---

export interface AIPrivileges {
    allowFullCaseContext: boolean;
    allowTemplates: boolean;
    allowWebSearch: boolean;
    allowLocalFileSystem: boolean;
    driveScope?: { id: string, name: string, type: string };
}

export interface ViabilityFactor {
    category: string;
    score: number;
    rationale: string;
    key_strengths: string[];
    key_weaknesses: string[];
}

export interface ViabilityAssessment {
    overall_probability: number;
    factors: ViabilityFactor[];
    executive_summary: string;
    balance_of_equities: {
        plaintiff_equities: string[];
        defendant_equities: string[];
        conclusion: string;
    };
    generated_at: string;
}

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
  | 'spa_extraction'
  | 'anomaly_scan';

export interface LegalBenchResult {
    task: string;
    conclusion: string;
    reasoning: string;
    confidence: number;
    citations?: string[];
    extracted_clauses?: Array<{ type: string, text: string }>;
}

export interface LegalAnalysisResult {
    documentId: string;
    dates: ExtractedDate[];
    references: DocumentReference[];
    signatures: Signature[];
    violations: Violation[];
    criticalCount: number;
    timestamp: Date;
    // Track if AI was used for this result
    isAiAugmented?: boolean;
}

export interface ExtractedDate {
    date: Date;
    text: string;
    context: string;
    type: 'filing' | 'hearing' | 'service' | 'signature' | 'jurat' | 'reference' | 'incident' | 'deadline';
    location: { start: number, end: number };
    source?: 'regex' | 'ai'; // Provenance
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
    location: { start: number, end: number };
    source?: 'regex' | 'ai'; // Provenance
}

export interface Signature {
    party: string;
    date?: Date;
    location: { start: number, end: number };
}

export interface Template {
    id: string;
    name: string;
    content: string;
    category: string;
}

export interface CustomRule {
    id: string;
    name: string;
    pattern: string;
    active: boolean;
    color: string;
    flags?: string;
}

export interface ExplorerItem {
    id: string;
    name: string;
    kind: 'file' | 'directory';
    handle?: any;
    mimeType?: string;
    size?: number;
    modified?: string;
}

export interface DocumentTypeDefinition {
    id: string;
    name: string;
    category: string;
    description: string;
    actions: DocumentTypeAction[];
    deadlines: DocumentTypeDeadline[];
    relatedMotions: string[];
    strategies: DocumentTypeStrategy[];
    requiredSections: string[];
    isUserDefined?: boolean;
}

export interface DocumentTypeAction {
    id: string;
    label: string;
    type: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    description?: string;
}

export interface DocumentTypeDeadline {
    label: string;
    trigger: string;
    duration: number | string;
    isJurisdictional: boolean;
}

export interface DocumentTypeStrategy {
    scenario: string;
    recommendation: string;
}

export type LogEvent = 
  | "PIPELINE_START"
  | "EMBEDDING_PROVIDER"
  | "TOKENIZER_REAL"
  | "EVALUATION_JUDGE"
  | "POLICY_DECISION"
  | "FALLBACK_EVENT"
  | "PIPELINE_END"
  | "EMBEDDING_BATCH_START"
  | "EMBEDDING_BATCH_COMPLETE"
  | "EMBEDDING_CHUNK_FAILED";

export interface VsscSkepticSettings {
    enabled: boolean;
    alpha: number;
    fidelity: number;
    industry: string;
    preserveCode: boolean;
    preserveLaTeX: boolean;
    preserveAcronyms: boolean;
    embeddingModel: string;
    embeddingDimension: number;
    targetModel: string;
    skepticProof: boolean;
    embeddingProvider: string;
    embeddingTimeoutMs: number;
    userFidelityThreshold: number;
    hanziDensity: number;
    regexProfile: string;
    huggingfaceToken?: string;
    minValidVectors?: number;
    simulateApiFailure?: string;
    targetModelHint?: string;
}

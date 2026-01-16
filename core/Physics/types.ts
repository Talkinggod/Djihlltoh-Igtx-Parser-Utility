// Confidential & Proprietary - (c) 2025 MClaxton Talkinggod AI
import {
  INDUSTRY_GLOSSARIES,
  MODEL_CONFIGS,
  OUTPUT_FORMATS,
  TARGET_AUDIENCES,
  PROMPT_MIDDLEWARE,
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLES,
  IMAGE_RESOLUTIONS,
  VIDEO_DURATIONS,
  VIDEO_MOTION_LEVELS,
  FINANCIAL_STATEMENTS,
  LEGAL_TASKS,
  LEGAL_DOCUMENT_TYPES,
  LEGAL_ANALYSIS_FOCUS_AREAS,
  LEGAL_ARGUMENTATIVE_STANCES,
  LEGAL_CITATION_STYLES,
  ELEVENLABS_STABILITY_OPTIONS,
  COMPRESSION_PROFILES,
  OUTPUT_LANGUAGES,
} from "./constants";

// --- Core Types ---
export type TargetModel = keyof typeof MODEL_CONFIGS;
export type ModelType = "llm" | "image" | "audio" | "video" | "tts";
export type PromptMiddleware = keyof typeof PROMPT_MIDDLEWARE;
export type Industry = keyof typeof INDUSTRY_GLOSSARIES;
export type OutputFormat = keyof typeof OUTPUT_FORMATS;
export type OutputLanguage = keyof typeof OUTPUT_LANGUAGES;
export type TargetAudience = keyof typeof TARGET_AUDIENCES;
export type ContextWindow = string;
export type ApiKeys = Record<string, string>;
export type CompressionProfile = keyof typeof COMPRESSION_PROFILES;

// --- VSSC Types ---
export type MinifyMode = "paragraphs" | "single-line";

export type PhysicsMode = "galaxy" | "gravity" | "strict" | "balanced" | "monitor";

export interface VsscSettings {
  enabled: boolean;
  alpha: number; // 0-100
  fidelity: number; // 0-1
  industry: Industry;
  preserveCode: boolean;
  preserveLaTeX: boolean;
  preserveAcronyms: boolean;
  embeddingModel: string;
  embeddingDimension: number;
  targetModel: TargetModel; // Added to pass for cost calculation
  skepticProof: boolean; // Feature flag for the new pipeline
  physicsMode?: PhysicsMode; // Physics-based compression modes
  useSemanticSignals?: boolean;
  useAggressiveCore?: boolean;
  domainContext?: SlerpDomainContext;
  categoryRetentionOverrides?: Partial<Record<TokenCategory, number>>;
  fidelityScaling?: {
    base?: number;
    gain?: number;
  };
  keywordPreservation?: string[];
  minifyWhitespace?: boolean;
  minifyMode?: MinifyMode;
  useAllGlossaries?: boolean; // Merge all industry glossaries + Hanzi
  
  // PHASE 2: Physics integration parameters
  /** λ_sentence - coherence decay rate (lower = more stable = more aggressive compression) */
  lambda?: number;
  /** κ (kappa) - forward/backward asymmetry */
  kappa?: number;
}

export interface VsscMetrics {
  originalTokens: number;
  compressedTokens: number;
  reductionPercent: number;
  semanticFidelity: number;
  hanziDensity: number;
  costEstimate: {
    original: number;
    compressed: number;
    saved: number;
  };
  temporalAnchors?: TemporalStats;
  // Intent Tunnel / structural metrics (optional)
  syntacticEnergy?: number;
  structuralIntegrity?: number;
  inTunnel?: boolean;
  totalEnergy?: number;
  sectionIntegrity?: number;
  roleIntegrity?: number;
  sectionSemanticIntegrity?: number;
  roleSemanticIntegrity?: number;
  topologyPenalty?: number;
  roleTaskIntegrity?: number;
  constraintPreservation?: number;
  compositeFidelity: number;
  // Galaxy/Gravity Physics Metrics
  galaxyMetrics?: {
    domainBoundaries: number;
    entities: number;
    relationships: number;
    avgImportance: number;
    topDomains?: string[];
  };
  backoffDiagnostics?: string[];
  // Embedding Data for Visualization (NEW)
  embeddingData?: {
    tokens: string[];           // Token text
    embeddings: number[][];     // Full-dimensional vectors
    categories?: string[];      // Token categories for coloring
    fidelities?: number[];      // Per-token fidelity scores
  };
}

// --- VSSC Internal Pipeline Types ---
export interface PromptSegment {
  text: string;
  type: "compressible" | "preserved";
}

export type TokenCategory = "determinative" | "technical" | "text" | "filler";

export interface CategoryAggregateStats {
  count: number;
  avgAlpha: number;
  avgFidelity: number;
}

export interface CategoryStats {
  determinative: CategoryAggregateStats;
  technical: CategoryAggregateStats;
  text: CategoryAggregateStats;
  filler: CategoryAggregateStats;
}

export interface WordToken {
  text: string;
  embedding: number[];
  isCompressible: boolean;
  category?: TokenCategory;
  compressedEmbedding?: number[];
  replacement?: string;
  skip?: boolean;
  determinative?: boolean;
  allowCompression?: boolean;
  compressionAlpha?: number;
  wasCompressed?: boolean;
  fidelity?: number;
  rejectionReason?: string;
  temporal?: boolean;
  rolePreserved?: boolean;
}

export interface TemporalStats {
  total: number;
  preserved: number;
}

export interface TemporalAnchor {
  text: string;
  segmentIndex: number;
  tokenIndex: number;
  category?: TokenCategory;
  determinative: boolean;
  allowCompression?: boolean;
}

export interface TemporalTimelineEntry {
  order: number;
  label: string;
  segmentIndex: number;
  tokenIndex: number;
}

export type TemporalAnomalyType =
  | "missing-anchor"
  | "ordering-gap"
  | "over-compressed";

export interface TemporalAnomaly {
  type: TemporalAnomalyType;
  message: string;
  anchorIndices?: number[];
}

export interface TemporalAnalysis {
  stats: TemporalStats;
  anchors: TemporalAnchor[];
  timeline: TemporalTimelineEntry[];
  anomalies: TemporalAnomaly[];
}

export interface ProcessedSegment extends PromptSegment {
  tokens?: WordToken[];
  embedding?: number[];
  critical?: boolean;
  rolePreserved?: boolean;
  roleLabel?: string;
}

// --- VSSC Skeptic-Proof Types ---
export type SkepticEmbeddingProvider =
  | "local-transformers"
  | "huggingface-endpoint"
  | "cloudflare-ai"
  | "semantic-galaxy"
  | "hf-inference"
  | "google"
  | "cohere";

export interface CloudflareEmbeddingConfig {
  accountId: string;
  apiToken: string;
  model: string;
  gatewayUrl?: string;
}

export interface VsscSkepticSettings extends VsscSettings {
  embeddingProvider: SkepticEmbeddingProvider;
  embeddingTimeoutMs: number;
  userFidelityThreshold: number; // User-defined τ
  hanziDensity: number; // 0-100, probability of substituting English words with Chinese
  regexProfile: "baseline" | "comprehensive"; // NEW: Regex tier selection
  allowOvercompress?: boolean; // If true, enable ultra keyword-extraction regex
  overcompressProfile?: "ultra"; // Future extension; currently supports "ultra"
  useRegexOnly?: boolean; // Allow forcing legacy regex pipeline
  useSemanticGravity?: boolean; // LAB: curvature/field boost (opt-in)
  useSemanticSignals?: boolean; // LAB: Semantic Galaxy sentiment/entities (opt-in)
  useAggressiveCore?: boolean; // LAB: Aggressive Semantic Core Extraction (opt-in)
  simulateApiFailure?: "embeddings" | "tokenizer" | "evaluator";
  /**
   * HuggingFace API token for hf-inference provider.
   * Get free token at: https://huggingface.co/settings/tokens
   */
  huggingfaceToken?: string;
  /**
   * Physics validation mode
   * - 'strict': Research-grade (reject on any gate failure, current thresholds)
   * - 'balanced': Production-grade (calibrated thresholds, occasional reverts OK)
   * - 'monitor': Log violations but never revert (for benchmarking)
   * - 'galaxy': Enhanced mode using Semantic Galaxy framework
   * - 'gravity': Enhanced mode using Semantic Gravity framework
   */
  physicsMode?: "strict" | "balanced" | "monitor" | "galaxy" | "gravity";
  cloudflareConfig?: CloudflareEmbeddingConfig;
  llmlingua?: LLMLinguaSettings;
  /**
   * Minimum number of valid vectors required for physics computation.
   * Default: 50. Can be lowered for low-resource experiments (e.g., Moonshot).
   */
  minValidVectors?: number;
}

/**
 * Physics gate thresholds (mode-dependent)
 */
export interface PhysicsThresholds {
  energyLossFloor: number;
  structuralIntegrityFloor: number;
  kappaThreshold: number;
}

export const PHYSICS_THRESHOLD_PRESETS: Record<
  "strict" | "balanced" | "monitor" | "galaxy" | "gravity",
  PhysicsThresholds
> = {
  strict: {
    energyLossFloor: 0.1,
    structuralIntegrityFloor: 0.85,
    kappaThreshold: 0.15,
  },
  balanced: {
    energyLossFloor: 0.15,
    structuralIntegrityFloor: 0.82,
    kappaThreshold: 0.18,
  },
  monitor: {
    energyLossFloor: 1,
    structuralIntegrityFloor: 0,
    kappaThreshold: 1,
  },
  galaxy: {
    energyLossFloor: 0.1,
    structuralIntegrityFloor: 0.85,
    kappaThreshold: 0.15,
  },
  gravity: {
    energyLossFloor: 0.1,
    structuralIntegrityFloor: 0.85,
    kappaThreshold: 0.15,
  },
};

export interface PolicyDecision {
  decision: "VSSC_EN" | "VSSC_ZN" | "MoE" | "BASELINE";
  reason: string;
  trace: {
    predictedCost: number;
    predictedFidelity: number;
    userThreshold: number;
  };
}

export interface EvaluationResult {
  compositeFScore: number;
  subScores: {
    consistency: number;
    relevance: number;
    clarity: number;
  };
  rawJudgeOutput: string;
}

export type HanziEnergyReason = "ENERGY_FLOOR" | "NO_CANDIDATE" | "ACCEPTED";

export interface HanziEnergyCheck {
  original: string;
  hanzi: string;
  energyLoss: number;
  lossRatio: number;
  accepted: boolean;
  reason: HanziEnergyReason;
}

export interface PhysicsEnergyGate {
  threshold: number;
  averageLoss: number;
  maxLoss: number;
  rejected: number;
  applied: number;
  checks: HanziEnergyCheck[];
}

export interface PhysicsDiagnostics {
  kappa: number;
  kappaThreshold: number;
  forwardFidelity: number;
  backwardFidelity: number;
  structuralIntegrity: number;
  structuralThreshold: number;
  energyGate?: PhysicsEnergyGate;
  status: "stable" | "warning" | "rejected";
  rejectionReason?: "FIDELITY" | "STRUCTURE" | "KAPPA";
}

export interface SkepticMetrics extends VsscMetrics {
  policy: PolicyDecision;
  evaluation: EvaluationResult;
  netSavings: number;
  overheads: {
    total: number;
    breakdown: Record<string, number>;
  };
  tokenizationDelta: {
    heuristic: number;
    real: number;
    diff: number;
  };
  interpretiveSymmetry?: {
    kappa: number;
    forwardFidelity: number;
    backwardFidelity: number;
    threshold: number;
    stable: boolean;
  };
  physics?: PhysicsDiagnostics;
  semanticDensity?: number;
  entityCount?: number;
  sentiment?: string;
  mockEmbeddingsDetected?: boolean;
}

// --- LLMLingua Types ---
export interface LLMLinguaSettings {
  enabled: boolean;
  compressionRate: number; // Target compression rate (0.1 = 90% compression, 0.5 = 50% compression)
  targetToken: number; // Target token count (alternative to compressionRate)
  useTokenLevel: boolean; // true = token-level compression, false = sentence-level
  dynamicContextRatio: number; // Ratio for dynamic context compression (0.0-1.0)
  conditionInQuestion: string; // Conditioning question for better context preservation
  rerankingModel: "llmlingua" | "longllmlingua" | "none"; // Reranking strategy
  endpoint?: string; // Optional: Python service endpoint for LLMLingua
}

export interface LLMLinguaResponse {
  compressed_prompt: string;
  origin_tokens: number;
  compressed_tokens: number;
  ratio: string;
  saving: string;
  rate: string;
}

// --- SLERP Compression Types ---
export interface SlerpDomainContext {
  name: string; // e.g., "legal", "medical", "creative"
  glossary?: string[];
  lambda?: number; // semantic drift damping
  eta?: number; // base compression contraction
  phiScale?: number; // multiplier for potential depth calculations
}

export interface SlerpSettings {
  enabled: boolean;
  alpha: number; // 0-1 interpolation weight (0 = original, 1 = fully compressed)
  tiers: number[]; // Regex tiers to apply before SLERP (1-3)
  endpoint: string; // Base endpoint for SLERP service (/compress)
  regexOnly: boolean; // Use regex-only endpoint (no embeddings/fidelity)
  domainContext?: SlerpDomainContext;
}

export type SlerpCompressionMode = "semantic" | "regex";

export interface SlerpCompressionMetrics {
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
  ratioLabel: string;
  savingPercent: number;
  savingLabel: string;
  fidelityScore?: number; // 0-1, undefined when regex-only
  alpha: number;
  tiersUsed: number[];
  mode: SlerpCompressionMode;
  semanticPotential?: {
    domain: string;
    phi: number;
    lambda: number;
    eta: number;
    glossaryHits: number;
    adjustedAlpha: number;
  };
  physics?: PhysicsDiagnostics;
}

// --- Lyricalis Types ---
export interface LyricalisSettings {
  targetLanguage: string; // Canonical ISO code
  targetLanguageInput: string; // User-entered label (code or language name)
  enableRhythmLock: boolean;
  suggestionCount: number;
  autoApplyRhythmHints: boolean;
  lyricScriptMode: "original" | "romanized";
}

export interface LyricalisStem {
  id: string;
  label: string;
  role: "vocals" | "instrumental" | "bass" | "drums" | "other";
  url: string;
}

export interface LyricalisJob {
  id: string;
  status: "pending" | "processing" | "complete" | "error";
  progress: number;
  message?: string;
}

export interface LyricalisAnalysisSection {
  name: string;
  startMs: number;
  endMs: number;
}

export interface LyricalisLyricLine {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  syllables: number;
  language?: string;
}

export interface LyricalisAnalysis {
  bpm: number | null;
  key: string | null;
  scale: string | null;
  sections: LyricalisAnalysisSection[];
  lyrics: LyricalisLyricLine[];
  melodyPreviewUrl?: string;
  stems?: LyricalisStem[];
}

export interface LyricalisSuggestion {
  candidate: string;
  language: string;
  similarity: number;
  syllableDelta: number;
  rhythmScore?: number;
}

export interface LyricalisExportResult {
  prompt: string;
  assets: {
    pdf?: string;
    midi?: string;
    json?: any;
  };
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

export interface StructuredLog {
  run_id: string;
  timestamp: string;
  event: LogEvent;
  data: any;
}

// --- Media Studio Types ---
export type ImageAspectRatio = keyof typeof IMAGE_ASPECT_RATIOS;
export type ImageStyle = keyof typeof IMAGE_STYLES;
export type ImageResolution = keyof typeof IMAGE_RESOLUTIONS;
export type VideoDuration = keyof typeof VIDEO_DURATIONS;
export type VideoMotion = keyof typeof VIDEO_MOTION_LEVELS;

export interface AudioSettings {
  isInstrumental: boolean;
  sunoSongDescription: string;
  sunoLyricsAndStructure: string;
  isGeneratingSongFromImage?: boolean;
}

export type ElevenV3Stability = keyof typeof ELEVENLABS_STABILITY_OPTIONS;

export interface VoiceSettings {
  script: string;
  voiceId: string;
  elevenV3Stability: ElevenV3Stability;
  isExtractingFromImage?: boolean;
}

export interface ImageSettings {
  model: TargetModel;
  aspectRatio: ImageAspectRatio;
  style: ImageStyle;
  resolution: ImageResolution;
}

export interface VideoSettings {
  duration: VideoDuration;
  motionLevel: VideoMotion;
}

export interface NeoBabelPromptPart {
  id: string;
  language: string;
  text: string;
}

// --- Finance Studio Types ---
export type DataSourceType = "csv" | "json" | "sql" | "financial_statements";
export type FinancialStatement = (typeof FINANCIAL_STATEMENTS)[number];

export interface FinanceSettings {
  question: string;
  dataSourceType: DataSourceType;
  csvHeaders: string;
  jsonSchema: string;
  sqlSchema: string;
  availableStatements: Record<FinancialStatement, boolean>;
}

// --- Legal Studio Types ---
export type LegalTask = keyof typeof LEGAL_TASKS;
export type DocumentType = keyof typeof LEGAL_DOCUMENT_TYPES;
export type AnalysisFocus = keyof typeof LEGAL_ANALYSIS_FOCUS_AREAS;
export type ArgumentativeStance = keyof typeof LEGAL_ARGUMENTATIVE_STANCES;
export type CitationStyle = keyof typeof LEGAL_CITATION_STYLES;
export type LegalPartyRole = "plaintiff" | "defendant" | "other";

export interface LegalParty {
  id: string;
  name: string;
  role: LegalPartyRole;
}

export interface JSONFormattingConfig {
  enabled: boolean;
  outputStyle: "minimal" | "verbose";
  includeRehydrationHarness: boolean;
}

export interface VSSCConfig {
  enabled: boolean;
  fidelityThreshold: number;
  embeddingModel: string;
  targetLLM: "openai" | "claude" | "qianwen" | "ernie";
  crossLingual: boolean;
}

export interface LegalSettings {
  task: LegalTask;
  // Context
  jurisdiction: string;
  governingLaw: string;
  parties: LegalParty[];
  // Drafting
  documentType: DocumentType;
  requiredClauses: string;
  // Review & Analysis
  analysisFocus: AnalysisFocus[];
  // Research
  legalQuestion: string;
  // Shared
  argumentativeStance: ArgumentativeStance;
  citationStyle: CitationStyle;
  tone: string;
  jsonFormatting: JSONFormattingConfig;

  // New features
  autoRedact: boolean;
  redactionRules: string[];
  vsscConfig: VSSCConfig;
}

// --- Advanced Compression Types ---
export interface CompressionSettings {
  removePolitenessMarkers: boolean;
  removeHedges: boolean;
  removeDiscourseMarkers: boolean;
  compressCircumlocutions: boolean;
  preserveDeterminativeIntent: boolean;
  crossCulturalDirectness: "neutral" | "high" | "contextual";
}

export interface LinguisticMetrics {
  determinativeDensity: number;
  redundancyScore: number;
  compressionEfficiency: number;
  semanticFidelity: number;
}

// --- Main Settings Interface ---
export interface Settings {
  targetModel: TargetModel;
  autoOptimization: boolean;

  hanziDensity: number;
  industry: Industry;
  useAllGlossaries: boolean; // Merge all industry glossaries + Hanzi
  enableChengyu: boolean;
  symbolicLogic: boolean;
  contextWindow: ContextWindow;
  outputFormat: OutputFormat;
  outputLanguage: OutputLanguage;

  targetAudience: TargetAudience;
  preferFencedCodeBlocks: boolean;

  temperature: number;
  maxTokens: number;

  middleware: Record<PromptMiddleware, boolean>;

  compressionProfile: CompressionProfile;
  compressionCoPilot: boolean;
  coPilotModel: TargetModel;
  coPilotInfluence: number;
}

// --- UI & Data Types ---
export type ActiveTab =
  | "settings"
  | "image"
  | "notes"
  | "explorer"
  | "lyricalis"
  | "physics"
  | "gravity";

export interface TokenStats {
  original: number;
  optimized: number;
  saved: number;
  reduction: number;
  cost: {
    original: number;
    optimized: number;
    saved: number;
  };
}

export interface PerformanceMetrics {
  latency: number;
  // LLM-specific metrics
  semanticFidelity?: number;
  instructionAdherence?: number;
  // Image-specific metrics
  safetyFeedback?: any; // Using 'any' for flexibility with the API's object structure
}

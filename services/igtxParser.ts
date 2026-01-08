

import { ExtractedBlock, ParseReport, ParserMetadata, Tier4Assessment, Tier4Signal, LanguageProfile, IGTXDocument, IGTXBlock, IGTXSource, PdfTextDiagnostics, StructuralAnalysis, ParserDomain, CaseMetadata, CaseType } from '../types';

const IGTX_VERSION = "2.0.0-dual";

const COMMON_TRANSLATION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'he', 'she', 'it', 'they',
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'pero', 
  'le', 'la', 'les', 'et', 'ou', 'est', 'sont'
]);

// --- Linguistic Regex ---
const COMPLEX_ORTHO_REGEX = /[ąęįǫųłŁʼ’́ƛλχʕʔʷəščx̌q̓]/g;
const HYPHEN_REGEX = /-/g;
const APOSTROPHE_REGEX = /['ʼ]/g;
const STRONG_NATIVE_CHAR_REGEX = /[\u00C0-\u024F\u1E00-\u1EFF\u0250-\u02AF\uA720-\uA7FF\u02C0-\u02FF\u207F!|‖ǂʔʕ’ʻ\u0300-\u036F]/;
const MORPH_DENSE_MARKER_REGEX = /[’łŁįąęǫųńáéíóúʕʾʿ\u0323]/;
const GLOSS_CHARS_REGEX = /[-=:\d\[\]<>]/g;
const GLOSS_SEPARATOR_REGEX = /[=:]/;

// --- Legal Regex ---
const LEGAL_CAPTION_REGEX = /(SUPREME|COUNTY|FAMILY|CIVIL|DISTRICT|CIRCUIT)\s+COURT/i;
const LEGAL_VS_REGEX = /\s+(v\.|vs\.|against)\s+/i;
const LEGAL_INDEX_REGEX = /(Index|Docket|Case)\s+(No\.|Number|#|ID)\s*:?\s*([A-Z0-9\/-]+)/i;
const LEGAL_PARTIES_REGEX = /(Plaintiff|Defendant|Petitioner|Respondent)/i;
const LEGAL_KEYWORDS_REGEX = /(WHEREFORE|PLEASE TAKE NOTICE|AFFIDAVIT|SWORN TO|ORDERED|ADJUDGED|DECREED)/;

const DIGIT_REGEX = /\d/;
const SPLIT_REGEX = /[\s\-,.=]+/;
const CLEAN_LINE_REGEX = /^(\(?\d+[a-z]?\.?\)?)\s*/;
const QUOTE_WRAP_REGEX = /^["'“‘].*["'”’]$/;
const STANDARD_SENTENCE_REGEX = /^[A-Z].*[.?!]$/;
const ASCII_REGEX = /^[\x20-\x7E]*$/;
const CLAUSE_BOUNDARY_REGEX = /[,;،؛:—|]/g;

// --- Language Profile Mapping (ISO-639-3 -> Profile) ---
const LANG_PROFILE_MAP: Record<string, LanguageProfile> = {
    'zho': 'analytic', 'yue': 'analytic', 'vie': 'analytic', 
    'ara': 'morphological_dense', 'heb': 'morphological_dense', 
    'kal': 'polysynthetic', 'iku': 'polysynthetic'
};

function cyrb53(str: string, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function generateHash(str: string): string {
    return cyrb53(str).toString(16).padStart(14, '0');
}

/**
 * Analyzes the structural complexity of a line to determine clause types.
 * refined to detect multiclausal structures via punctuation, conjunctions, and verb patterns.
 */
function analyzeStructure(text: string, domain: ParserDomain = 'linguistic'): StructuralAnalysis {
    const cleanText = text.trim();
    const tokens = cleanText.split(/\s+/);
    const tokenCount = tokens.length;
    const charCount = cleanText.length;
    const avgTokenLength = tokenCount > 0 ? charCount / tokenCount : 0;

    // --- Heuristic Detection Config ---
    
    // Punctuation that strongly suggests clause boundaries
    const strongSeparators = /[:;—|]|\s-\s/g;
    const strongSepCount = (cleanText.match(strongSeparators) || []).length;
    
    // Explicit embedding markers (Parentheses, Brackets)
    const embeddingMarkers = (cleanText.match(/[\(\[\{]/g) || []).length;
    
    // Conjunctions & Relative Pronouns (English/Generic bias for "Language Agnostic" default)
    // Ideally these would be loaded from a language profile, but these cover high-frequency patterns.
    const coordConjRegex = /\b(and|but|or|nor|for|yet|so)\b/i;
    const subordConjRegex = /\b(because|although|if|when|while|unless|since|after|before|until)\b/i;
    const relativePronounRegex = /\b(that|which|who|whom|whose|where)\b/i;
    const conditionalRegex = /^(if|provided that|unless|subject to|notwithstanding)/i;
    
    // Verb auxiliary hints (rough generic heuristic)
    const auxVerbRegex = /\b(is|are|was|were|have|has|had|do|does|did|will|would|shall|should|can|could|may|might|must)\b/i;

    let clauseType: StructuralAnalysis['clauseType'] = 'simple';
    let complexity = 0.1;

    // --- Classification Logic ---

    // 1. Fragment Detection
    // Very short, no terminal punctuation, no verb-like structure
    if (tokenCount < 4 && !/[.?!]$/.test(cleanText) && !auxVerbRegex.test(cleanText)) {
        clauseType = 'fragment';
        complexity = 0.1;
    }
    
    // 2. Complex/Embedded (High Priority)
    // Parentheses are the strongest signal of embedding in IGT/Academic text
    else if (embeddingMarkers > 0) {
        clauseType = 'complex_embedded';
        complexity = 0.8 + (embeddingMarkers * 0.05);
    }
    
    // 3. Chain Clause (Strong Punctuation)
    else if (strongSepCount > 0) {
        if (strongSepCount > 1) {
            clauseType = 'chain_clause';
            complexity = 0.7 + (strongSepCount * 0.1);
        } else {
            // Check if the separator balances two substantial chunks
            clauseType = 'compound'; // e.g. "He arrived; then he left."
            complexity = 0.6;
        }
    }
    
    // 4. Compound vs Complex (Comma + Conjunction Analysis)
    else {
        const hasCoord = coordConjRegex.test(cleanText);
        const hasSubord = subordConjRegex.test(cleanText);
        const hasRelative = relativePronounRegex.test(cleanText);
        const hasConditional = conditionalRegex.test(cleanText);
        const commaCount = (cleanText.match(/,/g) || []).length;

        if (hasSubord || hasConditional) {
            clauseType = 'complex_embedded';
            complexity = 0.85; // Boost for conditionals/subordination
        } else if (hasRelative && commaCount > 0) {
            // "The man, who was tall, left." -> Embedded
            clauseType = 'complex_embedded';
            complexity = 0.7;
        } else if (hasCoord && commaCount > 0) {
            // "I went to the store, and I bought milk." -> Compound
            // Heuristic: Comma followed somewhat closely by coordinating conjunction
            if (/,\s+(\w+\s+){0,3}(and|but|or|nor|for|yet|so)\b/i.test(cleanText)) {
                clauseType = 'compound';
                complexity = 0.6;
            } else {
                // Comma list (Simple structure with enumeration)
                clauseType = 'simple';
                complexity = 0.4;
            }
        } else if (commaCount > 2) {
            // Heavy listing
            clauseType = 'chain_clause'; // Treat lists as chains for processing purposes
            complexity = 0.5;
        } else {
            // Default Simple
            clauseType = 'simple';
            // Scale complexity by length (longer sentences are inherently more complex)
            complexity = 0.2 + Math.min(0.3, tokenCount * 0.015);
        }
    }

    // --- Domain Specific Overrides ---
    if (domain === 'legal') {
        // Legal Pleading Structure Detection
        
        // "Wherefore" clauses are typically chains of requests
        if (/^WHEREFORE/i.test(cleanText)) {
            clauseType = 'chain_clause';
            complexity = 0.9;
        }
        
        // Recitals (Whereas...)
        if (/^WHEREAS/i.test(cleanText)) {
            clauseType = 'complex_embedded';
            complexity = 0.85;
        }

        // Citations usually shouldn't be treated as complex sentences even if they have punctuation
        if (/\d+\s+U\.?S\.?\s+\d+/.test(cleanText) || /v\./.test(cleanText)) {
            // Adjust complexity down if it's primarily a citation
            complexity = Math.max(0.3, complexity - 0.2);
        }

        // Detect "If/Then" logic implicitly often found in contracts
        if (conditionalRegex.test(cleanText)) {
             // Force complex detection for legal logic
             clauseType = 'complex_embedded';
             complexity = Math.max(complexity, 0.8);
        }
    }

    return {
        complexityScore: Math.min(0.99, parseFloat(complexity.toFixed(2))),
        clauseType,
        tokenCount,
        avgTokenLength: parseFloat(avgTokenLength.toFixed(2))
    };
}

/**
 * Heuristic extractor to auto-fill case metadata from a commencing document.
 */
export function extractCaseInitialMetadata(text: string): CaseMetadata {
    const meta: CaseMetadata = {
        type: 'Civil',
        jurisdiction: '',
        plaintiffs: [],
        defendants: [],
        indexNumber: ''
    };

    const headerText = text.slice(0, 3000); // Check first 3k chars for caption

    // 1. Jurisdiction / Court
    const courtMatch = headerText.match(LEGAL_CAPTION_REGEX);
    if (courtMatch) {
        // Find full line
        const lines = headerText.split('\n');
        const courtLine = lines.find(l => l.includes(courtMatch[0])) || courtMatch[0];
        meta.jurisdiction = courtLine.trim();
        
        // Infer Type
        if (meta.jurisdiction.includes('HOUSING') || meta.jurisdiction.includes('LANDLORD')) meta.type = 'LT';
        else if (meta.jurisdiction.includes('SMALL')) meta.type = 'Small Claims';
        else if (meta.jurisdiction.includes('DISTRICT')) meta.type = 'Federal';
    }

    // 2. Index Number
    const indexMatch = headerText.match(LEGAL_INDEX_REGEX);
    if (indexMatch && indexMatch[3]) {
        meta.indexNumber = indexMatch[3].trim();
    }

    // 3. Parties (Basic Heuristic based on vs/against block)
    const vsMatch = headerText.match(LEGAL_VS_REGEX);
    if (vsMatch) {
        const parts = headerText.split(vsMatch[0]);
        if (parts.length >= 2) {
            // Plaintiff is usually before VS, Defendant after
            // Look backwards from VS for names
            const beforeVs = parts[0].split('\n').slice(-5).join(' '); // Last 5 lines before VS
            const afterVs = parts[1].split('\n').slice(0, 5).join(' '); // First 5 lines after VS
            
            // Cleanup common noise
            const cleanName = (s: string) => s.replace(/Plaintiff|Defendant|Petitioner|Respondent/gi, '').replace(/[-\(\)]/g, '').trim();

            meta.plaintiffs = [cleanName(beforeVs.split(',')[0])]; // Take first likely name
            meta.defendants = [cleanName(afterVs.split(',')[0])];
        }
    }

    return meta;
}

/**
 * Determine if Tier 4 processing is needed. 
 * Supports both Linguistic density checks and Legal Pleading structure checks.
 */
function tier4Check(text: string, domain: ParserDomain, languageHint?: string, diagnostics?: PdfTextDiagnostics): Tier4Assessment {
  let totalScore = 0;
  const signals: Tier4Signal[] = [];

  if (diagnostics) {
      if (diagnostics.fragmentedLineRatio > 0.3) {
          totalScore += 0.20;
          signals.push({ feature: 'layout_structure', weight: 0.20, description: 'High line fragmentation' });
      }
  }

  if (domain === 'legal') {
     // LEGAL TIER 4 CHECKS
     const indexMatch = text.match(LEGAL_INDEX_REGEX);
     if (indexMatch) {
         totalScore += 0.40;
         signals.push({ feature: 'legal_header', weight: 0.40, description: `Found Index/Docket pattern` });
     }

     const vsMatch = text.match(LEGAL_VS_REGEX);
     if (vsMatch) {
         totalScore += 0.30;
         signals.push({ feature: 'legal_header', weight: 0.30, description: 'Found adversarial "vs" pattern' });
     }

     const courtMatch = text.match(LEGAL_CAPTION_REGEX);
     if (courtMatch) {
         totalScore += 0.30;
         signals.push({ feature: 'legal_header', weight: 0.30, description: `Found Court jurisdiction: ${courtMatch[0]}` });
     }
  } else {
      // LINGUISTIC TIER 4 CHECKS
      const orthoMatches = (text.match(COMPLEX_ORTHO_REGEX) || []).length;
      if (orthoMatches > 5) {
          totalScore += 0.40;
          signals.push({ feature: 'orthographic_complexity', weight: 0.40, description: `High density of complex graphemes (n=${orthoMatches})` });
      }

      const words = text.split(/\s+/).slice(0, 100);
      if (words.length > 0) {
          const longWordCount = words.filter(w => w.length > 18).length;
          if (longWordCount / words.length > 0.05) {
              totalScore += 0.30;
              signals.push({ feature: 'morpheme_density', weight: 0.30, description: 'Significant long word forms (>18 chars)' });
          }
      }
  }

  const finalConfidence = Math.min(0.99, parseFloat(totalScore.toFixed(2)));
  return {
    requiresTier4: finalConfidence >= 0.40,
    confidence: finalConfidence,
    signals,
    recommendedAction: domain === 'legal' ? "Activate Legal Pleading Parser" : "Switch profile to 'Polysynthetic'"
  };
}

function calculateConfidence(line: string, profile: LanguageProfile, domain: ParserDomain): { score: number; warnings: string[] } {
  let score = 0.5;
  const warnings: string[] = [];
  const clean = line.replace(CLEAN_LINE_REGEX, '').trim();
  
  if (!clean) return { score: 0, warnings: ['Empty'] };

  // --- LEGAL HEURISTICS ---
  if (domain === 'legal') {
     if (LEGAL_KEYWORDS_REGEX.test(clean.toUpperCase())) {
         score += 0.4;
     }
     if (LEGAL_INDEX_REGEX.test(clean) || LEGAL_CAPTION_REGEX.test(clean)) {
         score += 0.45;
     }
     if (LEGAL_VS_REGEX.test(clean)) {
         score += 0.35;
     }
     // Penalize standalone numbers or very short lines in legal (usually page numbers/line numbers)
     if (clean.length < 4 && DIGIT_REGEX.test(clean)) {
         score -= 0.4;
         warnings.push("Likely page number");
     }
     // Boost longer paragraphs
     if (clean.length > 50) score += 0.1;
     
     return { score: Math.min(0.99, score), warnings };
  }

  // --- LINGUISTIC HEURISTICS (Existing Logic) ---
  if (STRONG_NATIVE_CHAR_REGEX.test(clean)) score += 0.35;
  if (profile === 'morphological_dense' && MORPH_DENSE_MARKER_REGEX.test(clean)) score += 0.15; 

  const glossChars = (clean.match(GLOSS_CHARS_REGEX) || []).length;
  const glossDensity = glossChars / clean.length;
  
  if (glossDensity > 0.15) {
     if (profile !== 'polysynthetic') {
        score -= 0.35;
        warnings.push('High density of gloss markers');
     }
  }
  
  if (clean.split(/\s+/).length > 2 && COMMON_TRANSLATION_WORDS.has(clean.split(/\s+/)[0].toLowerCase())) {
     score -= 0.3;
     warnings.push('Starts with common translation word');
  }

  return { score: Math.max(0, Math.min(1, score)), warnings };
}

export function parseIGT(
    rawText: string, 
    profile: LanguageProfile = 'generic',
    domain: ParserDomain = 'linguistic',
    sourceMetadata: Partial<IGTXSource> = {},
    filename?: string,
    pdfDiagnostics?: PdfTextDiagnostics
): ParseReport {
  const normalizedText = rawText.normalize('NFC');
  
  let detectedLang = sourceMetadata.language || 'und';
  const tier4Assessment = tier4Check(normalizedText, domain, detectedLang, pdfDiagnostics);
  const rawLines = normalizedText.split(/\r?\n/);
  
  const blocks: ExtractedBlock[] = [];
  let extractedCount = 0;
  let totalConfidence = 0;

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const { score, warnings } = calculateConfidence(trimmed, profile, domain);
    
    // Threshold filtering
    const THRESHOLD = domain === 'legal' ? 0.35 : 0.45;

    if (score >= THRESHOLD) {
      const cleanLine = trimmed.replace(CLEAN_LINE_REGEX, '');
      const blockHash = generateHash(trimmed + index); 
      
      const structural = analyzeStructure(cleanLine, domain);

      blocks.push({
        id: `blk-${blockHash}`, 
        rawSource: line,
        extractedLanguageLine: cleanLine,
        confidence: score,
        warnings,
        lineNumber: index + 1,
        structural
      });
      
      extractedCount++;
      totalConfidence += score;
    }
  });

  // Construct IGTX
  const igtxBlocks: IGTXBlock[] = blocks.map(b => ({
      block_id: b.id.replace('blk-', ''),
      position: b.lineNumber,
      raw_text: b.rawSource,
      clean_text: b.extractedLanguageLine,
      segmentation: {
          type: domain === 'legal' ? 'legal_paragraph' : 'clause',
          confidence: b.confidence
      },
      igt: { surface: [b.extractedLanguageLine], morphology: [], gloss: [], translation: null },
      semantic_state: domain === 'linguistic' ? {
          provenance: undefined,
          predicate: null, arguments: [], features: { tense: null, aspect: null, modality: null, polarity: null }
      } : undefined,
      legal_state: domain === 'legal' ? {
          parties: [],
          case_meta: { index_number: null, court: null, doc_type: null },
          legal_points: [],
          foundational_docs: []
      } : undefined,
      vector_state: { embedding: null, model: null, dimensionality: null },
      integrity: { hash: b.id, warnings: b.warnings }
  }));

  const igtxDocument: IGTXDocument = {
      document_id: generateHash(igtxBlocks.map(b => b.block_id).join('')),
      source: {
          title: sourceMetadata.title || "Untitled",
          author: sourceMetadata.author || "Unknown",
          year: sourceMetadata.year || null,
          language: detectedLang,
          orthography: "standard",
          source_type: sourceMetadata.source_type || "legacy_text",
          source_url: sourceMetadata.source_url
      },
      processing: {
          tool: "Dziłtǫ́ǫ́ Dual-Parser",
          version: IGTX_VERSION,
          deterministic: true,
          timestamp: new Date().toISOString(),
          profile_used: profile,
          domain: domain,
          unicode_normalization: 'NFC',
          tier4_assessment: {
            requires_tier4: tier4Assessment.requiresTier4,
            confidence: tier4Assessment.confidence,
            signals: tier4Assessment.signals
          }
      },
      blocks: igtxBlocks
  };

  return {
    blocks,
    fullExtractedText: blocks.map(b => b.extractedLanguageLine).join('\n'),
    metadata: {
        sourceType: domain,
        igtxVersion: IGTX_VERSION,
        timestamp: new Date().toISOString(),
        fileSource: filename || "raw_input",
        tier4Assessment,
        profileUsed: profile,
        domain: domain,
        provenanceHash: igtxDocument.document_id,
        blockDefinition: domain === 'legal' ? "Paragraph" : "Line",
        pdfDiagnostics
    },
    stats: {
      totalLines: rawLines.length,
      extractedLines: extractedCount,
      averageConfidence: extractedCount > 0 ? (totalConfidence / extractedCount) : 0
    },
    igtxDocument
  };
}

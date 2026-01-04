
import { ExtractedBlock, ParseReport, ParserMetadata, Tier4Assessment, Tier4Signal, LanguageProfile, IGTXDocument, IGTXBlock, IGTXSource, PdfTextDiagnostics, StructuralAnalysis } from '../types';
import { franc } from 'franc';

const IGTX_VERSION = "1.9.1";

const COMMON_TRANSLATION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'he', 'she', 'it', 'they',
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'pero', // Spanish common
  'le', 'la', 'les', 'et', 'ou', 'est', 'sont' // French common
]);

// --- Optimization: Hoisted Constants & Regex ---
const COMPLEX_ORTHO_REGEX = /[ąęįǫųłŁʼ’́ƛλχʕʔʷəščx̌q̓]/g;
const HYPHEN_REGEX = /-/g;
const APOSTROPHE_REGEX = /['ʼ]/g;

const STRONG_NATIVE_CHAR_REGEX = /[\u00C0-\u024F\u1E00-\u1EFF\u0250-\u02AF\uA720-\uA7FF\u02C0-\u02FF\u207F!|‖ǂʔʕ’ʻ\u0300-\u036F]/;
const MORPH_DENSE_MARKER_REGEX = /[’łŁįąęǫųńáéíóúʕʾʿ\u0323]/;

const GLOSS_CHARS_REGEX = /[-=:\d\[\]<>]/g;
const GLOSS_SEPARATOR_REGEX = /[=:]/;
const DIGIT_REGEX = /\d/;

const SPLIT_REGEX = /[\s\-,.=]+/;
const CLEAN_LINE_REGEX = /^(\(?\d+[a-z]?\.?\)?)\s*/;
const SPECIAL_CHAR_REGEX = /[^\x20-\x7E]/g;
const QUOTE_WRAP_REGEX = /^["'“‘].*["'”’]$/;
const STANDARD_SENTENCE_REGEX = /^[A-Z].*[.?!]$/;
const ASCII_REGEX = /^[\x20-\x7E]*$/;

// Enhanced boundary regex for clause segmentation
// Includes standard western punctuation, Arabic commas, em-dashes, and pipes (often used in IGT)
const CLAUSE_BOUNDARY_REGEX = /[,;،؛:—|]/g;

const COMMON_POS_TAGS = new Set([
  'NOM', 'ACC', 'DAT', 'GEN', 'ABL', 'LOC', 'ERG', 'ABS', 
  'PST', 'FUT', 'PRS', 'PFV', 'IPFV', 'NEG', 'Q', 'TOP',
  'DET', 'DEM', 'PRON', 'CLF', 'REL', 'CONJ', 'ADV', 'ADJ',
  'AUX', 'PRT', 'PL', 'SG', '1SG', '2SG', '3SG', 'SUBJ', 'OBJ',
  'TR', 'INTR', 'M', 'F', 'N'
]);

// --- Language Profile Mapping (ISO-639-3 -> Profile) ---
const LANG_PROFILE_MAP: Record<string, LanguageProfile> = {
    // Analytic / Isolating
    'zho': 'analytic', 'yue': 'analytic', 'vie': 'analytic', 
    'tha': 'analytic', 'mya': 'analytic', 'khm': 'analytic', 
    'lao': 'analytic',
    
    // Morphologically Dense (Semitic, Hamitic, etc)
    'ara': 'morphological_dense', 'heb': 'morphological_dense', 
    'amh': 'morphological_dense', 'bod': 'morphological_dense',
    'som': 'morphological_dense',

    // Polysynthetic / Agglutinative (Americas, Arctic)
    'kal': 'polysynthetic', 'iku': 'polysynthetic', 
    'que': 'polysynthetic', 'aym': 'polysynthetic', 
    'nav': 'polysynthetic', 'ciw': 'polysynthetic' // Ojibwa
};

/**
 * Simple non-cryptographic hash for provenance tracking (integrity check).
 */
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
 * Analyze structural complexity to detect Multiclausal/Chain structures.
 * This differentiates the tool from standard LLMs by mathematically flagging complexity
 * rather than smoothing it over.
 */
function analyzeStructure(text: string, profile: LanguageProfile): StructuralAnalysis {
    const tokens = text.split(/\s+/).filter(t => t.length > 0);
    const tokenCount = tokens.length;
    
    if (tokenCount === 0) {
        return { complexityScore: 0, clauseType: 'fragment', tokenCount: 0, avgTokenLength: 0 };
    }

    const totalChars = tokens.reduce((sum, t) => sum + t.length, 0);
    const avgTokenLength = totalChars / tokenCount;
    
    const punctuationMatches = text.match(CLAUSE_BOUNDARY_REGEX) || [];
    const punctuationCount = punctuationMatches.length;
    
    let complexityScore = 0;
    let clauseType: StructuralAnalysis['clauseType'] = 'simple';

    // --- Metric 1: Segmentation Analysis ---
    // Split text by boundaries to find "macro-segments"
    // Filter segments that are too short (e.g., interjections "Oh,") to be full clauses
    const segments = text.split(CLAUSE_BOUNDARY_REGEX)
                         .map(s => s.trim())
                         .filter(s => s.split(/\s+/).length >= 2); 
    
    const segmentCount = segments.length;

    // Base complexity from token volume (approx. log scale)
    if (tokenCount > 7) complexityScore += 0.1;
    if (tokenCount > 15) complexityScore += 0.1;
    if (tokenCount > 25) complexityScore += 0.15;

    // --- Metric 2: Profile-Specific Heuristics ---

    if (profile === 'polysynthetic' || profile === 'morphological_dense') {
        const longWords = tokens.filter(t => t.length > 12);
        
        // Morphological density signals
        if (avgTokenLength > 8) complexityScore += 0.15;
        if (longWords.length > 0) complexityScore += (0.1 * longWords.length);
        
        // Chain Clause Detection:
        // 1. Multiple very long words (often holophrastic clauses strung together)
        // 2. Mix of long words and explicit segmentation
        if (longWords.length >= 2 || (longWords.length >= 1 && segmentCount >= 2)) {
             clauseType = 'chain_clause';
             complexityScore += 0.3;
        } 
        // Single Holophrase (structurally simple but computationally dense)
        else if (tokenCount < 5 && avgTokenLength > 10) {
            complexityScore += 0.15; 
        }
    }
    
    if (profile === 'analytic' || profile === 'generic') {
        // Serial Verb / Compound detection
        // 1. Explicit coordination via punctuation
        if (segmentCount >= 2) {
            complexityScore += (0.15 * segmentCount);
            clauseType = 'compound';
        }
        
        // 2. Serial Verb Construction (SVC) heuristic:
        // Long sequence of relatively short words without punctuation breaks.
        // (Typical of Sino-Tibetan, Kwa, etc. glosses)
        if (tokenCount > 12 && punctuationCount === 0 && avgTokenLength < 6) {
            complexityScore += 0.25;
            // Differentiate simple long sentence vs multiclausal heuristic
            if (tokenCount > 18) {
                clauseType = 'compound'; 
            }
        }
    }

    // --- Metric 3: Recursive/Embedded Structures ---

    // Parenthetical Embedding (excluding citations like "(12a)")
    if (text.includes('(') && text.includes(')')) {
        const contentInParens = text.match(/\(([^)]+)\)/)?.[1] || "";
        const isCitation = /^\d+[a-z]?$/.test(contentInParens.trim());
        
        if (!isCitation && contentInParens.split(/\s+/).length > 1) {
            complexityScore += 0.25;
            clauseType = 'complex_embedded';
        }
    }

    // Quotative Constructions (e.g., 'He said, "Go away"')
    const quoteMatches = text.match(/["'“‘](.*?)["'”’]/);
    if (quoteMatches) {
        const outsideContent = text.replace(quoteMatches[0], '').trim();
        // If there is substantial predication outside the quote
        if (outsideContent.split(/\s+/).length >= 2) {
             complexityScore += 0.3;
             clauseType = 'complex_embedded';
        }
    }

    // --- Final Classification & Normalization ---
    
    // Cap score
    complexityScore = Math.min(1.0, parseFloat(complexityScore.toFixed(2)));

    // Promote 'simple' to 'compound' if score is very high (latent complexity)
    if (complexityScore > 0.75 && clauseType === 'simple') {
        clauseType = 'compound';
    }

    return {
        complexityScore,
        clauseType,
        tokenCount,
        avgTokenLength: parseFloat(avgTokenLength.toFixed(1))
    };
}

/**
 * Stage-1 Gating Check (Tier 4 Assessment)
 */
function tier4Check(text: string, languageHint?: string, diagnostics?: PdfTextDiagnostics): Tier4Assessment {
  let totalScore = 0;
  const signals: Tier4Signal[] = [];

  if (diagnostics) {
      if (diagnostics.fragmentedLineRatio > 0.3) {
          const weight = 0.20;
          totalScore += weight;
          signals.push({ feature: 'layout_structure', weight, description: 'High line fragmentation' });
      }
      if (diagnostics.totalLines > 0 && (diagnostics.hyphenBreakCount / diagnostics.totalLines) > 0.05) {
          const weight = 0.15;
          totalScore += weight;
          signals.push({ feature: 'layout_structure', weight, description: 'Frequent hyphenated breaks' });
      }
  }

  const orthoMatches = (text.match(COMPLEX_ORTHO_REGEX) || []).length;
  if (orthoMatches > 5) {
      const weight = 0.40;
      totalScore += weight;
      signals.push({ feature: 'orthographic_complexity', weight, description: `High density of complex graphemes (n=${orthoMatches})` });
  }

  const words = text.split(/\s+/).slice(0, 100);
  if (words.length > 0) {
      const longWordCount = words.filter(w => w.length > 18).length;
      const hyphenatedCount = words.filter(w => (w.match(HYPHEN_REGEX) || []).length >= 3).length;
      const apostropheCount = words.filter(w => (w.match(APOSTROPHE_REGEX) || []).length >= 2).length;

      if (longWordCount / words.length > 0.05) {
          const weight = 0.30;
          totalScore += weight;
          signals.push({ feature: 'morpheme_density', weight, description: 'Significant long word forms (>18 chars)' });
      }
      if (hyphenatedCount / words.length > 0.05) {
          const weight = 0.35;
          totalScore += weight;
          signals.push({ feature: 'morpheme_density', weight, description: 'Explicit high-frequency segmentation markers' });
      }
      if (apostropheCount / words.length > 0.08) {
          const weight = 0.20;
          totalScore += weight;
          signals.push({ feature: 'orthographic_complexity', weight, description: 'High intra-word glottal frequency' });
      }
  }

  const knownHighMorphologyKeys = ['polysynthetic', 'agglutinative', 'athabaskan', 'salishan', 'mayan', 'inuit', 'yupik', 'iroquoian', 'algonquian', 'wakashan'];
  const isContextMatch = languageHint && knownHighMorphologyKeys.some(key => languageHint.toLowerCase().includes(key));
  
  if (isContextMatch) {
      const weight = 0.15; 
      totalScore += weight;
      signals.push({ feature: 'metadata_context', weight, description: 'Source metadata aligns with high-morphology profile' });
  }

  const finalConfidence = Math.min(0.99, parseFloat(totalScore.toFixed(2)));
  const requiresTier4 = finalConfidence >= 0.45; 

  return {
    requiresTier4,
    confidence: finalConfidence,
    signals,
    recommendedAction: requiresTier4 ? "Switch profile to 'Polysynthetic'" : "Proceed with 'Generic'"
  };
}

function getMode(numbers: number[]): number {
    if (numbers.length === 0) return 1;
    const modeMap: Record<number, number> = {};
    let maxEl = numbers[0], maxCount = 1;
    for (let i = 0; i < numbers.length; i++) {
        let el = numbers[i];
        if(modeMap[el] == null) modeMap[el] = 1;
        else modeMap[el]++;  
        if(modeMap[el] > maxCount) {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    return maxEl;
}

function applyContextualTier4(blocks: ExtractedBlock[]): ExtractedBlock[] {
    if (blocks.length < 3) return blocks;
    const gaps: number[] = [];
    for (let i = 1; i < blocks.length; i++) { gaps.push(blocks[i].lineNumber - blocks[i-1].lineNumber); }
    const modeGap = getMode(gaps);

    return blocks.map((block, index) => {
        let rawContextualBoost = 0;
        const contextualWarnings: string[] = [];

        if (index > 0) {
            const gap = block.lineNumber - blocks[index - 1].lineNumber;
            if (gap === modeGap) rawContextualBoost += 0.07;
            else if (modeGap > 1 && gap !== modeGap) contextualWarnings.push("tier4:igt_alternation_break");
            if (modeGap === 1 && gap === 1) rawContextualBoost += 0.03; 
        }

        if (index > 0 && index < blocks.length - 1) {
            const prev = blocks[index - 1];
            const next = blocks[index + 1];
            const getSpecialCharDensity = (str: string) => (str.match(SPECIAL_CHAR_REGEX) || []).length / str.length;
            
            const myDensity = getSpecialCharDensity(block.extractedLanguageLine);
            const neighborAvg = (getSpecialCharDensity(prev.extractedLanguageLine) + getSpecialCharDensity(next.extractedLanguageLine)) / 2;

            if (myDensity === 0 && neighborAvg > 0.10) contextualWarnings.push("tier4:register_shift_detected");
        }

        const tier4Boost = Math.min(rawContextualBoost, 0.10);
        const newConfidence = Math.min(0.99, block.confidence + tier4Boost);
        const uniqueWarnings = [...new Set([...block.warnings, ...contextualWarnings])];

        return {
            ...block,
            confidence: newConfidence,
            warnings: uniqueWarnings,
            tier4: { contextual_boost: parseFloat(tier4Boost.toFixed(3)), warnings: contextualWarnings }
        };
    });
}

function calculateLineConfidence(originalLine: string, profile: LanguageProfile): { score: number; warnings: string[] } {
  let score = 0.5; 
  const warnings: string[] = [];
  const analyzedLine = originalLine.replace(CLEAN_LINE_REGEX, '').trim();

  if (!analyzedLine) return { score: 0, warnings: ['Empty content'] };

  if (STRONG_NATIVE_CHAR_REGEX.test(analyzedLine)) score += 0.35;
  if (profile === 'morphological_dense' && MORPH_DENSE_MARKER_REGEX.test(analyzedLine)) score += 0.15; 

  const glossChars = (analyzedLine.match(GLOSS_CHARS_REGEX) || []).length;
  const glossDensity = glossChars / analyzedLine.length;
  
  if (glossDensity > 0.15) {
    if (profile === 'analytic' && DIGIT_REGEX.test(analyzedLine) && !GLOSS_SEPARATOR_REGEX.test(analyzedLine)) {
        score -= 0.05; 
    } else if (profile === 'polysynthetic' && !GLOSS_SEPARATOR_REGEX.test(analyzedLine)) {
        score -= 0.1; 
    } else {
        score -= 0.35;
        warnings.push('High density of gloss markers');
    }
  } else if (GLOSS_SEPARATOR_REGEX.test(analyzedLine)) {
    score -= 0.15;
    warnings.push('Contains explicit gloss separators (=, :)');
  }

  const words = analyzedLine.split(SPLIT_REGEX);
  let posCount = 0, allCapsCount = 0, wordCount = 0, translationWordCount = 0, maxWordLength = 0, totalLength = 0;

  for (const word of words) {
    if (!word) continue;
    wordCount++;
    totalLength += word.length;
    if (word.length > maxWordLength) maxWordLength = word.length;
    const upper = word.toUpperCase();
    if (word.length > 1 && (COMMON_POS_TAGS.has(upper) || COMMON_POS_TAGS.has(word))) posCount++;
    if (word.length > 1 && word === upper && !DIGIT_REGEX.test(word)) allCapsCount++;
    if (COMMON_TRANSLATION_WORDS.has(word.toLowerCase())) translationWordCount++;
  }

  const avgWordLength = wordCount > 0 ? totalLength / wordCount : 0;

  if (posCount >= 1 || (wordCount > 0 && (allCapsCount / wordCount) > 0.5)) {
    score -= 0.35;
    warnings.push('Contains POS tags or high uppercase ratio');
  }

  if (profile === 'polysynthetic' && maxWordLength > 15) score += 0.2;
  if (profile === 'analytic' && avgWordLength < 6 && avgWordLength > 1 && !translationWordCount) score += 0.15;

  const isQuoteWrapped = QUOTE_WRAP_REGEX.test(analyzedLine);
  if (isQuoteWrapped) {
    if (translationWordCount > 0) { score -= 0.4; warnings.push('Quoted translation'); }
    else { score -= 0.15; warnings.push('Wrapped in quotes'); }
  }

  if (wordCount > 2 && (translationWordCount / wordCount) > 0.25) {
    score -= 0.45;
    warnings.push('Contains common translation words');
  }

  const isStandardSentence = STANDARD_SENTENCE_REGEX.test(analyzedLine);
  const isMostlyAscii = ASCII_REGEX.test(analyzedLine);
  
  if (isStandardSentence && !STRONG_NATIVE_CHAR_REGEX.test(analyzedLine)) {
      if (isMostlyAscii) { score -= 0.35; warnings.push('Standard sentence structure (likely translation)'); }
      else if (translationWordCount > 0) { score -= 0.25; warnings.push('Sentence structure with translation words'); }
  }
  
  if (analyzedLine.startsWith('(') && analyzedLine.endsWith(')')) { score -= 0.25; warnings.push('Wrapped in parentheses'); }

  return { score: Math.max(0, Math.min(1, score)), warnings };
}

export function parseIGT(
    rawText: string, 
    profile: LanguageProfile = 'generic',
    sourceMetadata: Partial<IGTXSource> = {},
    filename?: string,
    pdfDiagnostics?: PdfTextDiagnostics
): ParseReport {
  const normalizedText = rawText.normalize('NFC');
  
  // --- Auto-Detection & Profile Inference Logic ---
  let detectedLang = sourceMetadata.language;
  let isAutoDetected = false;

  if ((!detectedLang || detectedLang === 'und' || detectedLang === '') && rawText.length > 0) {
      // Franc works best with more text, but limiting the sample helps performance
      const sample = rawText.slice(0, 2000); 
      const bestGuess = franc(sample);
      
      // franc returns 'und' if it can't detect
      if (bestGuess !== 'und') {
          detectedLang = bestGuess;
          isAutoDetected = true;
      }
  }

  // Determine the effective profile.
  // We only switch automatically if the user has selected 'generic' (default)
  // AND we have a strong language mapping for the detected code.
  let effectiveProfile = profile;
  if (profile === 'generic' && detectedLang && LANG_PROFILE_MAP[detectedLang]) {
      effectiveProfile = LANG_PROFILE_MAP[detectedLang];
  }

  const tier4Assessment = tier4Check(normalizedText, detectedLang, pdfDiagnostics);
  const rawLines = normalizedText.split(/\r?\n/);
  let blocks: ExtractedBlock[] = [];
  const igtxBlocks: IGTXBlock[] = [];
  
  let fullExtractedText = "";
  let totalConfidence = 0;

  const fullSourceMetadata: IGTXSource = {
      title: sourceMetadata.title || "Untitled Document",
      author: sourceMetadata.author || "Unknown",
      year: sourceMetadata.year || null,
      language: detectedLang || "und", // Use detected language if available
      orthography: sourceMetadata.orthography || "standard",
      source_type: sourceMetadata.source_type || "legacy_text",
      source_url: sourceMetadata.source_url,
      retrieval_method: sourceMetadata.retrieval_method,
      model: sourceMetadata.model,
      retrieved_at: sourceMetadata.retrieved_at
  };

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Use the effective profile for scoring
    const { score, warnings } = calculateLineConfidence(trimmed, effectiveProfile);
    const THRESHOLD = 0.60; 

    if (score >= THRESHOLD) {
      const cleanLine = trimmed.replace(CLEAN_LINE_REGEX, '');
      const blockHash = generateHash(trimmed + index); 
      
      // NEW: Run structural analysis on the accepted line using effective profile
      const structural = analyzeStructure(cleanLine, effectiveProfile);

      blocks.push({
        id: `blk-${blockHash}`, 
        rawSource: line,
        extractedLanguageLine: cleanLine,
        confidence: score,
        warnings,
        lineNumber: index + 1,
        structural // Attach the analysis
      });
    }
  });

  blocks = applyContextualTier4(blocks);

  let extractedCount = 0;
  
  blocks.forEach(block => {
      fullExtractedText += block.extractedLanguageLine + "\n";
      totalConfidence += block.confidence;
      extractedCount++;

      igtxBlocks.push({
          block_id: block.id.replace('blk-', ''),
          position: block.lineNumber,
          raw_text: block.rawSource,
          clean_text: block.extractedLanguageLine,
          segmentation: {
              type: 'clause',
              confidence: block.confidence
          },
          igt: {
              surface: [block.extractedLanguageLine],
              morphology: [],
              gloss: [],
              translation: null 
          },
          semantic_state: {
              provenance: undefined,
              predicate: null,
              arguments: [],
              features: {
                  tense: null,
                  aspect: null,
                  modality: null,
                  polarity: null
              }
          },
          vector_state: {
              embedding: null,
              model: null,
              dimensionality: null
          },
          integrity: {
              hash: block.id.replace('blk-', ''),
              warnings: block.warnings
          },
          tier4: block.tier4 
      });
  });

  const allBlockHashes = igtxBlocks.map(b => b.block_id).join('');
  const docId = generateHash(allBlockHashes);

  const igtxDocument: IGTXDocument = {
      document_id: docId,
      source: fullSourceMetadata,
      processing: {
          tool: "Djihltoh IGTX",
          version: IGTX_VERSION,
          deterministic: true,
          timestamp: new Date().toISOString(),
          // Record the profile that was actually used (effective profile)
          profile_used: effectiveProfile,
          unicode_normalization: 'NFC',
          tier4_assessment: {
            requires_tier4: tier4Assessment.requiresTier4,
            confidence: tier4Assessment.confidence,
            signals: tier4Assessment.signals
          }
      },
      blocks: igtxBlocks
  };

  const metadata: ParserMetadata = {
    sourceType: "igt",
    igtxVersion: IGTX_VERSION,
    timestamp: new Date().toISOString(),
    fileSource: filename || "raw_input",
    tier4Assessment,
    profileUsed: effectiveProfile, // Return effective profile
    provenanceHash: docId,
    blockDefinition: "Line-based heuristic extraction unit",
    pdfDiagnostics
  };

  return {
    blocks,
    fullExtractedText: fullExtractedText.trim(),
    metadata,
    stats: {
      totalLines: rawLines.length,
      extractedLines: extractedCount,
      averageConfidence: extractedCount > 0 ? (totalConfidence / extractedCount) : 0
    },
    igtxDocument
  };
}

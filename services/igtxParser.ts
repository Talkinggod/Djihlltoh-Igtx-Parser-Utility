import { ExtractedBlock, ParseReport, ParserMetadata } from '../types';

const IGTX_VERSION = "1.0.3";

const COMMON_TRANSLATION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'he', 'she', 'it', 'they',
  'el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'pero', // Spanish common
  'le', 'la', 'les', 'et', 'ou', 'est', 'sont' // French common
]);

/**
 * Heuristics to determine if a line is likely the target language line.
 * Based on orthographic density, lack of gloss markers, and lack of POS tags.
 */
function calculateLineConfidence(originalLine: string): { score: number; warnings: string[] } {
  let score = 0.5; // Base probability
  const warnings: string[] = [];

  // Remove leading numbering/labels for analysis (e.g., "1.", "(12)", "12a")
  // We keep the original for output, but analyze the clean version to avoid 
  // numbering triggering 'digit' penalties.
  const analyzedLine = originalLine.replace(/^(\(?\d+[a-z]?\.?\)?)\s*/, '').trim();

  if (!analyzedLine) return { score: 0, warnings: ['Empty content'] };

  // 1. Native Script Features (Strong Positive)
  // Expanded Regex to include:
  // - Latin Extended-A/B/Additional (Vietnamese, African langs, Native American langs)
  // - IPA Extensions (common in phonetic transcriptions)
  // - Common punctuation used as letters (glottal stops, clicks: ʔ, ʕ, |, ‖, ǂ, !, ’)
  const strongNativeCharRegex = /[\u00C0-\u024F\u1E00-\u1EFF\u0250-\u02AF\uA720-\uA7FF\u02C0-\u02FF\u207F!|‖ǂʔʕ’ʻ]/;
  
  if (strongNativeCharRegex.test(analyzedLine)) {
    score += 0.35;
  }

  // 2. Gloss Density (Strong Negative)
  // Gloss lines are characterized by high frequency of separators: -, =, ., :, numbers
  const glossChars = (analyzedLine.match(/[-=.:\d\[\]<>]/g) || []).length;
  // If more than 15% of the characters are gloss markers, it's likely a gloss
  const glossDensity = glossChars / analyzedLine.length;
  
  if (glossDensity > 0.15) {
    score -= 0.35;
    warnings.push('High density of gloss markers');
  } else if (/[=:]/.test(analyzedLine)) {
    // Even if density is low, explicit use of '=' or ':' is very rare in natural text
    score -= 0.15;
    warnings.push('Contains explicit gloss separators (=, :)');
  }

  // 3. POS Tags (Negative Weight)
  const commonPosTags = new Set([
    'NOM', 'ACC', 'DAT', 'GEN', 'ABL', 'LOC', 'ERG', 'ABS', 
    'PST', 'FUT', 'PRS', 'PFV', 'IPFV', 'NEG', 'Q', 'TOP',
    'DET', 'DEM', 'PRON', 'CLF', 'REL', 'CONJ', 'ADV', 'ADJ',
    'AUX', 'PRT', 'PL', 'SG', '1SG', '2SG', '3SG', 'SUBJ', 'OBJ'
  ]);
  
  const words = analyzedLine.split(/[\s\-,.=]+/);
  let posCount = 0;
  let allCapsCount = 0;
  let wordCount = 0;

  for (const word of words) {
    if (!word) continue;
    wordCount++;
    
    const upper = word.toUpperCase();
    if (commonPosTags.has(upper)) {
      posCount++;
    }
    // Gloss lines often consist of uppercase abbreviations
    if (word.length > 1 && word === upper && !/\d/.test(word)) {
      allCapsCount++;
    }
  }

  if (posCount >= 1 || (wordCount > 0 && (allCapsCount / wordCount) > 0.5)) {
    score -= 0.3;
    warnings.push('Contains POS tags or high uppercase ratio');
  }

  // 4. Free Translation Heuristics (Negative Weight)
  
  // A) Wrapped in quotes
  if (/^["'“‘].*["'”’]$/.test(analyzedLine)) {
    score -= 0.5;
    warnings.push('Wrapped in quotes (translation)');
  }

  // B) Common Translation Stop Words
  // If the line contains common English/Spanish structure words, it's likely the translation
  let translationWordCount = 0;
  for (const word of words) {
    if (COMMON_TRANSLATION_WORDS.has(word.toLowerCase())) {
      translationWordCount++;
    }
  }
  
  // If meaningful ratio of words are stop words
  if (wordCount > 2 && (translationWordCount / wordCount) > 0.25) {
    score -= 0.4;
    warnings.push('Contains common translation words');
  }

  // C) Sentence Structure Check
  // Translation: Starts with Cap, ends with period, mostly standard ASCII
  const isStandardSentence = /^[A-Z].*[.?!]$/.test(analyzedLine);
  // Only penalize if we didn't find strong native chars
  if (isStandardSentence && !strongNativeCharRegex.test(analyzedLine)) {
    score -= 0.2;
    warnings.push('Standard sentence structure without native chars');
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    warnings
  };
}

/**
 * Main function to parse raw text into structured IGT data.
 */
export function parseIGT(rawText: string, filename?: string): ParseReport {
  const rawLines = rawText.split(/\r?\n/);
  const blocks: ExtractedBlock[] = [];
  
  let fullExtractedText = "";
  let totalConfidence = 0;
  let extractedCount = 0;

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const { score, warnings } = calculateLineConfidence(trimmed);

    // Threshold for extraction
    const THRESHOLD = 0.60; 

    if (score >= THRESHOLD) {
      // Clean up the output line: remove leading numbering for the final clean text
      // e.g. "10. ’Ashkii..." -> "’Ashkii..."
      const cleanLine = trimmed.replace(/^(\(?\d+[a-z]?\.?\)?)\s*/, '');

      blocks.push({
        id: `line-${index}`,
        rawSource: line,
        extractedLanguageLine: cleanLine,
        confidence: score,
        warnings,
        lineNumber: index + 1
      });
      fullExtractedText += cleanLine + "\n";
      totalConfidence += score;
      extractedCount++;
    }
  });

  const metadata: ParserMetadata = {
    sourceType: "igt",
    igtxVersion: IGTX_VERSION,
    timestamp: new Date().toISOString(),
    fileSource: filename || "raw_input"
  };

  return {
    blocks,
    fullExtractedText: fullExtractedText.trim(),
    metadata,
    stats: {
      totalLines: rawLines.length,
      extractedLines: extractedCount,
      averageConfidence: extractedCount > 0 ? (totalConfidence / extractedCount) : 0
    }
  };
}
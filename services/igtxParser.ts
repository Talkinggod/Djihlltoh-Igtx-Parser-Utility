
import { 
    ExtractedBlock, 
    ParseReport, 
    LanguageProfile, 
    ParserDomain, 
    MeasurementLayer, 
    CaseMetadata,
    VsscSkepticSettings,
    StructuralAnalysis,
    Tier4Assessment
} from '../types';
import { analyzeLinguisticPhysics } from '../core/vssc_skeptic/linguistic_physics';

const IGTX_VERSION = "3.2.0-kernel-integrated";

function generateHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

function analyzeStructure(text: string): StructuralAnalysis {
    const tokens = text.trim().split(/\s+/).filter(t => t.length > 0);
    const tokenCount = tokens.length;
    
    // 1. Punctuation Analysis
    const commas = (text.match(/,/g) || []).length;
    const semicolons = (text.match(/;/g) || []).length;
    const colons = (text.match(/:/g) || []).length;
    const structuralPunctuation = commas + semicolons + colons;

    // 2. Connector Analysis (Heuristics based on common metalanguage markers)
    // Common coordinators
    const coordinators = ['and', 'but', 'or', 'nor', 'for', 'so', 'yet', '&'];
    // Common subordinators and relative pronouns
    const subordinators = ['because', 'although', 'if', 'when', 'while', 'since', 'after', 'before', 'unless', 'that', 'which', 'who', 'where', 'whereas'];
    
    let coordCount = 0;
    coordinators.forEach(c => { if (new RegExp(`\\b${c}\\b`, 'i').test(text)) coordCount++; });

    let subCount = 0;
    subordinators.forEach(s => { if (new RegExp(`\\b${s}\\b`, 'i').test(text)) subCount++; });

    // 3. Classification Logic
    let type: StructuralAnalysis['clauseType'] = 'simple';
    
    if (tokenCount < 3) {
        type = 'fragment';
    } else if (subCount > 0) {
        type = 'complex_embedded';
    } else if (coordCount > 0 && structuralPunctuation > 0) {
        type = 'compound';
    } else if (structuralPunctuation > 1 && coordCount === 0) {
        // Serial verb constructions or parataxis often appear as comma-separated lists without conjunctions
        type = 'chain_clause';
    } else if (tokenCount > 15 && structuralPunctuation > 0) {
        // Fallback for long sentences with breaks
        type = 'compound';
    }

    // 4. Complexity Score (0.0 - 1.0)
    // Base score from length
    let rawScore = tokenCount * 0.03;
    // Add weight for structural features
    rawScore += (structuralPunctuation * 0.15);
    rawScore += (subCount * 0.25);
    rawScore += (coordCount * 0.1);
    
    const complexityScore = Math.min(1.0, Math.max(0.1, parseFloat(rawScore.toFixed(2))));

    return {
        complexityScore,
        clauseType: type,
        tokenCount
    };
}

function tier4Check(text: string, profile: LanguageProfile): Tier4Assessment {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    // Heuristic: Check density of long words and morpheme boundaries
    let totalChars = 0;
    let totalWords = 0;
    let complexWords = 0; // > 10 chars
    let morphemeMarkers = 0; // - or = or : or .

    // Sample first 100 lines for efficiency
    lines.slice(0, 100).forEach(line => {
        const words = line.trim().split(/\s+/);
        words.forEach(w => {
            if (w.length > 0) {
                totalWords++;
                totalChars += w.length;
                if (w.length > 10) complexWords++;
                morphemeMarkers += (w.match(/[-=:\.]/g) || []).length;
            }
        });
    });

    const avgWordLength = totalWords > 0 ? totalChars / totalWords : 0;
    const morphemeDensity = totalWords > 0 ? morphemeMarkers / totalWords : 0;
    const complexityRatio = totalWords > 0 ? complexWords / totalWords : 0;

    const features: string[] = [];
    let score = 0;

    if (avgWordLength > 7) {
        score += 0.3;
        features.push("High Avg Word Length");
    }
    if (morphemeDensity > 0.5) {
        score += 0.4;
        features.push("Dense Morpheme Markers");
    }
    if (complexityRatio > 0.15) {
        score += 0.3;
        features.push("Frequent Complex Forms");
    }

    // Cap score
    score = Math.min(1.0, score);

    const isPolysynthetic = profile === 'polysynthetic' || profile === 'morphological_dense';
    const threshold = 0.4;
    
    let isConsistent = true;
    let notes = "Input structure aligns with profile expectations.";

    if (isPolysynthetic && score < threshold) {
        isConsistent = false;
        notes = "Warning: Input lacks structural complexity typical of polysynthetic languages. Check profile.";
    } else if (!isPolysynthetic && score > 0.7) {
        notes = "Notice: High structural complexity detected. Consider using 'Polysynthetic' profile.";
    }

    return {
        isConsistent,
        detectedFeatures: features,
        avgWordLength: parseFloat(avgWordLength.toFixed(2)),
        polysynthesisScore: parseFloat(score.toFixed(2)),
        notes
    };
}

export function extractCaseInitialMetadata(text: string): CaseMetadata {
    return {
        type: 'Civil',
        jurisdiction: 'Unknown',
        plaintiffs: ['In Pro Per'],
        defendants: ['Unknown'],
        indexNumber: ''
    };
}

export async function runIntegratedAnalysis(
    rawText: string,
    profile: LanguageProfile,
    domain: ParserDomain,
    lambdaControl: number,
    apiKey: string
): Promise<ParseReport> {
    const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const blocks: ExtractedBlock[] = lines.map((line, idx) => ({
        id: `blk-${generateHash(line + idx)}`,
        rawSource: line,
        extractedLanguageLine: line.trim(),
        confidence: 0.9,
        lineNumber: idx + 1,
        structural: analyzeStructure(line)
    }));

    // Tier 4 Validation (Polysynthesis Check)
    const tier4Assessment = tier4Check(rawText, profile);

    const settings: VsscSkepticSettings = {
        enabled: true,
        alpha: lambdaControl * 100,
        fidelity: 0.8,
        industry: 'legal',
        preserveCode: true,
        preserveLaTeX: true,
        preserveAcronyms: true,
        embeddingModel: 'Xenova/all-MiniLM-L6-v2',
        embeddingDimension: 384,
        targetModel: 'gemini-3-pro-preview',
        skepticProof: true,
        embeddingProvider: 'local-transformers',
        embeddingTimeoutMs: 30000,
        userFidelityThreshold: 0.8,
        hanziDensity: 0,
        regexProfile: 'baseline'
    };

    // Use relative path import for the physics kernel
    const physicsResult = await analyzeLinguisticPhysics(
        `run-${Date.now()}`,
        profile,
        blocks.map(b => ({ original: b.extractedLanguageLine })),
        settings
    );

    const isAdmissible = physicsResult.physics_status === "COMPUTED" && 
                        (physicsResult.decay_analysis?.fitQuality ?? 0) > 0.4;

    const physicsState: MeasurementLayer = {
        λ_measured: physicsResult.lambda_estimate,
        κ_physics: physicsResult.kappa_asymmetry,
        r_squared: physicsResult.decay_analysis?.fitQuality ?? 0,
        is_admissible: isAdmissible,
        refusal_reason: isAdmissible ? undefined : 
            (physicsResult.sampleCount < 5 
                ? "No physically plausible decay regime detected: insufficient segment count." 
                : "No physically plausible decay regime detected: poor fit quality.")
    };

    return {
        blocks,
        fullExtractedText: blocks.map(b => b.extractedLanguageLine).join('\n'),
        coherenceCurve: physicsResult.coherence_curves?.map(c => c.forward) || [],
        metadata: {
            sourceType: domain,
            igtxVersion: IGTX_VERSION,
            timestamp: new Date().toISOString(),
            profileUsed: profile,
            domain: domain,
            provenanceHash: generateHash(rawText),
            twoLayerState: {
                physics: physicsState,
                control: {
                    λ_control: lambdaControl,
                    κ_preserve: 0.98,
                    κ_ground: 0.99,
                    target_domain: profile
                }
            },
            tier4Assessment: tier4Assessment
        },
        igtxDocument: {
            source: {
                title: "Extracted Document",
                source_type: "text",
                model: "IGTX-Tier4"
            },
            tier4_validation: tier4Assessment,
            blocks: blocks
        },
        stats: {
            totalLines: lines.length,
            extractedLines: blocks.length,
            averageConfidence: 0.95
        }
    };
}

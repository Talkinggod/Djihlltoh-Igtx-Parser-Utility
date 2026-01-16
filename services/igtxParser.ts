
import { 
    ExtractedBlock, 
    ParseReport, 
    LanguageProfile, 
    ParserDomain, 
    MeasurementLayer, 
    ApplicationLayer, 
    CaseMetadata,
    VsscSkepticSettings
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

export function extractCaseInitialMetadata(text: string): CaseMetadata {
    return {
        type: 'Civil',
        jurisdiction: 'Unknown',
        plaintiffs: ['In Pro Per'],
        defendants: ['Unknown'],
        indexNumber: ''
    };
}

/**
 * High-Fidelity Analysis Wrapper
 * Bridges the UI Parser with the Measurement Layer Kernel
 */
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
        lineNumber: idx + 1
    }));

    const settings: VsscSkepticSettings = {
        enabled: true,
        alpha: lambdaControl * 100,
        fidelity: 0.8,
        industry: 'legal',
        preserveCode: true,
        preserveLaTeX: true,
        preserveAcronyms: true,
        embeddingModel: 'Xenova/all-MiniLM-L6-v2', // Browser-safe default
        embeddingDimension: 384,
        targetModel: 'gemini-3-pro-preview',
        skepticProof: true,
        embeddingProvider: 'local-transformers',
        embeddingTimeoutMs: 30000,
        userFidelityThreshold: 0.8,
        hanziDensity: 0,
        regexProfile: 'baseline'
    };

    // Run the actual Measurement Layer Kernel
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
            }
        },
        stats: {
            totalLines: lines.length,
            extractedLines: blocks.length,
            averageConfidence: 0.95
        }
    };
}

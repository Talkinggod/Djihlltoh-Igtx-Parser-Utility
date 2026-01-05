
import { GoogleGenAI, Type } from "@google/genai";
import { ParseReport, IGTXBlock } from "../types";

const BATCH_SIZE = 5;

/**
 * Enriches the ParseReport with Semantic State (Stage 2/3) data using Gemini.
 * This process is post-hoc and does not alter the deterministic Stage 1 output.
 */
export async function enrichReportWithSemantics(
  report: ParseReport, 
  onProgress: (processed: number, total: number) => void,
  apiKey?: string
): Promise<ParseReport> {
    if (!apiKey) {
        console.warn("No API key provided for enrichment");
        return report; // Return unchanged if no key
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const totalBlocks = report.blocks.length;
    let processed = 0;
    
    // Deep copy blocks to avoid mutation issues during processing
    const enrichedBlocks = [...report.blocks];
    const enrichedIgtxBlocks = [...report.igtxDocument.blocks];

    // Process in batches to respect rate limits and context windows
    for (let i = 0; i < totalBlocks; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, totalBlocks);
        const currentBatch = enrichedBlocks.slice(i, batchEnd);
        
        try {
            const enrichedBatch = await processBatch(currentBatch, ai);
            
            // Update the main arrays
            for (let j = 0; j < enrichedBatch.length; j++) {
                const globalIndex = i + j;
                enrichedBlocks[globalIndex] = enrichedBatch[j];
                
                // Sync with IGTX Document structure
                if (enrichedIgtxBlocks[globalIndex]) {
                    enrichedIgtxBlocks[globalIndex] = {
                        ...enrichedIgtxBlocks[globalIndex],
                        semantic_state: enrichedBatch[j].semantic_state as any, // Cast to match IGTX structure
                        // We also add a trace that AI was used for this block in the integrity check
                        integrity: {
                            ...enrichedIgtxBlocks[globalIndex].integrity, // preservation
                            ai_enrichment: "gemini-3-pro-preview" 
                        } as any
                    };
                }
            }
        } catch (error) {
            console.error(`Batch processing failed for indices ${i}-${batchEnd}:`, error);
            // We continue processing other batches even if one fails
        }

        processed += (batchEnd - i);
        onProgress(processed, totalBlocks);
    }

    return {
        ...report,
        blocks: enrichedBlocks,
        igtxDocument: {
            ...report.igtxDocument,
            blocks: enrichedIgtxBlocks,
            processing: {
                ...report.igtxDocument.processing,
                // Append AI metadata to the document processing log
                tier4_assessment: {
                    ...report.igtxDocument.processing.tier4_assessment,
                    // We append a note about Stage 2
                    stage2_enrichment: {
                        model: "gemini-3-pro-preview",
                        timestamp: new Date().toISOString()
                    }
                } as any
            }
        }
    };
}

async function processBatch(blocks: any[], ai: any): Promise<any[]> {
    // CRITICAL GUARDRAIL: Only send clean_text (L1), block_id, and position.
    // Do NOT send rawSource, OCR diagnostics, or rejected lines to prevent hallucination 
    // based on noisy glosses or layout artifacts.
    const promptContext = blocks.map((b, idx) => 
        `Block ID: ${b.id}\nPosition: ${b.lineNumber}\nText: "${b.extractedLanguageLine}"`
    ).join("\n\n---\n\n");

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `You are a specialized linguistic analyzer for Interlinear Glossed Text (IGT).
        
        Your task is to populate the 'semantic_state' for the provided text blocks.
        Identify the main 'predicate' (verb/root), 'arguments' (semantic roles), and grammatical features based ONLY on the provided text.
        
        Input Blocks:
        ${promptContext}
        
        Return a JSON object containing an array 'results' where each item corresponds to the input blocks in order.`,
        config: {
            temperature: 0, // Enforce deterministic behavior for scientific reproducibility
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    results: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                predicate: { type: Type.STRING, nullable: true, description: "The semantic head/predicate of the clause" },
                                arguments: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of semantic arguments identified" },
                                features: {
                                    type: Type.OBJECT,
                                    properties: {
                                        tense: { type: Type.STRING, nullable: true },
                                        aspect: { type: Type.STRING, nullable: true },
                                        modality: { type: Type.STRING, nullable: true },
                                        polarity: { type: Type.STRING, nullable: true }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    const json = JSON.parse(response.text || "{\"results\": []}");
    const results = json.results || [];

    const timestamp = new Date().toISOString();
    const modelVersion = "gemini-3-pro-preview";

    // Merge results back into blocks
    return blocks.map((block, idx) => {
        const result = results[idx] || {};
        
        // Guardrail: Ensure structure exists even if AI returned partial data
        const semanticData = {
            predicate: result.predicate || null,
            arguments: result.arguments || [],
            features: result.features || {
                tense: null, aspect: null, modality: null, polarity: null
            },
            // CRITICAL GUARDRAIL: Explicit AI Provenance Injection
            provenance: {
                source: 'ai',
                model: modelVersion,
                generated_at: timestamp
            }
        };

        return {
            ...block,
            tier4: {
                ...block.tier4,
            },
            // This is the key update: filling the previously null semantic_state
            semantic_state: semanticData
        };
    });
}

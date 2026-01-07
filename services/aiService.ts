
import { GoogleGenAI, Type } from "@google/genai";
import { ParseReport, ParserDomain } from "../types";

const BATCH_SIZE = 5;

/**
 * Enriches the ParseReport with Semantic State (Stage 2/3) data using Gemini.
 * Supports both Linguistic Predicate Extraction and Legal Entity Extraction.
 */
export async function enrichReportWithSemantics(
  report: ParseReport,
  apiKey: string,
  onProgress: (processed: number, total: number) => void
): Promise<ParseReport> {
    if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please enter it in the header.");
    }

    const domain = report.metadata.domain;
    const totalBlocks = report.blocks.length;
    let processed = 0;
    
    const enrichedBlocks = [...report.blocks];
    const enrichedIgtxBlocks = [...report.igtxDocument.blocks];

    for (let i = 0; i < totalBlocks; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, totalBlocks);
        const currentBatch = enrichedBlocks.slice(i, batchEnd);
        
        try {
            const enrichedBatch = await processBatch(currentBatch, apiKey, domain);
            
            for (let j = 0; j < enrichedBatch.length; j++) {
                const globalIndex = i + j;
                enrichedBlocks[globalIndex] = enrichedBatch[j];
                
                if (enrichedIgtxBlocks[globalIndex]) {
                    enrichedIgtxBlocks[globalIndex] = {
                        ...enrichedIgtxBlocks[globalIndex],
                        semantic_state: enrichedBatch[j].semantic_state,
                        legal_state: enrichedBatch[j].legal_state,
                        integrity: {
                            ...enrichedIgtxBlocks[globalIndex].integrity,
                            ai_enrichment: "gemini-3-pro-preview" 
                        } as any
                    };
                }
            }
        } catch (error) {
            console.error(`Batch processing failed for indices ${i}-${batchEnd}:`, error);
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
                tier4_assessment: {
                    ...report.igtxDocument.processing.tier4_assessment,
                    stage2_enrichment: {
                        model: "gemini-3-pro-preview",
                        timestamp: new Date().toISOString()
                    }
                } as any
            }
        }
    };
}

async function processBatch(blocks: any[], apiKey: string, domain: ParserDomain): Promise<any[]> {
    const ai = new GoogleGenAI({ apiKey });

    const promptContext = blocks.map((b, idx) => 
        `Block ID: ${b.id}\nPosition: ${b.lineNumber}\nText: "${b.extractedLanguageLine}"`
    ).join("\n\n---\n\n");

    const systemInstruction = domain === 'legal'
       ? `You are an expert Legal Assistant specializing in analyzing court pleadings. Extract key legal entities.`
       : `You are a specialized linguistic analyzer for Interlinear Glossed Text (IGT). Identify predicates and arguments.`;

    const linguisticSchema = {
        type: Type.OBJECT,
        properties: {
            results: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        predicate: { type: Type.STRING, nullable: true },
                        arguments: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    };

    const legalSchema = {
        type: Type.OBJECT,
        properties: {
            results: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        parties: { 
                            type: Type.ARRAY, 
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    role: { type: Type.STRING, description: "Plaintiff, Defendant, Judge, etc." },
                                    name: { type: Type.STRING }
                                }
                            }
                        },
                        case_meta: {
                            type: Type.OBJECT,
                            properties: {
                                index_number: { type: Type.STRING, nullable: true },
                                court: { type: Type.STRING, nullable: true },
                                doc_type: { type: Type.STRING, nullable: true }
                            }
                        },
                        legal_points: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key legal arguments or principles in this block" }
                    }
                }
            }
        }
    };

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Input Blocks:
        ${promptContext}
        
        Return a JSON object containing an array 'results' matching the schema.`,
        config: {
            temperature: 0,
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: domain === 'legal' ? legalSchema : linguisticSchema
        }
    });

    let rawText = response.text || "{\"results\": []}";
    rawText = rawText.replace(/```json\n?|```/g, '').trim();

    let json;
    try {
        json = JSON.parse(rawText);
    } catch (e) {
        json = { results: [] };
    }

    const results = json.results || [];
    const timestamp = new Date().toISOString();
    const modelVersion = "gemini-3-pro-preview";

    return blocks.map((block, idx) => {
        const result = results[idx] || {};
        
        if (domain === 'legal') {
            return {
                ...block,
                legal_state: {
                    parties: result.parties || [],
                    case_meta: result.case_meta || { index_number: null, court: null, doc_type: null },
                    legal_points: result.legal_points || [],
                    provenance: { source: 'ai', model: modelVersion, generated_at: timestamp }
                }
            };
        } else {
            return {
                ...block,
                semantic_state: {
                    predicate: result.predicate || null,
                    arguments: result.arguments || [],
                    features: result.features || { tense: null, aspect: null, modality: null, polarity: null },
                    provenance: { source: 'ai', model: modelVersion, generated_at: timestamp }
                }
            };
        }
    });
}

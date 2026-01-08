
import { GoogleGenAI, Type } from "@google/genai";
import { ParseReport, ParserDomain } from "../types";
import { DocumentTypeService } from "./documentTypeService";

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
    const docTypeId = report.metadata.documentType;
    
    // Retrieve the Document Type Definition to contextualize the prompt
    const docTypeDef = docTypeId ? DocumentTypeService.getById(docTypeId) : undefined;

    const totalBlocks = report.blocks.length;
    let processed = 0;
    
    const enrichedBlocks = [...report.blocks];
    const enrichedIgtxBlocks = [...report.igtxDocument.blocks];

    for (let i = 0; i < totalBlocks; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, totalBlocks);
        const currentBatch = enrichedBlocks.slice(i, batchEnd);
        
        try {
            const enrichedBatch = await processBatch(currentBatch, apiKey, domain, docTypeDef);
            
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

async function processBatch(blocks: any[], apiKey: string, domain: ParserDomain, docTypeDef?: any): Promise<any[]> {
    const ai = new GoogleGenAI({ apiKey });

    const promptContext = blocks.map((b, idx) => 
        `Block ID: ${b.id}\nPosition: ${b.lineNumber}\nText: "${b.extractedLanguageLine}"`
    ).join("\n\n---\n\n");

    let systemInstruction = "";

    if (domain === 'legal') {
        const docTypeName = docTypeDef ? docTypeDef.name : "Court Document";
        const requiredSections = docTypeDef?.requiredSections ? `Look for sections: ${docTypeDef.requiredSections.join(', ')}.` : "";
        
        systemInstruction = `You are an expert Legal Assistant specializing in analyzing a **${docTypeName}**.
       
       ${docTypeDef?.description || ""}

       Task:
       1. Extract key entities (Parties, Court info).
       2. Identify **Foundational Documents** (Contracts, Leases, Affidavits, Exhibits) and **Legal Authorities** (CPLR, RPL, Statutes, Case Law).
       3. **Status Tracking**: Determine if a document is 'checked_in' (attached, exhibited, available) or 'missing' (referenced as not provided, unavailable, or failed to include).
       4. **Logic**: If a foundational document is critical (e.g., the Lease in a non-payment case) and is missing, flag it in the 'status' as 'missing' and add a note in 'logic_trace'.
       5. **Validation**: ${requiredSections}
       6. Default statutes to 'checked_in'.`;
    } else {
        systemInstruction = `You are a specialized linguistic analyzer for Interlinear Glossed Text (IGT). Identify predicates and arguments.`;
    }

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
                        foundational_docs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING, description: "Name of document or statute e.g. 'Exhibit A', 'CPLR 3211'" },
                                    category: { type: Type.STRING, enum: ['statute', 'case_law', 'evidence', 'contract', 'affidavit'] },
                                    status: { type: Type.STRING, enum: ['checked_in', 'missing', 'unavailable', 'unknown'], description: "Infer based on context. 'checked_in' if attached." },
                                    context: { type: Type.STRING, description: "Brief snippet justifying status" },
                                    description: { type: Type.STRING, nullable: true }
                                }
                            }
                        },
                        legal_points: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key legal arguments or principles in this block" },
                        logic_trace: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Logic warnings or inconsistencies found (e.g. 'Defendant implies lease is missing')" }
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
                    foundational_docs: result.foundational_docs || [],
                    logic_trace: result.logic_trace || [],
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

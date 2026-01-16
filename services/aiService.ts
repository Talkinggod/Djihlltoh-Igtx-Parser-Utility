
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { ParseReport, ParserDomain, AIPrivileges, CaseState, ViabilityAssessment, LegalBenchResult, LegalBenchTaskType, Claim } from "../types";
import { DocumentTypeService } from "./documentTypeService";

const BATCH_SIZE = 5;

// Helper for Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        let encoded = reader.result as string;
        // Remove data url prefix
        encoded = encoded.split(',')[1];
        resolve(encoded);
    };
    reader.onerror = error => reject(error);
  });
};

/**
 * Analyzes an image using Gemini Pro Vision capabilities.
 * Useful for OCR of handwritten notes, evidence photos, or scanned diagrams.
 */
export async function analyzeImage(file: File, apiKey: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await fileToBase64(file);
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
                { inlineData: { mimeType: file.type, data: base64Data } },
                { text: "Analyze this image. If it contains text, transcribe it exactly. If it is a scene or object, describe it in detail relevant for legal or linguistic analysis." }
            ]
        }
    });
    return response.text || "";
}

/**
 * Refines draft text using Gemini Flash for speed.
 */
export async function refineDraft(text: string, instruction: string, apiKey: string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Original Text: "${text}"\n\nInstruction: ${instruction}\n\nOutput the processed text only. Do not add conversational filler.`
    });
    return response.text || text;
}

// Tool to write to the "Drafting" tab (Updates current)
export const writeDraftTool: FunctionDeclaration = {
    name: "write_draft",
    description: "Writes or overwrites text in the CURRENT active draft in the Composition Editor. Use this for refining or editing the open document.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            content: {
                type: Type.STRING,
                description: "The full text content of the draft."
            }
        },
        required: ["content"]
    }
};

// Tool to create a NEW draft
export const createNewDraftTool: FunctionDeclaration = {
    name: "create_new_draft",
    description: "Creates a NEW, separate document in the Drafts list. Use this when the user asks to create a distinct document (e.g. 'Draft a Motion AND an Affidavit').",
    parameters: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "Title of the new document (e.g. 'Affidavit of Service')." },
            content: { type: Type.STRING, description: "The content of the new document." }
        },
        required: ["title", "content"]
    }
};

export const writeEditorTool: FunctionDeclaration = {
    name: "write_to_editor",
    description: "Writes to the Source/Input editor.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            content: { type: Type.STRING }
        },
        required: ["content"]
    }
};

// --- Google Drive Tools ---
export const listDriveFilesTool: FunctionDeclaration = {
    name: "list_drive_files",
    description: "Searches the user's Google Drive for files matching a query.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: { type: Type.STRING, description: "Search query." }
        },
        required: ["query"]
    }
};

export const readDriveFileTool: FunctionDeclaration = {
    name: "read_drive_file",
    description: "Reads the content of a specific file from Google Drive.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            fileId: { type: Type.STRING, description: "The ID of the file to read." }
        },
        required: ["fileId"]
    }
};

// --- NEW: Evidence & Exhibit Tools ---

export const markExhibitTool: FunctionDeclaration = {
    name: "mark_exhibit",
    description: "Formally marks a document for identification as a Trial Exhibit (e.g. 'Exhibit A', 'PX-1'). Use this when the user says 'Mark this as Exhibit X' or 'Prepare exhibit list'.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            designation: { type: Type.STRING, description: "The legal designation (e.g., 'Exhibit A', 'Plaintiff's Exhibit 1', 'DX-05')." },
            description: { type: Type.STRING, description: "A brief, formal legal description of the item (e.g., 'Email dated Jan 5 regarding breach')." },
            documentName: { type: Type.STRING, description: "The exact name of the file/document in the system to link this exhibit to." }
        },
        required: ["designation", "description", "documentName"]
    }
};

export const tagEvidenceTool: FunctionDeclaration = {
    name: "tag_evidence",
    description: "Applies semantic tags to a document regarding its legal implication, temporal relevance, or outcome impact. Use this to organize evidence.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            documentName: { type: Type.STRING, description: "The name of the document to tag." },
            category: { type: Type.STRING, enum: ['temporal', 'implication', 'relevance', 'outcome'], description: "The category of the tag." },
            label: { type: Type.STRING, description: "Short label (e.g., 'Breach Evidence', 'Pre-Statute', 'Damages')." },
            explanation: { type: Type.STRING, description: "Why this tag applies." }
        },
        required: ["documentName", "category", "label"]
    }
};

export async function sendChatMessage(
    history: { role: 'user' | 'model', text: string }[], 
    newMessage: string, 
    apiKey: string,
    domain: ParserDomain,
    currentProfile: string,
    targetLanguage: string,
    contextData?: string,
    privileges?: AIPrivileges,
    isDriveConnected?: boolean
): Promise<{ text: string, toolCall?: { name: string, args: any } }> {
    if (!apiKey) throw new Error("API Key required");

    const ai = new GoogleGenAI({ apiKey });

    // Dynamic Persona based on Domain
    let systemInstruction = "";
    if (domain === 'legal') {
        systemInstruction = `You are the Senior Litigation Paralegal and Trial Prep Specialist for Dziłtǫ́ǫ́ Legal Studio (Pro Sei Pro).
        
        CORE RESPONSIBILITIES:
        1. **Exhibit Preparation**: You are responsible for "Marking for Identification". When a user asks to mark evidence, use the 'mark_exhibit' tool. Adhere to standard conventions (Plaintiff = Numbers, Defendant = Letters, or as requested).
        2. **Evidence Analysis**: You analyze documents for *Relevance*, *Temporal Significance*, and *Legal Implication*. Use 'tag_evidence' to attach metadata to documents.
        3. **Drafting & Composition**: You create legal documents. 
           - Use 'create_new_draft' when starting a NEW document (e.g. creating a separate Affidavit, Notice, or Motion).
           - Use 'write_draft' to edit the currently open document.
        4. **Pipeline Awareness**: Be aware of the case status. If a deadline is approaching (based on context), prioritize evidence that supports the immediate filing.
        5. **Outcome Centered**: Focus on how a document proves or disproves a specific Cause of Action (IRAC Method).
        6. **SKEPTIC MODE**: When analyzing contracts (Leases, Licenses, Occupancy Agreements, etc.), assume the role of a skeptical auditor. Flag ambiguities, missing definitions, one-sided terms, and statutory conflicts (e.g. Mitchell-Lama rules, Rent Stabilization).
        7. **Semantic Coherence Analyst**: You have access to "Linguistic Physics" metrics (Lambda, Kappa, R²). 
           - Use 'Lambda' (λ) to judge the structural coherence of a pleading or contract. High Lambda (>0.1) suggests a "Flight of Ideas" or poorly drafted argument. Low Lambda (<0.02) implies strong, persistent topical focus.
           - Use 'R²' to determine if the document has a consistent logical flow. R² < 0.8 suggests the text is disjointed or assembled from unrelated parts.
           - If a document has low coherence metrics, flag it as potentially "vulnerable to dismissal" or "ambiguous".
        
        TONE: Professional, procedural, and precise.
        `;
    } else {
        systemInstruction = `You are the Linguistic Expert. Assist with IGT standards. Use 'write_draft' to create gloss examples.`;
    }

    // --- Intent Tunnel Implementation ---
    if (privileges?.driveScope) {
        systemInstruction += `\n\n[INTENT TUNNEL ACTIVE]\nWARNING: Programmatic Privileges are active. You are restricted to the Google Drive Folder: "${privileges.driveScope.name}".\n`;
    }

    systemInstruction += `\n\n[COMMUNICATION PROTOCOL]\nPrimary Language: ${targetLanguage}.`;

    if (contextData && contextData.trim().length > 0) {
        systemInstruction += `\n\n=== CASE CONTEXT & DOCUMENTS ===\n${contextData}`;
    }

    const tools: any[] = [{ functionDeclarations: [writeDraftTool, createNewDraftTool, writeEditorTool, markExhibitTool, tagEvidenceTool] }];
    
    if (privileges?.allowWebSearch) {
        tools.push({ googleSearch: {} });
    }

    if (isDriveConnected) {
        tools[0].functionDeclarations.push(listDriveFilesTool);
        tools[0].functionDeclarations.push(readDriveFileTool);
    }

    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.3, 
            tools: tools
        },
        history: history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }))
    });

    const result = await chat.sendMessage({
        message: newMessage
    });

    const functionCalls = result.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        return {
            text: "Processing legal action...", 
            toolCall: {
                name: call.name,
                args: call.args
            }
        };
    }

    let outputText = result.text || "I could not generate a response.";
    
    // Check for grounding
    const groundingChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0) {
        const sources = groundingChunks
            .map(c => c.web?.uri)
            .filter(Boolean)
            .map(uri => `Source: ${uri}`)
            .join('\n');
        if (sources) outputText += `\n\n${sources}`;
    }

    return { text: outputText };
}

/**
 * Intent Tunnel Extraction Engine.
 * Leverages the model to extract complex temporal and reference entities that regex misses.
 */
export async function extractLegalEntities(text: string, apiKey: string): Promise<{ dates: any[], references: any[] }> {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Task: Legal Entity Extraction (Intent Tunnel).
    
    Analyze the following legal document text. Extract TWO types of entities:
    
    1. **Dates**: Identify ALL relevant dates (Filing, Hearing, Service, Signature, Jurat, Deadlines, Incidents). 
       - Normalize the date to YYYY-MM-DD.
       - Provide the exact text snippet.
       - Provide context (surrounding words).
       - Classify the type (filing, hearing, service, signature, jurat, incident, deadline).
    
    2. **References**: Identify references to OTHER documents or exhibits.
       - e.g. "Exhibit A", "Lease Agreement dated 2020", "Prior Order".
       - Extract the full reference text.
       - Estimate the year if mentioned.
       - Classify document type.

    RETURN JSON ONLY.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            dates: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        date_normalized: { type: Type.STRING, description: "YYYY-MM-DD" },
                        text: { type: Type.STRING },
                        context: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['filing', 'hearing', 'service', 'signature', 'jurat', 'incident', 'deadline', 'reference'] }
                    }
                }
            },
            references: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        year: { type: Type.NUMBER, nullable: true },
                        documentType: { type: Type.STRING, nullable: true }
                    }
                }
            }
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt + "\n\nTEXT:\n" + text.slice(0, 30000), // Limit context
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        const jsonStr = response.text;
        if (!jsonStr) return { dates: [], references: [] };
        
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Intent Tunnel Extraction Failed", e);
        return { dates: [], references: [] };
    }
}

/**
 * Detects potential legal claims/causes of action from case context.
 */
export async function detectPotentialClaims(caseData: CaseState, apiKey: string): Promise<Claim[]> {
    const ai = new GoogleGenAI({ apiKey });
    
    // Build context
    const context = `
    Case Name: ${caseData.name}
    Case Type: ${caseData.caseMeta.type}
    Plaintiff: ${caseData.caseMeta.plaintiffs.join(', ')}
    Defendant: ${caseData.caseMeta.defendants.join(', ')}
    
    Recent Documents:
    ${caseData.documents.slice(0, 5).map(d => `- ${d.name} (${d.category}): ${d.content.slice(0, 300)}...`).join('\n')}
    
    User Input:
    ${caseData.input}
    `;

    const prompt = `Analyze the provided case context and documents. Identify potential legal Causes of Action (Claims) or Defenses that may apply.
    
    For each potential claim, provide:
    1. Title (e.g. "Breach of Contract", "Unjust Enrichment")
    2. Description (Why it applies based on facts)
    3. Likelihood (0-100 estimate of relevance)
    4. Relevant document names (if any)
    
    Return a structured object.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            claims: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING },
                        likelihood: { type: Type.NUMBER },
                        evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        }
    };

    try {
        // Use Flash for speed and reliability on simple extraction
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt + "\n\n" + context,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        const text = response.text;
        if (!text) throw new Error("Empty response from AI");
        
        const result = JSON.parse(text);
        const rawClaims = result.claims || [];

        return rawClaims.map((c: any) => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2,5),
            title: c.title,
            description: c.description,
            likelihood: c.likelihood,
            status: 'potential',
            evidenceRefs: c.evidence, // Just strings for now, mapping logic handled in UI
            detectedAt: new Date().toISOString()
        }));

    } catch(e: any) {
        console.error("Claim detection failed", e);
        throw e; // Propagate error so UI can handle it
    }
}

/**
 * Generates a comprehensive viability assessment for the case.
 */
export async function generateViabilityAssessment(caseData: CaseState, apiKey: string): Promise<ViabilityAssessment> {
    const ai = new GoogleGenAI({ apiKey });
    
    // Construct context from case metadata, input, and documents
    const docsSummary = caseData.documents.map(d => `[${d.type}] ${d.name}: ${d.content.slice(0, 500)}...`).join('\n');
    const context = `
    CASE: ${caseData.name}
    TYPE: ${caseData.caseMeta.type}
    JURISDICTION: ${caseData.caseMeta.jurisdiction}
    PLAINTIFF: ${caseData.caseMeta.plaintiffs.join(', ')}
    DEFENDANT: ${caseData.caseMeta.defendants.join(', ')}
    
    USER NOTES:
    ${caseData.input}
    
    DOCUMENTS AVAILABLE:
    ${docsSummary}
    `;

    const prompt = `You are a Senior Litigation Strategist. Conduct a Viability Assessment for this case based on the provided context.
    
    Analyze:
    1. Overall probability of success (0-100).
    2. Key factors driving this probability (Strengths, Weaknesses, Legal Basis).
    3. "Balance of Equities" - how a judge might view the fairness/hardship.
    
    Output structured JSON matching the ViabilityAssessment interface.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            overall_probability: { type: Type.NUMBER, description: "0-100 integer" },
            executive_summary: { type: Type.STRING },
            factors: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        rationale: { type: Type.STRING },
                        key_strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                        key_weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            },
            balance_of_equities: {
                type: Type.OBJECT,
                properties: {
                    plaintiff_equities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    defendant_equities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    conclusion: { type: Type.STRING }
                }
            }
        }
    };

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt + "\n\n" + context,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema
        }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    
    return {
        ...data,
        generated_at: new Date().toISOString()
    };
}

/**
 * Runs a specific LegalBench task (NLI, Classification, Extraction).
 */
export async function runLegalBenchTask(
    task: LegalBenchTaskType, 
    params: { text: string, hypothesis?: string, context?: string }, 
    apiKey: string
): Promise<LegalBenchResult> {
    const ai = new GoogleGenAI({ apiKey });
    
    let instruction = "";
    let prompt = `TEXT:\n${params.text}\n\n`;

    switch (task) {
        case 'contract_nli':
            instruction = "Determine if the HYPOTHESIS is entailed by, contradicts, or is unrelated to the contract TEXT.";
            prompt += `HYPOTHESIS: ${params.hypothesis}`;
            break;
        case 'hearsay':
            instruction = "Analyze the text for Hearsay evidence rules (FRE 801/802). Is it hearsay? Is there an exception?";
            if (params.context) prompt += `CONTEXT: ${params.context}`;
            break;
        case 'citation_retrieval':
            instruction = "Extract exact legal citations from the text or find the relevant clause for the query.";
            if (params.hypothesis) prompt += `QUERY: ${params.hypothesis}`;
            break;
        case 'rule_application':
            instruction = "Apply the legal rule described in HYPOTHESIS to the FACTS in TEXT.";
            prompt += `RULE/ISSUE: ${params.hypothesis}`;
            break;
        case 'abercrombie':
            instruction = "Classify the distinctiveness of the mark/term (Generic, Descriptive, Suggestive, Arbitrary, Fanciful).";
            if (params.context) prompt += `PRODUCT CLASS: ${params.context}`;
            break;
        case 'cuad_extraction':
            instruction = "Extract critical contract clauses (Parties, Term, Termination, Governing Law, Liability).";
            break;
        default:
            instruction = `Perform the task: ${task}`;
            break;
    }

    const schema = {
        type: Type.OBJECT,
        properties: {
            conclusion: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            citations: { type: Type.ARRAY, items: { type: Type.STRING } },
            extracted_clauses: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT, 
                    properties: { 
                        type: { type: Type.STRING }, 
                        text: { type: Type.STRING } 
                    } 
                } 
            }
        }
    };

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
            systemInstruction: instruction,
            responseMimeType: "application/json",
            responseSchema: schema
        }
    });

    const text = response.text || "{}";
    return { ...JSON.parse(text), task };
}

/**
 * Enriches the ParseReport with Semantic State (Stage 2/3) data using Gemini.
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
    // Corrected property access for documentType in metadata
    const docTypeId = report.metadata.documentType;
    const docTypeDef = docTypeId ? DocumentTypeService.getById(docTypeId) : undefined;
    const totalBlocks = report.blocks.length;
    let processed = 0;
    const enrichedBlocks = [...report.blocks];
    // Corrected property access for igtxDocument
    const enrichedIgtxBlocks = [...(report.igtxDocument?.blocks || [])];

    for (let i = 0; i < totalBlocks; i += BATCH_SIZE) {
        const batchEnd = Math.min(i + BATCH_SIZE, totalBlocks);
        const currentBatch = enrichedBlocks.slice(i, batchEnd);
        try {
            const enrichedBatch = await processBatch(currentBatch, apiKey, domain, docTypeDef);
            for (let j = 0; j < enrichedBatch.length; j++) {
                const globalIndex = i + j;
                if (enrichedBatch[j]) {
                    enrichedBlocks[globalIndex] = { ...enrichedBlocks[globalIndex], ...enrichedBatch[j] };
                    if (enrichedIgtxBlocks[globalIndex]) {
                        enrichedIgtxBlocks[globalIndex] = {
                            ...enrichedIgtxBlocks[globalIndex],
                            semantic_state: enrichedBatch[j].semantic_state,
                            legal_state: enrichedBatch[j].legal_state,
                            integrity: { ...enrichedIgtxBlocks[globalIndex].integrity, ai_enrichment: "gemini-3-pro-preview" } as any
                        };
                    }
                }
            }
        } catch (error) { console.error(`Batch processing failed`, error); }
        processed += (batchEnd - i);
        onProgress(processed, totalBlocks);
    }
    // Corrected igtxDocument assignment to avoid type errors
    return { ...report, blocks: enrichedBlocks, igtxDocument: { ...(report.igtxDocument || {}), blocks: enrichedIgtxBlocks } };
}

async function processBatch(blocks: any[], apiKey: string, domain: ParserDomain, docTypeDef?: any): Promise<any[]> {
    const ai = new GoogleGenAI({ apiKey });
    const promptContext = blocks.map((b, idx) => `Block ID: ${b.id}\nPosition: ${b.lineNumber}\nText: "${b.extractedLanguageLine}"`).join("\n\n---\n\n");
    let systemInstruction = "";
    if (domain === 'legal') {
        systemInstruction = `You are a Skeptic Contract Auditor and Legal Strategy Engine. 
        
        TASK:
        1. **Contract Analysis**: Determine if the text contains Contract Components (Preamble, Operative, Boilerplate) for any Agreement, Lease, License, or Occupancy Agreement.
        2. **Core Elements**: Identify Offer, Acceptance, or Consideration if explicitly present.
        3. **Vulnerability & Strategy Scanning**: 
           - Identify RISKS ('adverse'): Ambiguity, Compliance issues, Uncapped Liability, One-sided terms hurting the user.
           - Identify OPPORTUNITIES ('favorable'): Terms that provide strategic leverage, easy termination, or protection for the user.
           - Identify NEUTRAL factors.
        4. **Obligation Extraction**: Who must do what? By when?
        
        Adopt a problem-finding mindset. Look for one-sided terms and conflicts with governing law.
        IMPORTANT: 'impact' field is crucial. 'adverse' = Bad for user. 'favorable' = Good for user. 'neutral' = Standard/Balanced.`;
    } else {
        systemInstruction = `You are a linguistic analyzer. Identify predicates and arguments.`;
    }

    const linguisticSchema = { type: Type.OBJECT, properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { predicate: { type: Type.STRING, nullable: true }, arguments: { type: Type.ARRAY, items: { type: Type.STRING } }, features: { type: Type.OBJECT, properties: { tense: { type: Type.STRING, nullable: true }, aspect: { type: Type.STRING, nullable: true }, modality: { type: Type.STRING, nullable: true }, polarity: { type: Type.STRING, nullable: true } } } } } } } };
    
    // Expanded Legal Schema for Contract Logic
    const legalSchema = { type: Type.OBJECT, properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { 
        parties: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, name: { type: Type.STRING } } } }, 
        case_meta: { type: Type.OBJECT, properties: { index_number: { type: Type.STRING, nullable: true }, court: { type: Type.STRING, nullable: true }, doc_type: { type: Type.STRING, nullable: true } } }, 
        foundational_docs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, category: { type: Type.STRING }, status: { type: Type.STRING }, context: { type: Type.STRING }, description: { type: Type.STRING, nullable: true } } } }, 
        legal_points: { type: Type.ARRAY, items: { type: Type.STRING } }, 
        logic_trace: { type: Type.ARRAY, items: { type: Type.STRING } },
        // Contract Specifics
        contract_analysis: { type: Type.OBJECT, nullable: true, properties: {
            component_type: { type: Type.STRING, enum: ['preamble', 'recitals', 'definitions', 'operative_clause', 'rep_warranty', 'boilerplate', 'signature_block', 'other'] },
            core_element: { type: Type.STRING, enum: ['offer', 'acceptance', 'consideration', 'capacity', 'legality'], nullable: true },
            statutory_conflict: { type: Type.STRING, nullable: true, description: "Describe any conflict with governing laws (e.g. Tenancy Laws, UCC)." },
            risks: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                severity: { type: Type.STRING, enum: ['critical', 'high', 'moderate', 'low'] },
                category: { type: Type.STRING, enum: ['ambiguity', 'compliance', 'financial', 'liability', 'termination', 'vulnerability'] },
                impact: { type: Type.STRING, enum: ['adverse', 'favorable', 'neutral'], description: "adverse = risk to user; favorable = advantage for user" },
                description: { type: Type.STRING },
                mitigation: { type: Type.STRING, nullable: true }
            }}},
            obligations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                actor: { type: Type.STRING },
                action: { type: Type.STRING },
                deadline: { type: Type.STRING, nullable: true },
                condition: { type: Type.STRING, nullable: true }
            }}}
        }}
    } } } } };

    const prompt = `Analyze the following text blocks based on the system instructions:\n\n${promptContext}`;
    const activeSchema = domain === 'legal' ? legalSchema : linguisticSchema;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: activeSchema,
                tools: [{ googleSearch: {} }] // Enable grounding
            }
        });

        const text = response.text || "{}";
        const result = JSON.parse(text);
        return result.results || [];
    } catch (e) {
        console.error("LegalBench task failed", e);
        throw e;
    }
}
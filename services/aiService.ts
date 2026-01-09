
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { ParseReport, ParserDomain, AIPrivileges } from "../types";
import { DocumentTypeService } from "./documentTypeService";

const BATCH_SIZE = 5;

// Tool to write to the "Drafting" tab
export const writeDraftTool: FunctionDeclaration = {
    name: "write_draft",
    description: "Writes or overwrites text in the Drafting/Composition Editor. Use this when the user asks you to draft, compose, write, or generate a legal document, email, or template. Do NOT use this for answering general questions.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            content: {
                type: Type.STRING,
                description: "The full text content of the draft. For legal docs, include Caption, Index No, and Signature lines."
            }
        },
        required: ["content"]
    }
};

export const writeEditorTool: FunctionDeclaration = {
    name: "write_to_editor",
    description: "Writes to the Source/Input editor. Use strictly if the user asks to modify the 'source text'. Prefer 'write_draft' for creating new documents.",
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
    description: "Searches the user's Google Drive for files matching a query. Returns a list of files with IDs and names.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: { type: Type.STRING, description: "Search query (e.g. 'contract', 'affidavit', 'smith v jones')." }
        },
        required: ["query"]
    }
};

export const readDriveFileTool: FunctionDeclaration = {
    name: "read_drive_file",
    description: "Reads the content of a specific file from Google Drive. Use the ID obtained from list_drive_files.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            fileId: { type: Type.STRING, description: "The ID of the file to read." }
        },
        required: ["fileId"]
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
        systemInstruction = `You are the Senior Legal Assistant for Dziłtǫ́ǫ́ Legal Studio. 
        
        Role:
        - Draft legal documents (Motions, Affidavits, Orders) with strict adherence to NY CPLR formatting.
        - Access Google Drive to find case precedents or evidence if requested.
        - Use 'write_draft' to output documents.
        
        Tone: Professional, Concise, Authoritative.`;
    } else {
        systemInstruction = `You are the Linguistic Expert. Assist with IGT standards. Use 'write_draft' to create gloss examples.`;
    }

    // --- Intent Tunnel Implementation ---
    if (privileges?.driveScope) {
        systemInstruction += `\n\n[INTENT TUNNEL ACTIVE]\nWARNING: Programmatic Privileges are active. You are restricted to the Google Drive Folder: "${privileges.driveScope.name}".\n\nPROTOCOL:\n1. When searching for files, assume they must exist within this folder context.\n2. Do NOT hallucinate documents outside this scope.\n3. Verify all file references against the 'list_drive_files' tool output.`;
    }

    systemInstruction += `\n\n[COMMUNICATION PROTOCOL]\nPrimary Language: ${targetLanguage}.`;

    if (contextData && contextData.trim().length > 0) {
        systemInstruction += `\n\n=== CONTEXT ===\n${contextData}`;
    }

    const tools: any[] = [{ functionDeclarations: [writeDraftTool, writeEditorTool] }];
    
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
            text: "I am processing your request...", // Placeholder for multi-turn tool logic in UI
            toolCall: {
                name: call.name,
                args: call.args
            }
        };
    }

    // Check for grounding
    let outputText = result.text || "I could not generate a response.";
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
    const docTypeId = report.metadata.documentType;
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
                        integrity: { ...enrichedIgtxBlocks[globalIndex].integrity, ai_enrichment: "gemini-3-pro-preview" } as any
                    };
                }
            }
        } catch (error) { console.error(`Batch processing failed`, error); }
        processed += (batchEnd - i);
        onProgress(processed, totalBlocks);
    }
    return { ...report, blocks: enrichedBlocks, igtxDocument: { ...report.igtxDocument, blocks: enrichedIgtxBlocks } };
}

async function processBatch(blocks: any[], apiKey: string, domain: ParserDomain, docTypeDef?: any): Promise<any[]> {
    const ai = new GoogleGenAI({ apiKey });
    const promptContext = blocks.map((b, idx) => `Block ID: ${b.id}\nPosition: ${b.lineNumber}\nText: "${b.extractedLanguageLine}"`).join("\n\n---\n\n");
    let systemInstruction = "";
    if (domain === 'legal') {
        systemInstruction = `You are an expert Legal Assistant. Task: Extract entities, foundational docs, and status.`;
    } else {
        systemInstruction = `You are a linguistic analyzer. Identify predicates and arguments.`;
    }

    const linguisticSchema = { type: Type.OBJECT, properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { predicate: { type: Type.STRING, nullable: true }, arguments: { type: Type.ARRAY, items: { type: Type.STRING } }, features: { type: Type.OBJECT, properties: { tense: { type: Type.STRING, nullable: true }, aspect: { type: Type.STRING, nullable: true }, modality: { type: Type.STRING, nullable: true }, polarity: { type: Type.STRING, nullable: true } } } } } } } };
    const legalSchema = { type: Type.OBJECT, properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { parties: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { role: { type: Type.STRING }, name: { type: Type.STRING } } } }, case_meta: { type: Type.OBJECT, properties: { index_number: { type: Type.STRING, nullable: true }, court: { type: Type.STRING, nullable: true }, doc_type: { type: Type.STRING, nullable: true } } }, foundational_docs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, category: { type: Type.STRING }, status: { type: Type.STRING }, context: { type: Type.STRING }, description: { type: Type.STRING, nullable: true } } } }, legal_points: { type: Type.ARRAY, items: { type: Type.STRING } }, logic_trace: { type: Type.ARRAY, items: { type: Type.STRING } } } } } } };

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `Input Blocks:\n${promptContext}\nReturn JSON array 'results'.`,
        config: { temperature: 0, systemInstruction: systemInstruction, responseMimeType: "application/json", responseSchema: domain === 'legal' ? legalSchema : linguisticSchema }
    });

    let rawText = response.text || "{\"results\": []}";
    rawText = rawText.replace(/```json\n?|```/g, '').trim();
    let json;
    try { json = JSON.parse(rawText); } catch (e) { json = { results: [] }; }
    const results = json.results || [];
    const timestamp = new Date().toISOString();

    return blocks.map((block, idx) => {
        const result = results[idx] || {};
        if (domain === 'legal') {
            return { ...block, legal_state: { parties: result.parties || [], case_meta: result.case_meta || {}, legal_points: result.legal_points || [], foundational_docs: result.foundational_docs || [], logic_trace: result.logic_trace || [], provenance: { source: 'ai', model: "gemini-3-pro-preview", generated_at: timestamp } } };
        } else {
            return { ...block, semantic_state: { predicate: result.predicate || null, arguments: result.arguments || [], features: result.features || {}, provenance: { source: 'ai', model: "gemini-3-pro-preview", generated_at: timestamp } } };
        }
    });
}


import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { ParseReport, ParserDomain, AIPrivileges, CaseState, ViabilityAssessment, LegalBenchResult, LegalBenchTaskType } from "../types";
import { DocumentTypeService } from "./documentTypeService";

const BATCH_SIZE = 5;

// Tool to write to the "Drafting" tab
export const writeDraftTool: FunctionDeclaration = {
    name: "write_draft",
    description: "Writes or overwrites text in the Drafting/Composition Editor. Use this when the user asks you to draft, compose, write, or generate a legal document, email, or template.",
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
        3. **Pipeline Awareness**: Be aware of the case status. If a deadline is approaching (based on context), prioritize evidence that supports the immediate filing.
        4. **Outcome Centered**: Focus on how a document proves or disproves a specific Cause of Action (IRAC Method).
        5. **SKEPTIC MODE**: When analyzing contracts (Leases, Licenses, Occupancy Agreements, etc.), assume the role of a skeptical auditor. Flag ambiguities, missing definitions, one-sided terms, and statutory conflicts (e.g., Mitchell-Lama rules, Rent Stabilization).
        
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

    const tools: any[] = [{ functionDeclarations: [writeDraftTool, writeEditorTool, markExhibitTool, tagEvidenceTool] }];
    
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
            return { 
                ...block, 
                legal_state: { 
                    parties: result.parties || [], 
                    case_meta: result.case_meta || {}, 
                    legal_points: result.legal_points || [], 
                    foundational_docs: result.foundational_docs || [], 
                    logic_trace: result.logic_trace || [], 
                    contract_analysis: result.contract_analysis || null,
                    provenance: { source: 'ai', model: "gemini-3-pro-preview", generated_at: timestamp } 
                } 
            };
        } else {
            return { ...block, semantic_state: { predicate: result.predicate || null, arguments: result.arguments || [], features: result.features || {}, provenance: { source: 'ai', model: "gemini-3-pro-preview", generated_at: timestamp } } };
        }
    });
}

/**
 * Generates a comprehensive "Balance of Equities" & Viability Assessment for the entire case.
 */
export async function generateViabilityAssessment(caseData: CaseState, apiKey: string): Promise<ViabilityAssessment> {
    const ai = new GoogleGenAI({ apiKey });

    // Prepare Context from Case Documents
    const documentContext = caseData.documents
        .slice(0, 10) // Limit to first 10 docs to fit context window comfortably
        .map(d => `Document [${d.type}] "${d.name}":\n${d.content.slice(0, 3000)}...`) // Truncate content
        .join("\n\n---\n\n");

    const systemInstruction = `You are a Senior Litigation Strategist and Judicial Clerk.
    
    Your task is to perform a "Case Viability Assessment" and "Balance of Equities" analysis based on the provided case files.
    
    You must be PRAGMATIC, CYNICAL, and REALISTIC. Do not just recite the law; evaluate the *likelihood of winning*.
    
    Assess the following Core Factors:
    1. **Factual & Evidentiary Strength**: Quantity/Quality of proof. Is it hearsay or hard evidence?
    2. **Legal Analysis**: Do the facts fit the elements of the Cause of Action? Precedent strength?
    3. **Liability & Causation**: Is fault clear? Is the link to damages direct?
    4. **Opponent's Case**: Strength of defenses (Comparative negligence, Statute of Limitations, etc.).
    5. **Judicial & Venue Factors**: Considering the jurisdiction (if known), are there biases?
    6. **Damages**: Severity and provability.
    
    Output a numeric score (0-100) for each factor, where 0 is fatal weakness and 100 is slam-dunk.
    Calculate an OVERALL Probability of Success (0-100%).
    
    Finally, produce a "Balance of Equities" list:
    - Plaintiff Equities: Factors making it fair/just for Plaintiff to win.
    - Defendant Equities: Factors making it fair/just for Defendant to win.
    
    Use Google Search grounding to verify specific statutes or venue tendencies if mentioned.`;

    const prompt = `Case Name: ${caseData.name}
    Case Type: ${caseData.caseMeta.type}
    Jurisdiction: ${caseData.caseMeta.jurisdiction}
    
    CASE DOCUMENTS:
    ${documentContext}
    
    Generate the Viability Assessment JSON.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            overall_probability: { type: Type.NUMBER, description: "0 to 100 integer representing win chance." },
            factors: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING, enum: ['factual_strength', 'legal_basis', 'liability_causation', 'damages', 'opponent_position', 'judicial_venue'] },
                        score: { type: Type.NUMBER },
                        rationale: { type: Type.STRING },
                        key_strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                        key_weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            },
            executive_summary: { type: Type.STRING },
            balance_of_equities: {
                type: Type.OBJECT,
                properties: {
                    plaintiff_equities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    defendant_equities: { type: Type.ARRAY, items: { type: Type.STRING } },
                    conclusion: { type: Type.STRING, description: "Who holds the equitable advantage?" }
                }
            }
        }
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema,
                tools: [{ googleSearch: {} }] // Enable grounding for legal research
            }
        });

        const text = response.text || "{}";
        const result = JSON.parse(text);
        
        return {
            ...result,
            generated_at: new Date().toISOString()
        };

    } catch (error) {
        console.error("Viability Assessment Failed", error);
        throw new Error("Failed to generate assessment. Ensure API Key is valid and documents contain text.");
    }
}

/**
 * Runs specific LegalBench-inspired tasks (Hearsay, ContractNLI, etc.)
 */
export async function runLegalBenchTask(
    task: LegalBenchTaskType,
    inputs: { text: string, context?: string, hypothesis?: string },
    apiKey: string
): Promise<LegalBenchResult> {
    const ai = new GoogleGenAI({ apiKey });
    
    let prompt = "";
    let systemInstruction = "";
    let responseSchema: any = {
        type: Type.OBJECT,
        properties: {
            task: { type: Type.STRING },
            conclusion: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            citations: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
    };
    
    // --- TASK CONFIGURATION ---
    if (task === 'hearsay') {
        systemInstruction = `You are an expert on the Federal Rules of Evidence (FRE). 
        Task: Determine if the provided evidence is Hearsay.
        1. Is it an out-of-court statement?
        2. Is it offered to prove the truth of the matter asserted?
        3. Does a specific exception (FRE 803/804) apply?
        
        Output 'Admissible' or 'Inadmissible Hearsay' as the conclusion.`;
        prompt = `Evidence: "${inputs.text}"\nContext: ${inputs.context || "None"}\n\nAnalyze hearsay status.`;
    } 
    else if (task === 'contract_nli') {
        systemInstruction = `You are a Contract Logic Engine. Perform Natural Language Inference (NLI).
        Premise: The Contract Text.
        Hypothesis: The User's Question/Assertion.
        
        Determine the relationship:
        - Entailment: The hypothesis is definitely true given the contract.
        - Contradiction: The hypothesis is definitely false.
        - Neutral: The contract does not address this or it is ambiguous.
        
        Be strict.`;
        prompt = `Contract Text: "${inputs.text}"\nHypothesis: "${inputs.hypothesis}"\n\nDetermine Entailment/Contradiction/Neutral.`;
    }
    else if (task === 'abercrombie') {
        systemInstruction = `You are a Trademark Law Expert. Classify the term on the Abercrombie spectrum of distinctiveness.
        Spectrum: Generic, Descriptive, Suggestive, Arbitrary, Fanciful.`;
        prompt = `Term: "${inputs.text}"\nContext/Goods: ${inputs.context}\n\nClassify distinctiveness.`;
    }
    else if (task === 'rule_application') {
        systemInstruction = `You are a Pro Se Legal Assistant. Apply the law to the facts.
        Format: IRAC (Issue, Rule, Application, Conclusion).
        Cite specific rules (FRCP, CPLR) if applicable.`;
        prompt = `Facts: "${inputs.text}"\nIssue/Question: ${inputs.hypothesis || "Does this meet the legal standard?"}\n\nAnalyze.`;
    }
    else if (task === 'case_hold') {
        systemInstruction = `You are a Legal Scholar specializing in Case Law Holdings.
        Task: Analyze the provided case text or summary.
        1. Identify the 'Holding' - the specific rule of law established.
        2. Distinguish it from 'Dicta'.
        3. Explain the reasoning.
        
        Output the Holding as the Conclusion.`;
        prompt = `Case Text: "${inputs.text}"\n\nIdentify the HOLDING.`;
    }
    else if (task === 'proa') {
        systemInstruction = `You are a Statutory Analyst.
        Task: Determine if the provided statute contains a Private Right of Action (PROA).
        Does it explicitly or implicitly allow a private individual to sue? Or is enforcement reserved for the government?
        
        Output 'PROA Exists' or 'No PROA' as the conclusion.`;
        prompt = `Statute: "${inputs.text}"\n\nAnalyze for Private Right of Action.`;
    }
    // --- CUAD Extraction (Contract Understanding) ---
    else if (task === 'cuad_extraction') {
        systemInstruction = `You are a Contract Reviewer trained on the CUAD (Contract Understanding Atticus Dataset) schema.
        Task: Scan the provided contract text and extract specific clauses defined in CUAD.
        
        Categories to detect:
        - Termination for Convenience
        - Governing Law
        - Jurisdiction
        - Anti-Assignment
        - Intellectual Property (IP)
        - Force Majeure
        - Non-Compete
        
        Output a list of clauses with the EXACT text span found.`;
        prompt = `Contract Text: "${inputs.text}"\n\nExtract key CUAD clauses.`;
        
        responseSchema = {
            type: Type.OBJECT,
            properties: {
                task: { type: Type.STRING },
                conclusion: { type: Type.STRING },
                extracted_clauses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING },
                            text: { type: Type.STRING, description: "Verbatim quote of the clause." }
                        }
                    }
                },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
            }
        };
    }
    // --- LegalBench-RAG (Precise Retrieval) ---
    else if (task === 'citation_retrieval') {
        systemInstruction = `You are a Legal Search Engine complying with LegalBench-RAG protocols.
        Task: Precision Retrieval.
        Goal: Retrieve the EXACT text span (verbatim quote) from the corpus that answers the query.
        
        Constraint: Do NOT paraphrase. Do NOT summarize. Return only the quote(s) that directly address the question.
        If no relevant text is found, state that.
        
        Output the found quote(s) in the 'extracted_clauses' array.`;
        prompt = `Corpus: "${inputs.text}"\nQuery: "${inputs.hypothesis}"\n\nFind exact citations.`;
        
        responseSchema = {
            type: Type.OBJECT,
            properties: {
                task: { type: Type.STRING },
                conclusion: { type: Type.STRING, description: "Found / Not Found" },
                extracted_clauses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, description: "Label (e.g. 'Relevant Span')" },
                            text: { type: Type.STRING, description: "The exact citation." }
                        }
                    }
                },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
            }
        };
    }
    // --- LexGLUE: Unfair ToS ---
    else if (task === 'unfair_tos') {
        systemInstruction = `You are a Consumer Protection Lawyer trained on the LexGLUE UNFAIR-ToS dataset.
        Task: Analyze the Terms of Service (ToS) or Contract for unfair, voidable, or abusive terms.
        
        Categories to Flag:
        - Limitation of Liability (Excessive)
        - Unilateral Change (Provider can change terms without notice)
        - Content Removal (Provider can delete data without reason)
        - Contract by Acceptance (Browsewrap)
        - Choice of Law / Forum Selection (Inconvenient venue)
        - Arbitration (Mandatory binding arbitration)
        - Unilateral Termination
        
        Extract the unfair clauses verbatim.`;
        prompt = `Terms of Service: "${inputs.text}"\n\nIdentify UNFAIR terms.`;
        
        responseSchema = {
            type: Type.OBJECT,
            properties: {
                task: { type: Type.STRING },
                conclusion: { type: Type.STRING },
                extracted_clauses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, description: "Type of unfairness (e.g. 'Arbitration')" },
                            text: { type: Type.STRING, description: "The clause text." }
                        }
                    }
                },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
            }
        };
    }
    // --- LexGLUE: LEDGAR (Provision Classification) ---
    else if (task === 'ledgar_classification') {
        systemInstruction = `You are a Legal Taxonomist trained on the LexGLUE LEDGAR dataset.
        Task: Classify the provided contract provision (paragraph) into one of the standard LEDGAR categories.
        
        Examples: Adjustments, Amendments, Assignments, Confidentiality, Counterparts, Entire Agreement, Expenses, Governing Law, Indemnification, Notices, Severability, Survival, Termination, Waivers.
        
        Return the single most accurate classification label.`;
        prompt = `Provision Text: "${inputs.text}"\n\nClassify this provision.`;
        
        // Simple schema for classification
    }
    // --- BigLaw Bench: SPA Extraction ---
    else if (task === 'spa_extraction') {
        systemInstruction = `You are a Senior M&A Associate trained on the BigLaw Bench SPA (Share Purchase Agreement) dataset.
        Task: Extract key economic and legal deal points from the SPA text.
        
        Extract:
        - Purchase Price (Amount & Adjustments)
        - Working Capital Target
        - Indemnification Cap / Basket / Deductible
        - Survival Period (General vs Fundamental Reps)
        - Governing Law
        - Closing Date
        
        Format extraction as a list of key-value pairs in 'extracted_clauses'.`;
        prompt = `SPA Text: "${inputs.text}"\n\nExtract Deal Points.`;
        
        responseSchema = {
            type: Type.OBJECT,
            properties: {
                task: { type: Type.STRING },
                conclusion: { type: Type.STRING, description: "Summary of Deal" },
                extracted_clauses: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, description: "Deal Point Name (e.g. 'Purchase Price')" },
                            text: { type: Type.STRING, description: "The value/clause found." }
                        }
                    }
                },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING }
            }
        };
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                tools: [{ googleSearch: {} }] // Enable grounding
            }
        });

        const text = response.text || "{}";
        const result = JSON.parse(text);
        
        return {
            ...result,
            task: task // Ensure task matches input
        };

    } catch (error) {
        console.error("LegalBench Task Failed", error);
        throw new Error("Analysis failed.");
    }
}

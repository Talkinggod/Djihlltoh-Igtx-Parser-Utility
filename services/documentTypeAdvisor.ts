
import { DocumentTypeDefinition, DocumentTypeAction, DocumentTypeDeadline, DocumentTypeStrategy } from '../types';
import { GoogleGenAI, Type } from "@google/genai";

interface AdvicePackage {
    definition: DocumentTypeDefinition;
    criticalAlerts: string[];
    suggestedActions: string[];
}

export const DocumentTypeAdvisor = {
    /**
     * Generates an advice package based on the definition.
     */
    getAdvice: (def: DocumentTypeDefinition): AdvicePackage => {
        const criticalAlerts: string[] = [];
        const suggestedActions: string[] = [];

        // Deadline Analysis
        def.deadlines.forEach(d => {
            if (d.isJurisdictional) {
                criticalAlerts.push(`CRITICAL DEADLINE: ${d.label} is ${d.duration} from ${d.trigger}. Failure may result in default.`);
            }
        });

        // Action Analysis
        def.actions.forEach(a => {
            if (a.priority === 'critical') {
                criticalAlerts.push(`ACTION REQUIRED: ${a.label} - ${a.description || ''}`);
            } else {
                suggestedActions.push(`${a.label} (${a.priority})`);
            }
        });

        // Strategy Analysis
        def.strategies.forEach(s => {
            suggestedActions.push(`STRATEGY [${s.scenario}]: ${s.recommendation}`);
        });

        return {
            definition: def,
            criticalAlerts,
            suggestedActions
        };
    },

    /**
     * Uses GenAI to hallucinate a definition for a completely new, user-entered document type.
     */
    generateDefinitionForNewType: async (typeName: string, apiKey: string): Promise<DocumentTypeDefinition> => {
        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `You are a Legal Clerk AI. The user has introduced a new document type: "${typeName}".
        
        Create a rigorous definition for this document type including:
        1. A description.
        2. Critical actions (filing, service).
        3. Standard deadlines (statutory or procedural).
        4. Strategic recommendations.
        5. Required sections.

        Format as JSON matching the DocumentTypeDefinition interface.`;

        const schema = {
            type: Type.OBJECT,
            properties: {
                description: { type: Type.STRING },
                category: { type: Type.STRING, enum: ['pleading', 'motion', 'discovery', 'judgment', 'contract', 'other'] },
                actions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            label: { type: Type.STRING },
                            type: { type: Type.STRING, enum: ['filing', 'response', 'appearance', 'service', 'internal'] },
                            priority: { type: Type.STRING, enum: ['critical', 'high', 'medium', 'low'] },
                            description: { type: Type.STRING }
                        }
                    }
                },
                deadlines: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            label: { type: Type.STRING },
                            trigger: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            isJurisdictional: { type: Type.BOOLEAN }
                        }
                    }
                },
                strategies: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            scenario: { type: Type.STRING },
                            recommendation: { type: Type.STRING }
                        }
                    }
                },
                requiredSections: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        };

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema
                }
            });

            const text = response.text || "{}";
            const data = JSON.parse(text);

            return {
                id: typeName.toLowerCase().replace(/\s+/g, '_'),
                name: typeName,
                isUserDefined: true,
                relatedMotions: [],
                ...data
            };

        } catch (e) {
            console.error("Failed to generate definition", e);
            // Fallback
            return {
                id: typeName.toLowerCase().replace(/\s+/g, '_'),
                name: typeName,
                category: 'other',
                description: 'User defined document type.',
                actions: [],
                deadlines: [],
                relatedMotions: [],
                strategies: [],
                isUserDefined: true
            };
        }
    }
};

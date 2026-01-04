
import { GoogleGenAI } from "@google/genai";
import { IGTXSource } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Scrapes linguistic text content from a URL using Gemini Search Grounding.
 * This effectively acts as a semantic proxy for client-side ingestion.
 */
export async function scrapeUrlViaGemini(url: string): Promise<{ text: string, metadata: Partial<IGTXSource> }> {
  // Upgraded to Pro for better context understanding and search synthesis
  const model = 'gemini-3-pro-preview'; 

  // Prompt engineered for ethnographic text extraction with STRICT guardrails
  // Using specific instructions to leverage Search Grounding effectively
  const prompt = `Task: Web Scrape & Extract
Target URL: ${url}

You are an expert linguistic data extractor. Your goal is to retrieve the full ethnographic/linguistic text from the target URL using Google Search Grounding.

Instructions:
1. Use the googleSearch tool to access the content of this page.
2. If the URL is specific (like a text ID), try to find the full text content.
3. Extract the MAIN body of text (stories, glosses, narratives) verbatim.
4. If audio transcripts are present (e.g. "Listen to text"), include the transcriptions.
5. FILTER OUT: Navigation menus, footers, sidebars, advertisements, and generic site boilerplate.
6. FORMAT: Return the text VERBATIM. Preserve line breaks, stanza formatting, and original orthography.

STRICT CONSTRAINT:
- Do NOT summarize.
- Do NOT paraphrase.
- Do NOT translate (unless the page serves a translation).
- Return ONLY the raw content.

If you absolutely cannot find the text content for this URL via search, return exactly: "[NO_CONTENT_FOUND]"`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{googleSearch: {}}], 
      }
    });

    let extractedText = response.text || "";
    
    // Check for failure signal
    if (extractedText.includes("[NO_CONTENT_FOUND]")) {
        extractedText = ""; // Clear it so UI handles it as empty
    }

    // Append grounding metadata if available (Mandatory per policy)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0 && extractedText.trim().length > 0) {
        const sources = groundingChunks
            .map(c => c.web?.uri)
            .filter(Boolean)
            .map(uri => `// Source: ${uri}`)
            .join('\n');
        
        if (sources) {
            extractedText += `\n\n// --- Grounding Sources ---\n${sources}`;
        }
    }

    return {
        text: extractedText,
        metadata: {
            source_type: 'web_scrape',
            source_url: url,
            retrieval_method: 'gemini-search-grounded',
            model: model,
            retrieved_at: new Date().toISOString()
        }
    };

  } catch (error: any) {
    console.error("Gemini Scraping Error:", error);
    throw new Error(`Failed to scrape URL: ${error.message || "Unknown error"}`);
  }
}

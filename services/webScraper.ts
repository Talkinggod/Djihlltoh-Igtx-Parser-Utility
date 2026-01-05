import { GoogleGenAI } from "@google/generative-ai";
import * as cheerio from "cheerio";

// Initialize Google Gemini AI

/**
 * Scrapes a URL using Google Gemini AI to extract and summarize content
 * @param url - The URL to scrape
 * @param apiKey - Optional API key for Google Gemini AI
 * @returns Promise with scraped content summary
 */
export async function scrapeUrlViaGemini(url: string, apiKey?: string): Promise<string> {
  if (!apiKey) {
    throw new Error("API key is required for web scraping");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    // Fetch the webpage content
    const response = await fetch(url);
    const html = await response.text();
    
    // Parse HTML with cheerio
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $("script, style").remove();
    
    // Extract text content
    const textContent = $("body").text().trim();
    
    // Use Gemini to summarize/extract key information
    const model = ai.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Please analyze and summarize the following webpage content:\n\n${textContent.substring(0, 10000)}`;
    
    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    return summary;
  } catch (error) {
    console.error("Error scraping URL:", error);
    throw new Error(`Failed to scrape URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}

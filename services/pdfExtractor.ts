
import { PdfTextDiagnostics } from '../types';

interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hasEOL: boolean;
}

interface PdfExtractionResult {
  text: string;
  diagnostics: PdfTextDiagnostics;
}

// Store the active worker to reuse if language hasn't changed
let currentWorker: any = null;
let currentWorkerLang: string = '';

// Helper to safely get or create the worker for a specific language
async function getOCRWorker(lang: string = 'eng') {
    if (currentWorker && currentWorkerLang === lang) {
        return currentWorker;
    }

    // Terminate existing worker if language is changing
    if (currentWorker) {
        await currentWorker.terminate();
        currentWorker = null;
    }

    try {
        // Dynamic import for Tesseract
        // @ts-ignore
        const Tesseract = await import('tesseract.js');
        const createWorker = Tesseract.createWorker || Tesseract.default?.createWorker;
        
        if (!createWorker) throw new Error("Tesseract createWorker not found");

        const worker = await createWorker(lang);
        // Set parameters for better structure preservation
        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        });
        
        currentWorker = worker;
        currentWorkerLang = lang;
        return worker;
    } catch (error: any) {
        console.error("Failed to load Tesseract:", error);
        if (error.message && (error.message.includes('Network error') || error.message.includes('Failed to fetch'))) {
             throw new Error("Network error downloading OCR language data. Check internet connection.");
        }
        throw new Error(`OCR Initialization Failed: ${error.message || "Unknown error"}`);
    }
}

/**
 * Extracts text from a PDF file and computes structural diagnostics.
 * Includes Heuristics for 2-Column Academic Papers and Scanned IGT.
 * @param file The PDF file
 * @param onProgress Callback for progress
 * @param langCode 3-letter OCR language code (e.g. 'eng', 'chi_sim', 'ara')
 * @param forceOcr If true, ignores text layer and forces visual scan
 */
export async function extractTextFromPdf(
  file: File, 
  onProgress?: (percent: number, status: string) => void,
  langCode: string = 'eng',
  forceOcr: boolean = false
): Promise<PdfExtractionResult> {
  let pdfDocument;
  let pdfjsLib: any;

  if (onProgress) onProgress(0, "Initializing PDF Engine...");

  try {
      // Dynamic import for PDF.js
      // @ts-ignore
      const pdfjsModule = await import('pdfjs-dist');
      pdfjsLib = pdfjsModule.default || pdfjsModule;

      if (!pdfjsLib) {
          throw new Error("PDF.js module failed to load");
      }

      // Configure Worker
      if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }
  } catch (e: any) {
      throw new Error(`ENGINE_LOAD_ERROR: Failed to load PDF engine: ${e.message}. Check your internet connection.`);
  }

  if (onProgress) onProgress(0, "Loading PDF document...");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
    });
    pdfDocument = await loadingTask.promise;
  } catch (error: any) {
    console.error("PDF Load Error:", error);
    if (error.name === 'PasswordException') {
      throw new Error("SECURE_PDF: The PDF is password protected.");
    } else if (error.name === 'InvalidPDFException') {
      throw new Error("CORRUPTED_PDF: The file header is invalid.");
    } else if (error.name === 'MissingPDFException') {
      throw new Error("EMPTY_PDF: The PDF file appears to be empty.");
    } else if (error.name === 'FormatError') {
      throw new Error("FORMAT_ERROR: Invalid PDF structure.");
    }
    throw new Error(`PDF_LOAD_ERROR: ${error.message || "Unknown error"}`);
  }
  
  const numPages = pdfDocument.numPages;
  let fullText = '';
  
  // Diagnostics Accumulators
  let totalLines = 0;
  let fragmentedLines = 0;
  let hyphenBreaks = 0;
  let totalCharLength = 0;
  let isOcrTriggered = forceOcr;

  try {
    for (let i = 1; i <= numPages; i++) {
      const currentProgress = Math.round(((i - 1) / numPages) * 100);
      if (onProgress) onProgress(currentProgress, `Analyzing page ${i} of ${numPages}...`);

      try {
        const page = await pdfDocument.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 }); // Use 1.0 for geometry calcs
        
        let shouldUseOcr = forceOcr;

        if (!shouldUseOcr) {
            const textContent = await page.getTextContent();
            const totalTextLength = textContent.items.reduce((acc: number, item: any) => acc + item.str.length, 0);
            // Heuristic: If page has very little text, assume it's an image scan
            if (textContent.items.length < 5 || totalTextLength < 50) {
                shouldUseOcr = true;
                isOcrTriggered = true;
            }
        }

        if (shouldUseOcr) {
          // --- OCR PATH (Scanned Documents / Forced) ---
          if (onProgress) onProgress(currentProgress, `OCR Scanning page ${i} of ${numPages} (${langCode})...`);

          // Critical: If getOCRWorker fails, we should abort the whole process, not just this page
          // as it likely means language data can't be loaded.
          let worker;
          try {
             worker = await getOCRWorker(langCode);
          } catch (e: any) {
             throw new Error(`OCR_ENGINE_ERROR: ${e.message}`);
          }

          // Render high-res for OCR
          const renderViewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = renderViewport.height;
          canvas.width = renderViewport.width;

          if (context) {
            await page.render({ canvasContext: context, viewport: renderViewport }).promise;
            
            try {
              if (onProgress) onProgress(currentProgress, `Recognizing structure on page ${i}...`);
              
              // Use detailed output (blocks/paragraphs) to preserve structure better
              const { data } = await worker.recognize(canvas);
              
              let pageOcrText = "";
              
              // Iterate blocks to preserve paragraphs/layout
              if (data && data.blocks) {
                  for (const block of data.blocks) {
                      if (block.confidence < 40) continue; // Skip garbage blocks
                      for (const para of block.paragraphs) {
                          for (const line of para.lines) {
                              const lineText = line.text.trim();
                              if (lineText) {
                                  pageOcrText += lineText + "\n";
                                  
                                  // Diagnostics
                                  totalLines++;
                                  totalCharLength += lineText.length;
                                  if (lineText.length < 20) fragmentedLines++;
                                  if (lineText.endsWith('-')) hyphenBreaks++;
                              }
                          }
                          pageOcrText += "\n"; // Paragraph break
                      }
                  }
              } else {
                  // Fallback
                  pageOcrText = data.text;
              }

              fullText += pageOcrText + '\n\n';
            } catch (ocrRunErr: any) {
              console.warn(`OCR failed for page ${i}`, ocrRunErr);
              fullText += `\n[SYSTEM WARNING: OCR extraction failed for Page ${i}.]\n\n`;
            }
          }
        } else {
          // --- TEXT EXTRACTION PATH (Digital PDFs) ---
          if (onProgress) onProgress(currentProgress, `Extracting text from page ${i}...`);
          
          const textContent = await page.getTextContent();
          
          // Map PDF items
          const items: TextItem[] = textContent.items.map((item: any) => {
            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            // Normalize Geometry
            const x = transform[4];
            const y = viewport.height - transform[5]; // Flip Y to top-down
            const fontSize = item.height || Math.abs(transform[3]) || Math.abs(transform[0]) || 10;
            return {
              str: item.str,
              x,
              y,
              w: item.width,
              h: fontSize,
              hasEOL: item.hasEOL
            };
          });

          // --- 2-Column Detection Logic ---
          // Identify if there is a "river" of whitespace in the center of the page
          const pageWidth = viewport.width;
          const leftBound = pageWidth * 0.4;
          const rightBound = pageWidth * 0.6;
          
          let centerItems = 0;
          items.forEach(item => {
              if (item.x > leftBound && item.x < rightBound) centerItems++;
          });

          // Threshold: if very few items are in the center 20% of the page, it's likely 2 columns
          const isTwoColumn = (items.length > 50) && (centerItems / items.length < 0.05);

          if (isTwoColumn) {
              // Sort by Column (Left then Right), then Y, then X
              const colThreshold = pageWidth * 0.5;
              items.sort((a, b) => {
                  const aCol = a.x < colThreshold ? 0 : 1;
                  const bCol = b.x < colThreshold ? 0 : 1;
                  
                  if (aCol !== bCol) return aCol - bCol; // Left column first
                  
                  // Within column, standard Y sorting
                  const yDiff = Math.abs(a.y - b.y);
                  const threshold = Math.max(a.h, b.h) * 0.5;
                  if (yDiff < threshold) return a.x - b.x; 
                  return a.y - b.y; 
              });
          } else {
              // Standard Layout Sorting (Top-down, Left-right)
              items.sort((a, b) => {
                const yDiff = Math.abs(a.y - b.y);
                const threshold = Math.max(a.h, b.h) * 0.5;
                if (yDiff < threshold) return a.x - b.x; 
                return a.y - b.y; 
              });
          }

          // --- Line Assembly ---
          let pageLines: string[] = [];
          let currentLineItems: TextItem[] = [];
          
          if (items.length > 0) {
            currentLineItems.push(items[0]);
            
            for (let j = 1; j < items.length; j++) {
              const prev = currentLineItems[currentLineItems.length - 1];
              const curr = items[j];
              
              const lineHeight = Math.max(prev.h, curr.h);
              
              // Check if on same line (Y-aligned)
              const verticalDist = Math.abs(curr.y - prev.y);
              
              if (verticalDist < lineHeight * 0.6) { 
                currentLineItems.push(curr);
              } else {
                // Flush line
                const lineStr = assembleLine(currentLineItems);
                // Filter out empty lines or purely numeric margin lines (common in pleadings)
                if (isValidLine(lineStr)) {
                    pageLines.push(lineStr);
                }
                
                // Update Diagnostics
                if (lineStr.trim().length > 0) {
                    totalLines++;
                    totalCharLength += lineStr.length;
                    if (lineStr.length < 15) fragmentedLines++;
                    if (lineStr.trim().endsWith('-')) hyphenBreaks++;
                }

                // Detect Semantic Paragraph Breaks
                const gapY = curr.y - prev.y; 
                if (gapY > lineHeight * 1.8) {
                    pageLines.push(''); 
                }
                currentLineItems = [curr];
              }
            }
            const finalLine = assembleLine(currentLineItems);
            if (isValidLine(finalLine)) pageLines.push(finalLine);
            if (finalLine.trim().length > 0) {
                totalLines++;
                totalCharLength += finalLine.length;
            }
          }

          fullText += pageLines.join('\n') + '\n\n';
        }

      } catch (pageError: any) {
        // Rethrow critical OCR errors to top level
        if (pageError.message && pageError.message.includes("OCR_ENGINE_ERROR")) {
            throw pageError;
        }
        
        console.error(`Error processing page ${i}:`, pageError);
        fullText += `\n[SYSTEM WARNING: Failed to process content on Page ${i}. ${pageError.message}]\n\n`;
      }

      if (onProgress) {
        onProgress(Math.round((i / numPages) * 100), `Finished page ${i} of ${numPages}`);
      }
    }
  } catch (error: any) {
    // If it's a known typed error from inner loops (OCR, PDF load), rethrow it
    // otherwise wrap it as critical
    if (error.message && (error.message.includes("OCR_ENGINE_ERROR") || error.message.includes("SECURE_PDF") || error.message.includes("CORRUPTED_PDF"))) {
        throw error;
    }
    
    console.error("PDF Parsing Critical Error:", error);
    fullText += `\n[SYSTEM ERROR: Critical failure during processing. ${error instanceof Error ? error.message : String(error)}]`;
  }
  
  const diagnostics: PdfTextDiagnostics = {
      totalLines,
      fragmentedLineRatio: totalLines > 0 ? fragmentedLines / totalLines : 0,
      avgLineLength: totalLines > 0 ? totalCharLength / totalLines : 0,
      hyphenBreakCount: hyphenBreaks,
      isOcr: isOcrTriggered
  };

  return { text: fullText, diagnostics };
}

/**
 * Filter out common legal pleading noise (line numbers 1-28 on left margin)
 */
function isValidLine(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;
    // Reject lines that are just numbers (margin counts)
    if (/^\d+$/.test(trimmed)) return false; 
    return true;
}

/**
 * Assembles a line from text items, inserting spaces for visual gaps.
 * Crucial for IGT where spacing matters.
 */
function assembleLine(items: TextItem[]): string {
  if (items.length === 0) return '';
  
  let lineStr = items[0].str;
  
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    
    // Geometry
    const prevEndX = prev.x + prev.w;
    const gap = curr.x - prevEndX;
    const fontSize = prev.h || 10;
    
    // Logic to insert spaces based on visual distance
    const spaceCharWidth = fontSize * 0.3; // Approx width of a space
    
    // If gap is significant, add spaces
    if (gap > spaceCharWidth * 0.5) {
        // If gap is very large (tabulation), add multiple spaces to preserve alignment
        if (gap > spaceCharWidth * 4) {
             lineStr += '    ';
        } else if (gap > spaceCharWidth * 2) {
             lineStr += '  ';
        } else if (!lineStr.endsWith(' ') && !curr.str.startsWith(' ')) {
             lineStr += ' ';
        }
    }
    
    lineStr += curr.str;
  }
  
  return lineStr.trim();
}


import * as pdfjsModule from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { PdfTextDiagnostics } from '../types';

// Handle potential ESM/CJS interop issues
const pdfjsLib = (pdfjsModule as any).default || pdfjsModule;

// Set the worker source
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

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

// --- Optimization: Singleton OCR Worker ---
// Tesseract worker (~20MB download + initialization) is heavy.
// We keep a single lazy-loaded instance alive to enable fast subsequent scans.
let ocrWorkerPromise: Promise<any> | null = null;

async function getOCRWorker() {
    if (!ocrWorkerPromise) {
        ocrWorkerPromise = (async () => {
            try {
                const worker = await createWorker('eng');
                return worker;
            } catch (error) {
                // If init fails, clear promise so we can retry next time
                ocrWorkerPromise = null;
                throw error;
            }
        })();
    }
    return ocrWorkerPromise;
}

/**
 * Extracts text from a PDF file and computes structural diagnostics.
 */
export async function extractTextFromPdf(
  file: File, 
  onProgress?: (percent: number, status: string) => void
): Promise<PdfExtractionResult> {
  let pdfDocument;

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
    let errorMessage = "Failed to load PDF file.";
    if (error.name === 'PasswordException') {
      errorMessage = "The PDF is password protected. Please unlock it and try again.";
    } else if (error.name === 'InvalidPDFException') {
      errorMessage = "The file appears to be a corrupted or invalid PDF.";
    } else if (error.name === 'MissingPDFException') {
      errorMessage = "The PDF file is missing or empty.";
    } else if (error.message) {
      errorMessage = `PDF Load Error: ${error.message}`;
    }
    throw new Error(errorMessage);
  }
  
  const numPages = pdfDocument.numPages;
  let fullText = '';
  
  // Diagnostics Accumulators
  let totalLines = 0;
  let fragmentedLines = 0;
  let hyphenBreaks = 0;
  let totalCharLength = 0;
  let isOcrTriggered = false;

  try {
    for (let i = 1; i <= numPages; i++) {
      const currentProgress = Math.round(((i - 1) / numPages) * 100);
      if (onProgress) onProgress(currentProgress, `Analyzing page ${i} of ${numPages}...`);

      try {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        
        const totalTextLength = textContent.items.reduce((acc: number, item: any) => acc + item.str.length, 0);
        const isScanned = textContent.items.length < 5 || totalTextLength < 20;

        if (isScanned) {
          // --- OCR PATH ---
          isOcrTriggered = true;
          if (onProgress) onProgress(currentProgress, `OCR Scanning page ${i} of ${numPages}...`);

          const worker = await getOCRWorker();

          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            try {
              if (onProgress) onProgress(currentProgress, `Recognizing text on page ${i}...`);
              const { data: { text } } = await worker.recognize(canvas);
              
              // Basic diagnostic update for OCR text block
              const ocrLines = text.split('\n');
              ocrLines.forEach((line: string) => {
                  const trimmed = line.trim();
                  if (trimmed) {
                      totalLines++;
                      totalCharLength += trimmed.length;
                      if (trimmed.length < 20) fragmentedLines++; // Higher threshold for OCR noise
                      if (trimmed.endsWith('-')) hyphenBreaks++;
                  }
              });

              fullText += text + '\n\n';
            } catch (ocrRunErr: any) {
              console.warn(`OCR failed for page ${i}`, ocrRunErr);
              fullText += `\n[SYSTEM WARNING: OCR extraction failed for Page ${i}.]\n\n`;
            }
          }
        } else {
          // --- TEXT EXTRACTION PATH ---
          if (onProgress) onProgress(currentProgress, `Extracting text from page ${i}...`);
          
          const items: TextItem[] = textContent.items.map((item: any) => {
            const transform = item.transform || [1, 0, 0, 1, 0, 0];
            const fontSize = item.height || Math.abs(transform[3]) || Math.abs(transform[0]) || 10;
            return {
              str: item.str,
              x: transform[4],
              y: transform[5],
              w: item.width,
              h: fontSize,
              hasEOL: item.hasEOL
            };
          });

          items.sort((a, b) => {
            const yDiff = Math.abs(a.y - b.y);
            const threshold = Math.max(a.h, b.h) * 0.5;
            if (yDiff < threshold) return a.x - b.x; 
            return b.y - a.y; 
          });

          let pageLines: string[] = [];
          let currentLineItems: TextItem[] = [];
          
          if (items.length > 0) {
            currentLineItems.push(items[0]);
            
            for (let j = 1; j < items.length; j++) {
              const prev = currentLineItems[currentLineItems.length - 1];
              const curr = items[j];
              
              const lineHeight = Math.max(prev.h, curr.h);
              const verticalDist = Math.abs(curr.y - prev.y);
              
              if (verticalDist < lineHeight * 0.5) { 
                currentLineItems.push(curr);
              } else {
                const lineStr = assembleLine(currentLineItems);
                pageLines.push(lineStr);
                
                // --- Update Diagnostics ---
                if (lineStr.trim().length > 0) {
                    totalLines++;
                    totalCharLength += lineStr.length;
                    // IGT lines are naturally short, but PDF fragmentation creates VERY short lines (fragments)
                    // We treat lines < 15 chars as potential fragments in standard layout context
                    if (lineStr.length < 15) fragmentedLines++;
                    if (lineStr.trim().endsWith('-')) hyphenBreaks++;
                }

                const gapY = prev.y - curr.y;
                if (gapY > lineHeight * 1.5) {
                    pageLines.push(''); 
                }
                currentLineItems = [curr];
              }
            }
            const finalLine = assembleLine(currentLineItems);
            pageLines.push(finalLine);
            if (finalLine.trim().length > 0) {
                totalLines++;
                totalCharLength += finalLine.length;
                if (finalLine.length < 15) fragmentedLines++;
                if (finalLine.trim().endsWith('-')) hyphenBreaks++;
            }
          }

          fullText += pageLines.join('\n') + '\n\n';
        }

      } catch (pageError: any) {
        console.error(`Error processing page ${i}:`, pageError);
        fullText += `\n[SYSTEM WARNING: Failed to process content on Page ${i}. ${pageError.message}]\n\n`;
      }

      if (onProgress) {
        onProgress(Math.round((i / numPages) * 100), `Finished page ${i} of ${numPages}`);
      }
    }
  } catch (error: any) {
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

function assembleLine(items: TextItem[]): string {
  if (items.length === 0) return '';
  
  let lineStr = items[0].str;
  
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    const prevEndX = prev.x + prev.w;
    const gap = curr.x - prevEndX;
    const fontSize = prev.h || 10;
    const spaceThreshold = fontSize * 0.15;
    const shouldAddSpace = gap > spaceThreshold;
    const hasSpace = lineStr.endsWith(' ') || curr.str.startsWith(' ');

    if (shouldAddSpace && !hasSpace) {
      lineStr += ' ';
    }
    lineStr += curr.str;
  }
  
  return lineStr.trim();
}

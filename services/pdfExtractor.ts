import * as pdfjsModule from 'pdfjs-dist';

// Handle potential ESM/CJS interop issues where exports might be on 'default'
// This fixes: "TypeError: Cannot set properties of undefined (setting 'workerSrc')"
const pdfjsLib = (pdfjsModule as any).default || pdfjsModule;

// Set the worker source to the same version as the library.
// Using the classic script (.js) from unpkg is often more reliable than .mjs from esm.sh
// for the worker in browser environments, as it avoids some cross-origin module loading restrictions
// and MIME type issues with importScripts.
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

/**
 * Extracts text from a PDF file.
 * Attempts to preserve line breaks by monitoring Y-coordinate changes,
 * which is crucial for Interlinear Glossed Text structure.
 */
export async function extractTextFromPdf(file: File, onProgress?: (percent: number) => void): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Use standard font loading and CMaps to prevent warnings/errors with some PDFs
  // and improve character extraction for linguistic papers
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
  });
  
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    let lastY = -1;
    let pageText = '';

    // Iterate through text items
    // Note: textContent.items contains objects with 'str' (text) and 'transform' (matrix including position)
    for (const item of textContent.items) {
      // @ts-ignore
      if ('str' in item && 'transform' in item) {
        // @ts-ignore
        const text = item.str;
        // @ts-ignore
        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, x, y]
        const y = transform ? transform[5] : 0;

        // Simple heuristic: If Y changes significantly (e.g. > 5 units), assume new line.
        // In PDFs, Y=0 is usually bottom-left, so Y decreases as we go down the page.
        // We look for any significant jump.
        if (lastY !== -1 && Math.abs(y - lastY) > 5) {
          pageText += '\n';
        } else if (lastY !== -1 && text.trim().length > 0) {
            // If same line, add space if needed to separate words
            // Avoid adding spaces around punctuation if possible, but space is safer for glosses
             if (!pageText.endsWith(' ') && !text.startsWith(' ')) {
                 pageText += ' ';
             }
        }
        
        pageText += text;
        lastY = y;
      }
    }
    
    // Append page text with a separator
    fullText += pageText + '\n\n';
    
    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100));
    }
  }

  return fullText;
}

import React, { useEffect, useState, useRef } from 'react';
import * as pdfjsModule from 'pdfjs-dist';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// Initialize PDF.js worker
const pdfjsLib = (pdfjsModule as any).default || pdfjsModule;
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
}

// Optimized CSS for text selection and alignment
const textLayerStyles = `
  .textLayer {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    line-height: 1.0;
    text-size-adjust: none;
    pointer-events: none;
  }
  .textLayer span {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    pointer-events: auto;
  }
  /* High contrast selection */
  .textLayer ::selection {
    background: rgba(59, 130, 246, 0.3);
    color: transparent;
  }
`;

interface PdfViewerProps {
  file: File;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ file }) => {
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1.2);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadPdf = async () => {
      setIsLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
        });
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Error loading PDF for viewer:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (file) {
      loadPdf();
    }
  }, [file]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Rendering PDF...</span>
      </div>
    );
  }

  if (!pdfDocument) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Unable to load PDF.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/20 relative">
      {/* Inject Styles */}
      <style>{textLayerStyles}</style>

      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-background z-10 sticky top-0 shadow-sm">
        <span className="text-xs font-mono text-muted-foreground px-2">
          {numPages} Pages
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8">
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Pages Container */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar" ref={containerRef}>
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: numPages }, (_, i) => (
            <PdfPage 
              key={i + 1} 
              pageNumber={i + 1} 
              pdf={pdfDocument} 
              scale={scale} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface PdfPageProps {
  pageNumber: number;
  pdf: any;
  scale: number;
}

const PdfPage: React.FC<PdfPageProps> = ({ pageNumber, pdf, scale }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);

  // --- Optimization: Intersection Observer (Lazy Loading) ---
  // Only render heavy canvas/text layers when the page is actually visible in the viewport.
  useEffect(() => {
      const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
              setIsVisible(true);
              // Once visible, we keep it rendered for better scroll UX (or we could unmount for strict memory usage)
              // For PDF reading, keeping visited pages is usually better, but for huge docs, we might want to unmount.
              // Here we stick to "render once visible".
              observer.disconnect();
          }
      }, { rootMargin: "200px" }); // Pre-load 200px before appearing

      if (wrapperRef.current) {
          observer.observe(wrapperRef.current);
      }
      return () => observer.disconnect();
  }, []);

  // Set initial dimensions placeholder to prevent layout jump
  useEffect(() => {
    // We can get viewport without rendering to set strict dimensions
    const getDims = async () => {
        try {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });
            setDimensions({ width: viewport.width, height: viewport.height });
        } catch(e) { /* ignore */ }
    };
    getDims();
  }, [pdf, pageNumber, scale]);

  // Actual Rendering Logic
  useEffect(() => {
    if (!isVisible || !dimensions.width) return;

    let active = true;
    let renderTask: any = null;
    let textLayerRenderTask: any = null;

    const renderPage = async () => {
      if (!canvasRef.current || !pdf) return;

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        // High DPI Support
        const outputScale = window.devicePixelRatio || 1;
        
        if (!active) return;

        // Render Canvas
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          
          const transform = outputScale !== 1 
            ? [outputScale, 0, 0, outputScale, 0, 0] 
            : null;

          const renderContext = {
            canvasContext: context,
            transform: transform,
            viewport: viewport
          };
          renderTask = page.render(renderContext);
          await renderTask.promise;
        }

        // Render Text Layer
        if (textLayerRef.current) {
          const textContent = await page.getTextContent();
          if (!active) return;
          
          const textLayerDiv = textLayerRef.current;
          textLayerDiv.innerHTML = ''; 
          textLayerDiv.style.setProperty('--scale-factor', `${scale}`);
          
          const renderTextLayer = 
            (pdfjsModule as any).renderTextLayer || 
            (pdfjsLib as any).renderTextLayer;

          if (typeof renderTextLayer === 'function') {
            textLayerRenderTask = renderTextLayer({
              textContentSource: textContent,
              container: textLayerDiv,
              viewport: viewport
            });
            await textLayerRenderTask.promise;
          }
        }

      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
            // silent fail for cancellations
        }
      }
    };

    renderPage();

    return () => { 
      active = false;
      if (renderTask) renderTask.cancel();
      if (textLayerRenderTask) textLayerRenderTask.cancel();
    };
  }, [pdf, pageNumber, scale, isVisible, dimensions.width]);

  return (
    <div 
      ref={wrapperRef}
      className="relative shadow-md bg-white mb-4 transition-all duration-200 ease-in-out"
      style={{ 
          width: dimensions.width || '100%', 
          height: dimensions.height || '800px', // Min-height placeholder
          backgroundColor: '#fff' 
      }} 
    >
      {isVisible && (
        <>
            <canvas 
                ref={canvasRef} 
                className="absolute inset-0 block pointer-events-none"
            />
            <div 
                ref={textLayerRef}
                className="textLayer absolute inset-0"
            />
        </>
      )}
      {!isVisible && (
         <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/20">
             <span className="text-4xl font-bold opacity-10">{pageNumber}</span>
         </div>
      )}
    </div>
  );
};

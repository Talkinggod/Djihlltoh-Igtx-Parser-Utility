
import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

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
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [pdfLib, setPdfLib] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const initPdfEngine = async () => {
      try {
        // Dynamic import
        // @ts-ignore
        const pdfjsModule = await import('pdfjs-dist');
        const lib = pdfjsModule.default || pdfjsModule;
        
        if (active) {
          if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) {
            lib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          }
          setPdfLib(lib);
        }
      } catch (e: any) {
        if (active) setError("Could not load PDF Engine: " + e.message);
      }
    };

    initPdfEngine();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!pdfLib || !file) return;

    const loadPdf = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
        });
        const pdf = await loadingTask.promise;
        setPdfDocument(pdf);
        setNumPages(pdf.numPages);
      } catch (err: any) {
        console.error("Error loading PDF for viewer:", err);
        setError(err.message || "Failed to load PDF");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [file, pdfLib]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  if (!pdfLib) {
     return (
       <div className="h-full flex items-center justify-center flex-col gap-2 text-muted-foreground">
         <Loader2 className="w-8 h-8 animate-spin" />
         <span className="text-sm">Initializing PDF Engine...</span>
       </div>
     );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-sm">Rendering PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2 text-destructive p-4 text-center">
        <AlertCircle className="w-8 h-8" />
        <span className="font-semibold">Unable to load PDF</span>
        <span className="text-xs text-muted-foreground">{error}</span>
      </div>
    );
  }

  if (!pdfDocument) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No PDF loaded.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-muted/20 relative">
      <style>{textLayerStyles}</style>

      <div className="flex items-center justify-between p-2 border-b bg-background z-10 sticky top-0 shadow-sm">
        <span className="text-xs font-mono text-muted-foreground px-2">
          {numPages} Pages
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} className="h-8 w-8" disabled={!pdfDocument}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} className="h-8 w-8" disabled={!pdfDocument}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar" ref={containerRef}>
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: numPages }, (_, i) => (
            <PdfPage 
              key={i + 1} 
              pageNumber={i + 1} 
              pdf={pdfDocument} 
              scale={scale} 
              pdfLib={pdfLib}
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
  pdfLib: any;
}

const PdfPage: React.FC<PdfPageProps> = ({ pageNumber, pdf, scale, pdfLib }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
      const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
              setIsVisible(true);
              observer.disconnect();
          }
      }, { rootMargin: "200px" });

      if (wrapperRef.current) {
          observer.observe(wrapperRef.current);
      }
      return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const getDims = async () => {
        try {
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale });
            setDimensions({ width: viewport.width, height: viewport.height });
        } catch(e) { /* ignore */ }
    };
    getDims();
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    if (!isVisible || !dimensions.width || !pdfLib) return;

    let active = true;
    let renderTask: any = null;
    let textLayerRenderTask: any = null;

    const renderPage = async () => {
      if (!canvasRef.current || !pdf) return;

      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        const outputScale = window.devicePixelRatio || 1;
        
        if (!active) return;

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

        if (textLayerRef.current) {
          const textContent = await page.getTextContent();
          if (!active) return;
          
          const textLayerDiv = textLayerRef.current;
          textLayerDiv.innerHTML = ''; 
          textLayerDiv.style.setProperty('--scale-factor', `${scale}`);
          
          const renderTextLayer = pdfLib.renderTextLayer;

          if (typeof renderTextLayer === 'function') {
            textLayerRenderTask = renderTextLayer({
              textContent: textContent,
              container: textLayerDiv,
              viewport: viewport
            });
            await textLayerRenderTask.promise;
          }
        }

      } catch (err: any) {
        const isCancelled = 
            err.name === 'RenderingCancelledException' || 
            err.message === 'Canceled' ||
            err.message?.includes('cancelled');

        if (!isCancelled) {
             console.error(`Page ${pageNumber} render error:`, err);
        }
      }
    };

    renderPage();

    return () => { 
      active = false;
      if (renderTask) {
        try {
            renderTask.cancel();
        } catch(e) { /* ignore */ }
      }
      if (textLayerRenderTask) {
        try {
             textLayerRenderTask.cancel();
        } catch(e) { /* ignore */ }
      }
    };
  }, [pdf, pageNumber, scale, isVisible, dimensions.width, pdfLib]);

  return (
    <div 
      ref={wrapperRef}
      className="relative shadow-md bg-white mb-4 transition-all duration-200 ease-in-out"
      style={{ 
          width: dimensions.width || '100%', 
          height: dimensions.height || '800px',
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

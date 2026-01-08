
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { OutputSection } from './components/OutputSection';
import { parseIGT } from './services/igtxParser';
import { ParseReport, LanguageProfile, IGTXSource, UILanguage, PdfTextDiagnostics, ParserDomain } from './types';
import { translations } from './services/translations';
import { GripVertical, GripHorizontal } from 'lucide-react';

function App() {
  const [input, setInput] = useState<string>('');
  const [report, setReport] = useState<ParseReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [domain, setDomain] = useState<ParserDomain>('linguistic');
  
  // Initialize profile based on domain
  const [profile, setProfile] = useState<LanguageProfile>('generic');
  
  const [lang, setLang] = useState<UILanguage>('en');
  
  // Initialize API Key with persistence strategy:
  const [apiKey, setApiKey] = useState<string>(() => {
    let envKey = '';
    try {
      // @ts-ignore
      if (typeof process !== 'undefined' && process && process.env) {
        // @ts-ignore
        envKey = process.env.API_KEY || '';
      }
    } catch (e) {}

    if (envKey) return envKey;

    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('gemini_api_key') || '';
    }
    return '';
  });

  // --- Split Pane Logic ---
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isResizing, setIsResizing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect mobile/desktop for split direction
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      let newRatio;

      if (isMobile) {
        // Vertical Split (Top/Bottom) calculation
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const offset = clientY - containerRect.top;
        newRatio = offset / containerRect.height;
      } else {
        // Horizontal Split (Left/Right) calculation
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const offset = clientX - containerRect.left;
        newRatio = offset / containerRect.width;
      }

      // Clamp ratio to avoid completely hiding panes
      setSplitRatio(Math.min(Math.max(newRatio, 0.2), 0.8));
    }
  }, [isResizing, isMobile]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize);
      window.addEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  // Persist API Key
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem('gemini_api_key', apiKey);
    } else {
      sessionStorage.removeItem('gemini_api_key');
    }
  }, [apiKey]);

  // Handle Domain Switch resets
  useEffect(() => {
    setReport(null);
    if (domain === 'legal') {
        setProfile('legal_pleading');
    } else {
        setProfile('generic');
    }
  }, [domain]);

  const handleProcess = (sourceMeta: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => {
    if (!input.trim()) return;
    setIsProcessing(true);
    
    // Simulate slight delay for "Processing" feel (UI feedback)
    setTimeout(() => {
      const result = parseIGT(input, profile, domain, sourceMeta, undefined, diagnostics);
      setReport(result);
      setIsProcessing(false);
    }, 400);
  };

  const handleClear = () => {
    setInput('');
    setReport(null);
  };

  const t = translations[lang];

  return (
    <div 
      className="h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-hidden"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <Header lang={lang} setLang={setLang} apiKey={apiKey} setApiKey={setApiKey} domain={domain} setDomain={setDomain} />
      
      <main 
        className="flex-1 w-full max-w-[1920px] mx-auto p-4 md:p-6 overflow-hidden flex flex-col"
      >
        <div 
            ref={containerRef}
            className={`flex-1 flex ${isMobile ? 'flex-col' : 'flex-row'} relative border border-border/40 rounded-lg overflow-hidden shadow-sm bg-muted/5`}
        >
            {/* Input Pane */}
            <div 
                style={{ 
                    flexBasis: `${splitRatio * 100}%`,
                    flexGrow: 0,
                    flexShrink: 0,
                    height: isMobile ? `${splitRatio * 100}%` : '100%',
                    width: isMobile ? '100%' : `${splitRatio * 100}%`
                }}
                className="overflow-hidden min-h-[200px] min-w-[200px]"
            >
                <div className="h-full w-full p-2">
                    <InputSection 
                        input={input} 
                        setInput={setInput} 
                        onProcess={handleProcess}
                        onClear={handleClear}
                        profile={profile}
                        setProfile={setProfile}
                        lang={lang}
                        apiKey={apiKey}
                        domain={domain}
                    />
                </div>
            </div>

            {/* Resizer Handle */}
            <div
                className={`
                    z-30 flex items-center justify-center bg-border/50 hover:bg-primary/50 transition-colors
                    ${isMobile 
                        ? 'h-3 w-full cursor-row-resize border-y border-background' 
                        : 'w-3 h-full cursor-col-resize border-x border-background'
                    }
                    ${isResizing ? 'bg-primary' : ''}
                `}
                onMouseDown={startResizing}
                onTouchStart={startResizing}
            >
                {isMobile 
                    ? <GripHorizontal className="w-4 h-4 text-muted-foreground" /> 
                    : <GripVertical className="w-4 h-4 text-muted-foreground" />
                }
            </div>

            {/* Output Pane */}
            <div 
                className="flex-1 overflow-hidden min-h-[200px] min-w-[200px] relative"
            >
                 <div className="h-full w-full p-2">
                    {isProcessing && (
                        <div className="absolute inset-2 bg-background/50 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-lg border border-primary/20">
                            <div className="flex flex-col items-center gap-4 bg-card p-6 rounded-xl border shadow-xl">
                                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                <span className="text-primary font-mono text-xs tracking-widest uppercase animate-pulse">{t.processing}</span>
                            </div>
                        </div>
                    )}
                    <OutputSection 
                        report={report} 
                        onUpdateReport={setReport}
                        lang={lang} 
                        apiKey={apiKey}
                        domain={domain}
                    />
                 </div>
            </div>
        </div>
      </main>

      <footer className="border-t bg-muted/10 py-3 shrink-0">
         <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-[10px] text-muted-foreground font-mono">
              &copy; 2025 Talkinggod AI / Talkinggod Labs.
              <span className="hidden md:inline mx-2">|</span>
              Division of Applied Ontologies (Níímą́ą́ʼ Bee Naalkaah)
            </p>
         </div>
      </footer>
    </div>
  );
}

export default App;

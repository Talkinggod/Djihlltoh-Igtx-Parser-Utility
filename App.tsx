
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { OutputSection } from './components/OutputSection';
import { parseIGT } from './services/igtxParser';
import { ParseReport, LanguageProfile, IGTXSource, UILanguage, PdfTextDiagnostics } from './types';
import { translations } from './services/translations';

function App() {
  const [input, setInput] = useState<string>('');
  const [report, setReport] = useState<ParseReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [profile, setProfile] = useState<LanguageProfile>('generic');
  const [lang, setLang] = useState<UILanguage>('en');
  
  // Initialize API Key with persistence strategy:
  // 1. Environment Variable (Local Dev / Configured Deployment)
  // 2. Session Storage (User entered in previous session tab)
  const [apiKey, setApiKey] = useState<string>(() => {
    let envKey = '';
    try {
      // Guard against ReferenceError in browser environments where 'process' is not defined
      // @ts-ignore
      if (typeof process !== 'undefined' && process && process.env) {
        // @ts-ignore
        envKey = process.env.API_KEY || '';
      }
    } catch (e) {
      // process is not defined, ignore
    }

    if (envKey) return envKey;

    if (typeof window !== 'undefined') {
        return sessionStorage.getItem('gemini_api_key') || '';
    }
    return '';
  });

  // Persist API Key to SessionStorage (Secure-ish: clears when tab is closed)
  useEffect(() => {
    if (apiKey) {
      sessionStorage.setItem('gemini_api_key', apiKey);
    } else {
      sessionStorage.removeItem('gemini_api_key');
    }
  }, [apiKey]);

  const handleProcess = (sourceMeta: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => {
    if (!input.trim()) return;
    setIsProcessing(true);
    
    // Simulate slight delay for "Processing" feel (UI feedback)
    setTimeout(() => {
      const result = parseIGT(input, profile, sourceMeta, undefined, diagnostics);
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
      className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <Header lang={lang} setLang={setLang} apiKey={apiKey} setApiKey={setApiKey} />
      
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-6 items-start justify-center">
        
        {/* Input Column */}
        <div className="w-full lg:flex-1 h-[500px] lg:h-[800px] min-h-[400px] resize-y overflow-hidden rounded-lg shadow-sm border border-transparent hover:border-border/50 transition-colors">
          <InputSection 
            input={input} 
            setInput={setInput} 
            onProcess={handleProcess}
            onClear={handleClear}
            profile={profile}
            setProfile={setProfile}
            lang={lang}
            apiKey={apiKey}
          />
        </div>

        {/* Output Column */}
        <div className="w-full lg:flex-1 h-[500px] lg:h-[800px] min-h-[400px] resize-y overflow-hidden rounded-lg shadow-sm border border-transparent hover:border-border/50 transition-colors relative">
          {isProcessing && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-lg border border-primary/20">
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
          />
        </div>

      </main>

      <footer className="border-t bg-muted/10 py-6 mt-auto">
         <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-xs text-muted-foreground font-mono">
              &copy; 2025 Talkinggod AI / Talkinggod Labs.
              <br className="md:hidden"/>
              <span className="hidden md:inline mx-2">|</span>
              Division of Applied Ontologies (Níímą́ą́ʼ Bee Naalkaah)
            </p>
         </div>
      </footer>
    </div>
  );
}

export default App;

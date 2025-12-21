import React, { useState } from 'react';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { OutputSection } from './components/OutputSection';
import { parseIGT } from './services/igtxParser';
import { ParseReport } from './types';

function App() {
  const [input, setInput] = useState<string>('');
  const [report, setReport] = useState<ParseReport | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcess = () => {
    if (!input.trim()) return;
    setIsProcessing(true);
    
    // Simulate slight delay for "Processing" feel (UI feedback)
    setTimeout(() => {
      const result = parseIGT(input);
      setReport(result);
      setIsProcessing(false);
    }, 400);
  };

  const handleClear = () => {
    setInput('');
    setReport(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-x-hidden">
      <Header />
      
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 flex flex-col lg:flex-row gap-6 items-start justify-center">
        
        {/* Input Column 
            - Resizable vertically
            - Responsive height (500px mobile, 800px desktop start)
            - Flex-1 to take available width
        */}
        <div className="w-full lg:flex-1 h-[500px] lg:h-[800px] min-h-[400px] resize-y overflow-hidden rounded-lg shadow-sm border border-transparent hover:border-border/50 transition-colors">
          <InputSection 
            input={input} 
            setInput={setInput} 
            onProcess={handleProcess}
            onClear={handleClear}
          />
        </div>

        {/* Output Column 
            - Resizable vertically
            - Responsive height
            - Relative positioning for overlay
        */}
        <div className="w-full lg:flex-1 h-[500px] lg:h-[800px] min-h-[400px] resize-y overflow-hidden rounded-lg shadow-sm border border-transparent hover:border-border/50 transition-colors relative">
          {isProcessing && (
            <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] z-20 flex items-center justify-center rounded-lg border border-primary/20">
              <div className="flex flex-col items-center gap-4 bg-card p-6 rounded-xl border shadow-xl">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-primary font-mono text-xs tracking-widest uppercase animate-pulse">Processing</span>
              </div>
            </div>
          )}
          <OutputSection report={report} />
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
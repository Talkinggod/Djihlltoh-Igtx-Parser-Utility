
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CaseSidebar } from './components/CaseSidebar';
import { CaseWorkspace } from './components/CaseWorkspace';
import { runIntegratedAnalysis } from './services/igtxParser';
import { IGTXSource, UILanguage, PdfTextDiagnostics, CaseState, CaseMetadata, GoogleUser } from './types';
import { cn } from './lib/utils';

function App() {
  const [lang, setLang] = useState<UILanguage>('en');
  const [googleUser, setGoogleUser] = useState<GoogleUser | undefined>(undefined);
  const [apiKey, setApiKey] = useState<string>(() => {
    let envKey = '';
    try {
      // @ts-ignore
      if (typeof process !== 'undefined' && process && process.env) envKey = process.env.API_KEY || '';
    } catch (e) {}
    return envKey || sessionStorage.getItem('gemini_api_key') || '';
  });

  const [cases, setCases] = useState<CaseState[]>([{
      id: 'phys-run-integrated',
      name: 'Integrated Kernel Run',
      domain: 'legal',
      caseMeta: { type: 'Civil', jurisdiction: 'Supreme Court', plaintiffs: [], defendants: [], indexNumber: '' },
      input: '',
      report: null,
      profile: 'generic',
      referenceDate: new Date(),
      lastActive: new Date(),
      isProcessing: false,
      documents: [],
      events: [],
      drafts: [],
      notes: [],
      exhibits: [],
      localSyncEnabled: false,
      λ_control: 0.45
  }]);

  const [activeCaseId, setActiveCaseId] = useState<string>(cases[0].id);
  const activeCase = cases.find(c => c.id === activeCaseId) || cases[0];

  const updateActiveCase = (updates: Partial<CaseState>) => {
      setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, ...updates, lastActive: new Date() } : c));
  };

  const handleProcess = async (sourceMeta: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => {
    if (!activeCase.input.trim()) return;
    updateActiveCase({ isProcessing: true });
    
    try {
        const result = await runIntegratedAnalysis(
            activeCase.input, 
            activeCase.profile, 
            activeCase.domain, 
            activeCase.λ_control,
            apiKey
        );
        updateActiveCase({ report: result, isProcessing: false });
    } catch (error) {
        console.error("Integrated Analysis Failed", error);
        updateActiveCase({ isProcessing: false });
    }
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-hidden">
      <Header 
        lang={lang} setLang={setLang} 
        apiKey={apiKey} setApiKey={setApiKey} 
        domain={activeCase.domain} setDomain={(d) => updateActiveCase({ domain: d })}
      />
      
      <main className="flex-1 w-full max-w-[1920px] mx-auto overflow-hidden flex flex-row">
        <div className="h-full bg-background border-r">
             <CaseSidebar 
                cases={cases}
                activeCaseId={activeCaseId}
                onSwitchCase={setActiveCaseId}
                onCreateCase={() => {}}
                onCloseCase={() => {}}
                isOpen={true}
                toggleSidebar={() => {}}
            />
        </div>
        
        <div className="flex-1 flex flex-col h-full min-w-0">
            <CaseWorkspace 
                caseData={activeCase}
                updateCase={updateActiveCase}
                onProcess={handleProcess}
                onClear={() => updateActiveCase({ input: '', report: null })}
                lang={lang}
                apiKey={apiKey}
                googleUser={googleUser}
            />
        </div>
      </main>
    </div>
  );
}

export default App;

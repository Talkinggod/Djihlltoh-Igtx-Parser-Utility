
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CaseSidebar } from './components/CaseSidebar';
import { CaseWorkspace } from './components/CaseWorkspace';
import { ChatBot } from './components/ChatBot';
import { runIntegratedAnalysis } from './services/igtxParser';
import { FileSystemService } from './services/fileSystemService';
import { IGTXSource, UILanguage, PdfTextDiagnostics, CaseState, CaseMetadata, GoogleUser, Draft } from './types';
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

  // Initialize cases from LocalStorage or Default
  const [cases, setCases] = useState<CaseState[]>(() => {
      try {
          const saved = localStorage.getItem('dziltoo_cases');
          if (saved) {
              const parsed = JSON.parse(saved);
              return parsed.map((c: any) => ({
                  ...c,
                  // Revive Dates
                  referenceDate: new Date(c.referenceDate),
                  lastActive: new Date(c.lastActive),
                  events: (c.events || []).map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })),
                  // Ensure arrays exist
                  documents: c.documents || [],
                  notes: c.notes || [],
                  drafts: c.drafts || [],
                  exhibits: c.exhibits || [],
                  claims: c.claims || [],
                  // Reset handles (not serializable)
                  directoryHandle: undefined 
              }));
          }
      } catch (e) {
          console.warn("Failed to load state from storage:", e);
      }
      
      // Default State if no storage
      return [{
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
      }];
  });

  const [activeCaseId, setActiveCaseId] = useState<string>(() => {
      // Try to restore last active case ID, or default to first case
      const savedId = localStorage.getItem('dziltoo_active_case_id');
      return savedId || cases[0]?.id || 'phys-run-integrated';
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const activeCase = cases.find(c => c.id === activeCaseId) || cases[0];

  // Persistence & Auto-Save Effect
  useEffect(() => {
      const timer = setTimeout(() => {
          // 1. Save to LocalStorage
          try {
              const serializableCases = cases.map(c => ({
                  ...c,
                  directoryHandle: undefined // Strip handle to avoid circular/serialization errors
              }));
              localStorage.setItem('dziltoo_cases', JSON.stringify(serializableCases));
              localStorage.setItem('dziltoo_active_case_id', activeCaseId);
          } catch (e) {
              console.error("Storage quota exceeded or error:", e);
          }

          // 2. Auto-Save to Local Device (if connected)
          const current = cases.find(c => c.id === activeCaseId);
          if (current && current.directoryHandle) {
              FileSystemService.syncCaseToLocal(current, current.directoryHandle)
                  .catch(err => console.error("Auto-save to local drive failed:", err));
          }
      }, 1000); // Debounce 1s

      return () => clearTimeout(timer);
  }, [cases, activeCaseId]);

  const updateActiveCase = (updates: Partial<CaseState>) => {
      setCases(prev => prev.map(c => c.id === activeCaseId ? { ...c, ...updates, lastActive: new Date() } : c));
  };

  const handleRenameCase = (id: string, newName: string) => {
      setCases(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
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

  // --- ChatBot Handlers ---
  
  // Updates current active draft (or creates one if none exists)
  const handleUpdateDraft = (content: string) => {
      let newDrafts = [...(activeCase.drafts || [])];
      let activeId = activeCase.activeDraftId;
      
      if (newDrafts.length === 0) {
          const newDraft: Draft = {
               id: Date.now().toString(),
               title: "Draft 1",
               content: content,
               createdAt: new Date().toISOString(),
               updatedAt: new Date().toISOString(),
               status: 'Draft'
          };
          newDrafts = [newDraft];
          activeId = newDraft.id;
      } else {
          // If no active draft is selected but drafts exist, default to first
          if (!activeId) activeId = newDrafts[0].id;
          
          newDrafts = newDrafts.map(d => 
              d.id === activeId ? { ...d, content: content, updatedAt: new Date().toISOString() } : d
          );
      }
      updateActiveCase({ drafts: newDrafts, activeDraftId: activeId });
  };

  // Creates a NEW separate draft
  const handleCreateDraft = (title: string, content: string) => {
      const newDraft: Draft = {
           id: Date.now().toString(),
           title: title,
           content: content,
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString(),
           status: 'Draft'
      };
      // Append new draft and set it as active
      updateActiveCase({ 
          drafts: [...(activeCase.drafts || []), newDraft],
          activeDraftId: newDraft.id 
      });
  };

  const handleUpdateCaseState = (updater: (prev: CaseState) => Partial<CaseState>) => {
      setCases(prevCases => prevCases.map(c => {
          if (c.id === activeCaseId) {
              const updates = updater(c);
              return { ...c, ...updates, lastActive: new Date() };
          }
          return c;
      }));
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-hidden">
      <Header 
        lang={lang} setLang={setLang} 
        apiKey={apiKey} setApiKey={setApiKey} 
        domain={activeCase.domain} setDomain={(d) => updateActiveCase({ domain: d })}
        // Cloud & Local Sync Props
        googleUser={googleUser}
        onGoogleSignIn={setGoogleUser}
        onGoogleSignOut={() => setGoogleUser(undefined)}
        isLocalSyncEnabled={!!activeCase.directoryHandle}
        folderName={activeCase.directoryHandle?.name}
      />
      
      <main className="flex-1 w-full max-w-[1920px] mx-auto overflow-hidden flex flex-row relative">
        <div className="h-full bg-background border-r">
             <CaseSidebar 
                cases={cases}
                activeCaseId={activeCaseId}
                onSwitchCase={setActiveCaseId}
                onCreateCase={() => {
                    const newCase: CaseState = {
                        id: Date.now().toString(),
                        name: "New Case",
                        domain: activeCase.domain,
                        input: "",
                        report: null,
                        profile: 'generic',
                        referenceDate: new Date(),
                        lastActive: new Date(),
                        isProcessing: false,
                        documents: [],
                        caseMeta: { type: 'Civil', jurisdiction: '', plaintiffs: [], defendants: [], indexNumber: '' },
                        events: [],
                        drafts: [],
                        notes: [],
                        exhibits: [],
                        localSyncEnabled: false,
                        λ_control: 0.45
                    };
                    setCases([...cases, newCase]);
                    setActiveCaseId(newCase.id);
                }}
                onCloseCase={(id) => {
                    const newCases = cases.filter(c => c.id !== id);
                    setCases(newCases);
                    if (activeCaseId === id) setActiveCaseId(newCases[0]?.id || "");
                }}
                onRenameCase={handleRenameCase}
                isOpen={isSidebarOpen}
                toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
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

        {/* Global ChatBot Overlay */}
        <ChatBot 
            apiKey={apiKey}
            domain={activeCase.domain}
            profile={activeCase.profile}
            context={activeCase.input || activeCase.report?.fullExtractedText}
            lang={lang}
            googleUser={googleUser}
            // Pass the analysis report for physics-aware assistance
            report={activeCase.report}
            
            // Interaction Handlers
            onUpdateEditor={(content) => updateActiveCase({ input: content })}
            onUpdateDraft={handleUpdateDraft}
            onCreateDraft={handleCreateDraft}
            onUpdateCaseState={handleUpdateCaseState}
            
            // Context
            caseContext={{
                id: activeCase.id,
                name: activeCase.name,
                docType: activeCase.docTypeId || 'unknown',
                events: activeCase.events,
                refDate: activeCase.referenceDate,
                claims: activeCase.claims // Pass claim intelligence here
            }}
            allDocuments={activeCase.documents.map(d => ({ name: d.name, content: d.content }))}
            templates={activeCase.templates}
            localSyncInfo={activeCase.directoryHandle ? { folderName: activeCase.directoryHandle.name, fileCount: 0 } : undefined}
        />
      </main>
    </div>
  );
}

export default App;

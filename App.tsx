import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CaseSidebar } from './components/CaseSidebar';
import { CaseWorkspace } from './components/CaseWorkspace';
import { CreateCaseDialog } from './components/CreateCaseDialog';
import { parseIGT } from './services/igtxParser';
import { IGTXSource, UILanguage, PdfTextDiagnostics, CaseState, CaseEvent, CaseMetadata } from './types';
import { DocumentTypeService } from './services/documentTypeService';
import { translations } from './services/translations';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { ChatBot } from './components/ChatBot';
import { Button } from './components/ui/button';
import { FileSystemService } from './services/fileSystemService';
import { cn } from './lib/utils';

const STORAGE_KEY = 'dziltoo_cases_v1';

function App() {
  const [lang, setLang] = useState<UILanguage>('en');
  
  // API Key
  const [apiKey, setApiKey] = useState<string>(() => {
    let envKey = '';
    try {
      // @ts-ignore
      if (typeof process !== 'undefined' && process && process.env) envKey = process.env.API_KEY || '';
    } catch (e) {}
    if (envKey) return envKey;
    if (typeof window !== 'undefined') return sessionStorage.getItem('gemini_api_key') || '';
    return '';
  });

  useEffect(() => {
    if (apiKey) sessionStorage.setItem('gemini_api_key', apiKey);
    else sessionStorage.removeItem('gemini_api_key');
  }, [apiKey]);

  // --- Case Management State ---
  const [cases, setCases] = useState<CaseState[]>(() => {
      // Try load from local storage
      if (typeof window !== 'undefined') {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) {
              try {
                  const parsed = JSON.parse(stored);
                  // Hydrate dates and reset non-serializable fields (handles)
                  return parsed.map((c: any) => ({
                      ...c,
                      referenceDate: new Date(c.referenceDate),
                      lastActive: new Date(c.lastActive),
                      events: c.events.map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })),
                      directoryHandle: undefined, // Cannot persist handles
                      localSyncEnabled: false     // Reset sync status on reload
                  }));
              } catch(e) { console.error("Failed to load cases", e); }
          }
      }

      // Default blank case
      return [{
          id: 'case-' + Date.now(),
          name: 'Untitled Case 1',
          domain: 'legal',
          caseMeta: { type: 'Civil', jurisdiction: '', plaintiffs: [], defendants: [], indexNumber: '' },
          input: '',
          report: null,
          profile: 'legal_pleading',
          docTypeId: '',
          referenceDate: new Date(),
          sourceMeta: { title: '', author: '', year: null, language: '', source_type: 'legacy_text' },
          events: [],
          lastActive: new Date(),
          isProcessing: false,
          documents: [],
          exhibits: [],
          notes: [],
          localSyncEnabled: false
      }];
  });

  const [activeCaseId, setActiveCaseId] = useState<string>(cases[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Persistence Effect
  useEffect(() => {
      // We strip out directoryHandle before saving to localStorage
      const serializableCases = cases.map(c => {
          const { directoryHandle, ...rest } = c;
          return rest;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableCases));
  }, [cases]);

  // Helper to access active case safely
  const activeCase = cases.find(c => c.id === activeCaseId) || cases[0];

  const handleCreateCase = (name: string, meta: CaseMetadata, initialDoc?: { name: string, content: string }) => {
      const newCase: CaseState = {
          id: 'case-' + Date.now(),
          name: name,
          domain: 'legal',
          caseMeta: meta,
          input: initialDoc ? initialDoc.content : '',
          report: null, // Will need to process
          profile: 'legal_pleading',
          docTypeId: '', // Could infer
          referenceDate: new Date(),
          sourceMeta: { title: initialDoc?.name || name, author: '', year: null, language: '', source_type: 'legacy_text' },
          events: [],
          lastActive: new Date(),
          isProcessing: false,
          documents: initialDoc ? [{
              id: Date.now().toString(),
              name: initialDoc.name,
              content: initialDoc.content,
              type: 'application/pdf', // Assumption
              side: 'neutral',
              dateAdded: new Date().toISOString()
          }] : [],
          exhibits: [],
          notes: [],
          localSyncEnabled: false
      };

      setCases(prev => [...prev, newCase]);
      setActiveCaseId(newCase.id);
  };

  const closeCase = (id: string) => {
      if (cases.length <= 1) return; // Prevent closing last case
      const newCases = cases.filter(c => c.id !== id);
      setCases(newCases);
      if (activeCaseId === id) {
          setActiveCaseId(newCases[newCases.length - 1].id);
      }
  };

  const updateActiveCase = (updates: Partial<CaseState>) => {
      setCases(prev => prev.map(c => {
          if (c.id === activeCaseId) {
              const updated = { ...c, ...updates, lastActive: new Date() };
              
              // If local sync is enabled, trigger a save in background (except if we are just setting the handle)
              if (updated.localSyncEnabled && updated.directoryHandle && !updates.directoryHandle) {
                  FileSystemService.syncCaseToLocal(updated, updated.directoryHandle)
                    .catch(err => console.error("Auto-sync failed:", err));
              }
              
              return updated;
          }
          return c;
      }));
  };

  // --- Local Folder Sync Handler ---
  const handleConnectLocalFolder = async () => {
      if (!FileSystemService.isSupported()) {
          alert("Your browser does not support Local File System access. Please use Chrome, Edge, or Opera.");
          return;
      }

      const dirHandle = await FileSystemService.selectDirectory();
      if (dirHandle) {
          // 1. Set Handle
          updateActiveCase({ 
              directoryHandle: dirHandle,
              localSyncEnabled: true
          });
          
          setImportStatus("Scanning folder for files...");

          // 2. Scan and Import Files Recursively
          try {
             const importedDocs = await FileSystemService.importFilesFromDirectory(
                 dirHandle, 
                 activeCase.documents,
                 (status) => setImportStatus(status)
             );
             
             if (importedDocs.length > 0) {
                 updateActiveCase({
                     documents: [...activeCase.documents, ...importedDocs]
                 });
                 alert(`Successfully connected to "${dirHandle.name}". Imported ${importedDocs.length} new files.`);
             } else {
                 alert(`Connected to "${dirHandle.name}". No new compatible files found.`);
             }

             // 3. Perform initial write-back sync
             const tempCase = { ...activeCase, directoryHandle: dirHandle, localSyncEnabled: true };
             await FileSystemService.syncCaseToLocal(tempCase, dirHandle);

          } catch(e) {
             console.error(e);
             alert("Failed to process folder contents. Check console for details.");
          } finally {
              setImportStatus(null);
          }
      }
  };

  // Switcher Handler
  const handleSwitchCase = (id: string) => {
      setActiveCaseId(id);
      setCases(prev => prev.map(c => c.id === id ? { ...c, lastActive: new Date() } : c));
  };

  // --- Temporal Logic & Event Engine ---
  const calculateCaseEvents = (currentCase: CaseState): CaseEvent[] => {
      const events: CaseEvent[] = [];
      const now = new Date();
      const refDate = currentCase.referenceDate;

      // 1. Doc Type Deadlines
      if (currentCase.domain === 'legal' && currentCase.docTypeId) {
          const def = DocumentTypeService.getById(currentCase.docTypeId);
          if (def) {
             def.deadlines.forEach((dl, idx) => {
                 const targetDate = new Date(refDate);
                 targetDate.setDate(refDate.getDate() + dl.duration);
                 const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                 
                 let type: CaseEvent['type'] = 'info';
                 if (daysUntil < 0) type = 'error'; 
                 else if (daysUntil <= 3) type = 'warning';

                 events.push({
                     id: `dl-${idx}-${now.getTime()}`,
                     type,
                     title: dl.isJurisdictional ? `CRITICAL: ${dl.label}` : dl.label,
                     message: `${dl.isJurisdictional ? 'Jurisdictional deadline' : 'Deadline'} approaching. Due: ${targetDate.toLocaleDateString()} (${daysUntil} days).`,
                     timestamp: now,
                     read: false
                 });
             });
          }
      }

      // 2. Parser Warnings
      if (currentCase.report) {
          const warnings = currentCase.report.blocks.flatMap(b => b.warnings).length;
          if (warnings > 5) {
              events.push({
                  id: `warn-${now.getTime()}`,
                  type: 'warning',
                  title: 'Low Confidence Parsing',
                  message: `Parser detected ${warnings} extraction warnings. Manual review recommended.`,
                  timestamp: now,
                  read: false
              });
          }
          if (currentCase.report.metadata.tier4Assessment?.requiresTier4) {
               events.push({
                  id: `t4-${now.getTime()}`,
                  type: 'info',
                  title: 'Tier 4 Detected',
                  message: currentCase.report.metadata.tier4Assessment.recommendedAction,
                  timestamp: now,
                  read: false
              });
          }
      }
      return events;
  };

  // Processing Handler
  const handleProcess = (sourceMeta: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => {
    if (!activeCase.input.trim()) return;
    updateActiveCase({ isProcessing: true, sourceMeta: { ...activeCase.sourceMeta, ...sourceMeta } });
    
    setTimeout(() => {
      const result = parseIGT(
          activeCase.input, 
          activeCase.profile, 
          activeCase.domain, 
          sourceMeta, 
          activeCase.name, 
          diagnostics
      );
      
      setCases(prev => prev.map(c => {
          if (c.id === activeCaseId) {
              const updated = { 
                  ...c, 
                  report: result, 
                  isProcessing: false,
                  pdfDiagnostics: diagnostics || c.pdfDiagnostics
              };
              updated.events = calculateCaseEvents(updated);
              
              // Trigger sync if enabled
              if(c.localSyncEnabled && c.directoryHandle) {
                  FileSystemService.syncCaseToLocal(updated, c.directoryHandle).catch(console.error);
              }
              
              return updated;
          }
          return c;
      }));
    }, 400);
  };

  const handleClear = () => {
    updateActiveCase({ input: '', report: null, events: [] });
  };

  return (
    <div 
      className="h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 selection:text-primary overflow-hidden"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <Header 
        lang={lang} 
        setLang={setLang} 
        apiKey={apiKey} 
        setApiKey={setApiKey} 
        domain={activeCase.domain} 
        setDomain={(d) => updateActiveCase({ domain: d, profile: d === 'legal' ? 'legal_pleading' : 'generic' })}
        // Local Folder Props
        isLocalSyncEnabled={activeCase.localSyncEnabled}
        onConnectLocalFolder={handleConnectLocalFolder}
        folderName={activeCase.directoryHandle?.name}
      />
      
      {importStatus && (
          <div className="bg-primary/10 text-primary text-xs text-center py-1 animate-pulse font-medium">
              {importStatus}
          </div>
      )}

      <main className="flex-1 w-full max-w-[1920px] mx-auto overflow-hidden flex flex-row relative">
        
        {/* Case Sidebar */}
        <div className={cn(
            "h-full transition-all duration-300 absolute z-20 md:static bg-background border-r shadow-xl md:shadow-none",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
            // On desktop, we control width via the sidebar component props, on mobile we overlay
        )}>
             <CaseSidebar 
                cases={cases}
                activeCaseId={activeCaseId}
                onSwitchCase={handleSwitchCase}
                onCreateCase={() => setIsCreateDialogOpen(true)}
                onCloseCase={closeCase}
                isOpen={isSidebarOpen}
                toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
        </div>
        
        {/* Sidebar Toggle Handle (Desktop) */}
        <div 
            className="hidden md:flex w-1 bg-border/20 hover:bg-primary/20 cursor-col-resize items-center justify-center relative group z-10" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
            <div className="absolute left-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" size="icon" className="h-6 w-6 rounded-l-none border-l-0 shadow-sm">
                   {isSidebarOpen ? <PanelLeftClose className="w-3 h-3" /> : <PanelLeftOpen className="w-3 h-3" />}
                </Button>
            </div>
        </div>

        {/* Mobile Sidebar Toggle Overlay (if open) */}
        {isSidebarOpen && (
             <div className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-10" onClick={() => setIsSidebarOpen(false)} />
        )}

        {/* Main Workspace (Tabs) */}
        <div className="flex-1 flex flex-col h-full min-w-0">
            {/* Case Header Info Bar */}
            <div className="border-b bg-muted/10 px-4 md:px-6 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                     {/* Mobile Menu Trigger */}
                     <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-2" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                         <PanelLeftOpen className="w-4 h-4" />
                     </Button>

                     <h2 className="text-sm font-bold truncate max-w-[200px] md:max-w-[300px]">{activeCase.name}</h2>
                     <div className="flex items-center gap-2 hidden sm:flex">
                         <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{activeCase.caseMeta.type}</span>
                         {activeCase.caseMeta.indexNumber && <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono">{activeCase.caseMeta.indexNumber}</span>}
                     </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {activeCase.localSyncEnabled && (
                        <span className="flex items-center gap-1 text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Synced to: {activeCase.directoryHandle?.name}
                        </span>
                    )}
                    <span className="hidden sm:inline">{activeCase.caseMeta.jurisdiction || "No jurisdiction"}</span>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <CaseWorkspace 
                    caseData={activeCase}
                    updateCase={updateActiveCase}
                    onProcess={handleProcess}
                    onClear={handleClear}
                    lang={lang}
                    apiKey={apiKey}
                />
            </div>
        </div>
      </main>

      <footer className="border-t bg-muted/10 py-2 shrink-0">
         <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-[10px] text-muted-foreground font-mono">
              &copy; 2025 Talkinggod AI / Talkinggod Labs.
              <span className="hidden md:inline mx-2">|</span>
              Division of Applied Ontologies (Níímą́ą́ʼ Bee Naalkaah)
            </p>
         </div>
      </footer>
      
      <CreateCaseDialog 
         isOpen={isCreateDialogOpen}
         onClose={() => setIsCreateDialogOpen(false)}
         onCreate={handleCreateCase}
      />

      {/* AI Chatbot Overlay */}
      <ChatBot 
        apiKey={apiKey} 
        domain={activeCase.domain} 
        profile={activeCase.profile} 
        context={activeCase.report?.fullExtractedText || activeCase.input} 
        onUpdateEditor={(val) => updateActiveCase({ input: val })}
        caseContext={{
            id: activeCase.id,
            name: activeCase.name,
            docType: activeCase.docTypeId,
            events: activeCase.events,
            refDate: activeCase.referenceDate
        }}
        // Pass sync info to chatbot so it knows about the local folder
        localSyncInfo={activeCase.localSyncEnabled ? { 
            folderName: activeCase.directoryHandle?.name,
            fileCount: activeCase.documents.length + activeCase.notes.length
        } : undefined}
      />
    </div>
  );
}

export default App;
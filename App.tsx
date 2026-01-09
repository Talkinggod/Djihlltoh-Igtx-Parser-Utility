
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CaseSidebar } from './components/CaseSidebar';
import { CaseWorkspace } from './components/CaseWorkspace';
import { CreateCaseDialog } from './components/CreateCaseDialog';
import { FileExplorerModal } from './components/FileExplorerModal';
import { parseIGT } from './services/igtxParser';
import { IGTXSource, UILanguage, PdfTextDiagnostics, CaseState, CaseEvent, CaseMetadata, GoogleUser, ExplorerItem, StoredDocument } from './types';
import { DocumentTypeService } from './services/documentTypeService';
import { translations } from './services/translations';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { ChatBot } from './components/ChatBot';
import { Button } from './components/ui/button';
import { FileSystemService } from './services/fileSystemService';
import { extractTextFromPdf } from './services/pdfExtractor';
import { GoogleDriveService } from './services/googleDriveService';
import { cn } from './lib/utils';

const STORAGE_KEY = 'dziltoo_cases_v1';

function App() {
  const [lang, setLang] = useState<UILanguage>('en');
  const [googleUser, setGoogleUser] = useState<GoogleUser | undefined>(undefined);
  const [isIframe, setIsIframe] = useState(false);
  
  // File Explorer State
  const [explorerState, setExplorerState] = useState<{
      isOpen: boolean;
      mode: 'local' | 'google';
  }>({ isOpen: false, mode: 'local' });

  // Detect Iframe Environment
  useEffect(() => {
      try {
          if (window.self !== window.top) {
              setIsIframe(true);
          }
      } catch (e) {
          setIsIframe(true); // Security error usually means cross-origin iframe
      }
  }, []);

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
          templates: [],
          drafts: [],
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
          templates: [],
          drafts: [],
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

  // NEW: Flexible updater for ChatBot functional updates
  const updateActiveCaseFunctional = (updater: (prev: CaseState) => Partial<CaseState>) => {
      setCases(prev => prev.map(c => {
          if (c.id === activeCaseId) {
              const updates = updater(c);
              return { ...c, ...updates, lastActive: new Date() };
          }
          return c;
      }));
  };

  // --- Local Folder Sync Handler ---
  // ... [Existing implementation omitted for brevity] ...
  const handleConnectLocalFolder = async () => {
      // ... same as before
      if (!FileSystemService.isSupported()) {
          alert("Your browser does not support Local File System access. Please use Chrome, Edge, or Opera.");
          return;
      }
      const dirHandle = await FileSystemService.selectDirectory();
      if (dirHandle) {
          setImportStatus("Scanning folder...");
          try {
             const importedDocs = await FileSystemService.importFilesFromDirectory(dirHandle, activeCase.documents);
             const mergedDocuments = [...activeCase.documents, ...importedDocs];
             updateActiveCase({ directoryHandle: dirHandle, localSyncEnabled: true, documents: mergedDocuments });
             const tempCase = { ...activeCase, directoryHandle: dirHandle, localSyncEnabled: true, documents: mergedDocuments };
             await FileSystemService.syncCaseToLocal(tempCase, dirHandle);
             setExplorerState({ isOpen: true, mode: 'local' });
          } catch(e) { console.error(e); } finally { setImportStatus(null); }
      }
  };
  
  const handleGoogleSignIn = (user: GoogleUser) => {
      setGoogleUser(user);
      setExplorerState({ isOpen: true, mode: 'google' });
  };

  // --- Google Drive Sync Handler (Select Folder) ---
  const handleConnectGoogleFolder = async () => {
      if (!googleUser || !apiKey) {
          alert("Please sign in with Google and ensure your API Key is set.");
          return;
      }
      try {
          const folder = await GoogleDriveService.pickFolder(googleUser.accessToken, apiKey);
          updateActiveCase({ 
              googleFolderId: folder.id,
              googleFolderName: folder.name 
          });
          alert(`Linked case to Google Drive folder: ${folder.name}`);
      } catch (e: any) {
          if (e !== "Picker cancelled") {
              console.error(e);
              alert("Failed to select Google Drive folder.");
          }
      }
  };

  // --- Import from Explorer (Local & Google) ---
  const handleExplorerImport = async (item: ExplorerItem) => {
      try {
          let content = "";
          let type = "text/plain";
          
          if (explorerState.mode === 'local' && item.handle) {
              // @ts-ignore
              const file = await item.handle.getFile();
              type = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain');
              if (type.includes('pdf')) {
                  const res = await extractTextFromPdf(file);
                  content = res.text;
              } else {
                  content = await file.text();
              }
          } else if (explorerState.mode === 'google' && googleUser) {
              content = await GoogleDriveService.downloadFile(item.id, item.mimeType || 'text/plain', googleUser.accessToken);
              type = item.mimeType || 'text/plain';
          } else {
              throw new Error("Invalid import source");
          }

          const newDoc: StoredDocument = {
              id: Date.now().toString(),
              name: item.name,
              type: type,
              content: content,
              side: 'neutral',
              dateAdded: new Date().toISOString()
          };

          updateActiveCase({ documents: [...activeCase.documents, newDoc] });
          setExplorerState({ ...explorerState, isOpen: false });
          alert(`Imported ${item.name}`);

      } catch (e: any) {
          console.error("Import failed", e);
          alert("Import failed: " + e.message);
      }
  };

  const handleSwitchCase = (id: string) => {
      setActiveCaseId(id);
      setCases(prev => prev.map(c => c.id === id ? { ...c, lastActive: new Date() } : c));
  };

  const calculateCaseEvents = (currentCase: CaseState): CaseEvent[] => {
      // ... same as before
      return []; 
  };

  const handleProcess = (sourceMeta: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => {
    if (!activeCase.input.trim()) return;
    updateActiveCase({ isProcessing: true, sourceMeta: { ...activeCase.sourceMeta, ...sourceMeta } });
    setTimeout(() => {
      const result = parseIGT(activeCase.input, activeCase.profile, activeCase.domain, sourceMeta, activeCase.name, diagnostics);
      setCases(prev => prev.map(c => {
          if (c.id === activeCaseId) {
              const updated = { ...c, report: result, isProcessing: false, pdfDiagnostics: diagnostics || c.pdfDiagnostics };
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
        isLocalSyncEnabled={activeCase.localSyncEnabled}
        onConnectLocalFolder={handleConnectLocalFolder}
        onOpenLocalExplorer={() => setExplorerState({ isOpen: true, mode: 'local' })}
        folderName={activeCase.directoryHandle?.name}
        isIframe={isIframe}
        googleUser={googleUser}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={() => setGoogleUser(undefined)}
        onOpenGoogleExplorer={() => setExplorerState({ isOpen: true, mode: 'google' })}
      />
      
      {importStatus && (
          <div className="bg-primary/10 text-primary text-xs text-center py-1 animate-pulse font-medium">
              {importStatus}
          </div>
      )}

      <main className="flex-1 w-full max-w-[1920px] mx-auto overflow-hidden flex flex-row relative">
        <div className={cn(
            "h-full transition-all duration-300 absolute z-20 md:static bg-background border-r shadow-xl md:shadow-none",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}>
             <CaseSidebar 
                cases={cases}
                activeCaseId={activeCaseId}
                onSwitchCase={handleSwitchCase}
                onCreateCase={() => setIsCreateDialogOpen(true)}
                onCloseCase={closeCase}
                isOpen={isSidebarOpen}
                toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                onConnectCloud={googleUser ? handleConnectGoogleFolder : undefined}
            />
        </div>
        
        <div className="hidden md:flex w-1 bg-border/20 hover:bg-primary/20 cursor-col-resize items-center justify-center relative group z-10" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <div className="absolute left-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="outline" size="icon" className="h-6 w-6 rounded-l-none border-l-0 shadow-sm">
                   {isSidebarOpen ? <PanelLeftClose className="w-3 h-3" /> : <PanelLeftOpen className="w-3 h-3" />}
                </Button>
            </div>
        </div>

        {isSidebarOpen && <div className="md:hidden fixed inset-0 bg-background/80 backdrop-blur-sm z-10" onClick={() => setIsSidebarOpen(false)} />}

        <div className="flex-1 flex flex-col h-full min-w-0">
            <div className="border-b bg-muted/10 px-4 md:px-6 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
                     <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 -ml-2" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                         <PanelLeftOpen className="w-4 h-4" />
                     </Button>
                     <h2 className="text-sm font-bold truncate max-w-[200px] md:max-w-[300px]">{activeCase.name}</h2>
                     <div className="flex items-center gap-2 hidden sm:flex">
                         <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">{activeCase.caseMeta.type}</span>
                     </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {activeCase.googleFolderId && <span className="flex items-center gap-1 text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Synced to Cloud: {activeCase.googleFolderName}</span>}
                    {activeCase.localSyncEnabled && <span className="flex items-center gap-1 text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Synced to Local: {activeCase.directoryHandle?.name}</span>}
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
                    googleUser={googleUser}
                />
            </div>
        </div>
      </main>

      <footer className="border-t bg-muted/10 py-2 shrink-0">
         <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-[10px] text-muted-foreground font-mono">
              &copy; 2025 Talkinggod AI / Talkinggod Labs.
            </p>
         </div>
      </footer>
      
      <CreateCaseDialog isOpen={isCreateDialogOpen} onClose={() => setIsCreateDialogOpen(false)} onCreate={handleCreateCase} />
      <FileExplorerModal isOpen={explorerState.isOpen} onClose={() => setExplorerState({...explorerState, isOpen: false})} mode={explorerState.mode} rootHandle={activeCase.directoryHandle} accessToken={googleUser?.accessToken} onImport={handleExplorerImport} />

      {/* AI Chatbot Overlay */}
      <ChatBot 
        apiKey={apiKey} 
        domain={activeCase.domain} 
        profile={activeCase.profile} 
        context={activeCase.report?.fullExtractedText || activeCase.input} 
        onUpdateEditor={(val) => updateActiveCase({ input: val })}
        onUpdateDraft={(val) => {
            const currentDraft = activeCase.drafts.find(d => d.id === activeCase.activeDraftId) || activeCase.drafts[0];
            if(currentDraft) {
                const updatedDrafts = activeCase.drafts.map(d => d.id === currentDraft.id ? {...d, content: val, updatedAt: new Date().toISOString()} : d);
                updateActiveCase({ drafts: updatedDrafts });
            }
        }}
        onUpdateCaseState={updateActiveCaseFunctional} // NEW: Pass functional updater
        caseContext={{ id: activeCase.id, name: activeCase.name, docType: activeCase.docTypeId, events: activeCase.events, refDate: activeCase.referenceDate }}
        allDocuments={activeCase.documents.map(d => ({name: d.name, content: d.content}))}
        templates={activeCase.templates}
        localSyncInfo={activeCase.localSyncEnabled ? { folderName: activeCase.directoryHandle?.name, fileCount: activeCase.documents.length + activeCase.notes.length } : undefined}
        lang={lang}
        googleUser={googleUser}
      />
    </div>
  );
}

export default App;

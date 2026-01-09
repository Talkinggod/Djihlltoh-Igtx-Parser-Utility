
import React, { useState, useEffect } from 'react';
import { CaseState, Note, StoredDocument, Template, Draft, GoogleUser } from '../types';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { InputSection } from './InputSection';
import { OutputSection } from './OutputSection';
import { ResourceExplorer, ResourceItem } from './ResourceExplorer';
import { FileText, Files, StickyNote, Image, Trash2, Plus, Search, Calendar, Scale, Clock, PenTool, LayoutTemplate, Save, FilePlus, Database } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { GoogleDriveService } from '../services/googleDriveService';
import { ResizableSplitView } from './ui/ResizableSplitView';

interface CaseWorkspaceProps {
    caseData: CaseState;
    updateCase: (updates: Partial<CaseState>) => void;
    // Props for Analysis View
    onProcess: any;
    onClear: any;
    lang: any;
    apiKey: string;
    googleUser?: GoogleUser;
}

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({ 
    caseData, updateCase, onProcess, onClear, lang, apiKey, googleUser 
}) => {
    const [activeTab, setActiveTab] = useState("analysis");
    const [docFilter, setDocFilter] = useState<string>('all');
    const [newNote, setNewNote] = useState("");
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const templateInputRef = React.useRef<HTMLInputElement>(null);

    // Initialize Active Draft if none
    useEffect(() => {
        if (!caseData.activeDraftId && caseData.drafts && caseData.drafts.length > 0) {
            updateCase({ activeDraftId: caseData.drafts[0].id });
        } else if (!caseData.drafts || caseData.drafts.length === 0) {
             // Create initial blank draft
             const newDraft: Draft = {
                 id: Date.now().toString(),
                 title: "Draft 1",
                 content: "",
                 createdAt: new Date().toISOString(),
                 updatedAt: new Date().toISOString(),
                 status: 'Draft'
             };
             updateCase({ drafts: [newDraft], activeDraftId: newDraft.id });
        }
    }, [caseData.drafts]);

    const activeDraft = caseData.drafts?.find(d => d.id === caseData.activeDraftId) || caseData.drafts?.[0];

    // --- Document Logic ---
    const handleAddDocument = async (file: File) => {
        let content = "";
        if (file.type === 'application/pdf') {
            const res = await extractTextFromPdf(file);
            content = res.text;
        } else {
            content = await file.text();
        }

        const newDoc: StoredDocument = {
            id: Date.now().toString(),
            name: file.name,
            type: file.type,
            content: content,
            side: 'neutral',
            dateAdded: new Date().toISOString()
        };

        updateCase({
            documents: [...caseData.documents, newDoc]
        });
    };

    const handleDriveDocumentImport = async () => {
        if (!googleUser) return;
        try {
            const file = await GoogleDriveService.openPicker(googleUser.accessToken, apiKey);
            const content = await GoogleDriveService.downloadFile(file.id, file.mimeType, googleUser.accessToken);
            
            const newDoc: StoredDocument = {
                id: file.id,
                name: file.name,
                type: file.mimeType,
                content: content,
                side: 'neutral',
                dateAdded: new Date().toISOString()
            };
            
            updateCase({ documents: [...caseData.documents, newDoc] });
        } catch(e) {
            if (typeof e === 'string' && e.includes("Picker cancelled")) return;
            alert("Drive import failed: " + e);
        }
    };
    
    const loadDocumentToAnalysis = (doc: StoredDocument) => {
        updateCase({ 
            input: doc.content,
            sourceMeta: { 
                ...caseData.sourceMeta, 
                title: doc.name, 
                source_type: doc.type.includes('pdf') ? 'pdf' : 'legacy_text' 
            }
        });
        setActiveTab('analysis');
    };

    // --- Template Logic ---
    const handleAddTemplate = async (file: File) => {
         const content = await file.text();
         const newTemplate: Template = {
             id: Date.now().toString(),
             name: file.name.replace(/\.[^/.]+$/, ""),
             content: content,
             category: 'Other'
         };
         updateCase({ templates: [...(caseData.templates || []), newTemplate] });
    };

    const handleDriveTemplateImport = async () => {
        if (!googleUser) return;
        try {
            const file = await GoogleDriveService.openPicker(googleUser.accessToken, apiKey);
            const content = await GoogleDriveService.downloadFile(file.id, file.mimeType, googleUser.accessToken);
            
            const newTemplate: Template = {
                id: file.id,
                name: file.name,
                content: content,
                category: 'Other'
            };
            
            updateCase({ templates: [...(caseData.templates || []), newTemplate] });
        } catch(e) {
            if (typeof e === 'string' && e.includes("Picker cancelled")) return;
            alert("Drive template import failed: " + e);
        }
    };

    const loadTemplateToDraft = (template: Template) => {
        if (!activeDraft) return;
        const updatedDrafts = caseData.drafts.map(d => 
            d.id === activeDraft.id ? { ...d, content: template.content, updatedAt: new Date().toISOString() } : d
        );
        updateCase({ drafts: updatedDrafts });
    };

    // --- Notes Logic ---
    const handleAddNote = () => {
        const note: Note = {
            id: Date.now().toString(),
            title: `New Note ${caseData.notes.length + 1}`,
            content: "Double click to edit...",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: []
        };
        updateCase({
            notes: [note, ...caseData.notes]
        });
    };

    const deleteNote = (id: string) => {
        updateCase({ notes: caseData.notes.filter(n => n.id !== id) });
    };

    const deleteDocument = (id: string) => {
        updateCase({ documents: caseData.documents.filter(d => d.id !== id) });
    };

    // --- Resource Mappers ---

    const documentResources: ResourceItem[] = caseData.documents
        .filter(d => docFilter === 'all' || d.side === docFilter)
        .map(doc => ({
            id: doc.id,
            title: doc.name,
            subtitle: doc.side,
            date: doc.dateAdded,
            type: doc.type.includes('pdf') ? 'pdf' : 'text',
            content: doc.content,
            tags: [doc.type.split('/')[1] || 'doc'],
            onAction: () => loadDocumentToAnalysis(doc),
            actionLabel: "Analyze",
            onDelete: () => deleteDocument(doc.id)
        }));
    
    const noteResources: ResourceItem[] = caseData.notes.map(note => ({
        id: note.id,
        title: note.title,
        date: note.updatedAt,
        type: 'note',
        content: note.content,
        tags: ['note'],
        onAction: () => alert("Note editing in explorer coming soon. Use Drafts."),
        actionLabel: "Edit",
        onDelete: () => deleteNote(note.id)
    }));

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Case Workspace Navigation */}
            <div className="border-b bg-background px-4 py-2 flex items-center gap-4 shrink-0 overflow-x-auto custom-scrollbar">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-muted/40 h-10 w-full justify-start gap-4 px-2">
                        <TabsTrigger value="analysis" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Scale className="w-4 h-4" /> <span className="hidden sm:inline">Analysis</span>
                        </TabsTrigger>
                        <TabsTrigger value="drafting" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <PenTool className="w-4 h-4" /> <span className="hidden sm:inline">Drafting</span>
                        </TabsTrigger>
                        <TabsTrigger value="documents" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Files className="w-4 h-4" /> <span className="hidden sm:inline">Documents</span>
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.documents.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="exhibits" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Image className="w-4 h-4" /> <span className="hidden sm:inline">Exhibits</span>
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.exhibits.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <StickyNote className="w-4 h-4" /> <span className="hidden sm:inline">Notes</span>
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.notes.length}</Badge>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex-1 overflow-hidden relative">
                
                {/* 1. ANALYSIS TAB (Resizable Split View) */}
                {activeTab === 'analysis' && (
                    <div className="h-full w-full animate-in fade-in zoom-in-95 duration-200">
                        <ResizableSplitView
                            left={
                                <div className="h-full flex flex-col p-2 md:p-4 gap-2">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2 px-1">
                                        <FileText className="w-3 h-3" /> Active Document
                                    </h3>
                                    <div className="flex-1 min-h-0 border rounded-lg overflow-hidden shadow-sm bg-card">
                                        <InputSection 
                                            input={caseData.input} 
                                            setInput={(val) => updateCase({ input: val })} 
                                            onProcess={onProcess}
                                            onClear={onClear}
                                            profile={caseData.profile}
                                            setProfile={(p) => updateCase({ profile: p })}
                                            lang={lang}
                                            apiKey={apiKey}
                                            domain={caseData.domain}
                                            docTypeId={caseData.docTypeId}
                                            setDocTypeId={(id) => updateCase({ docTypeId: id })}
                                            refDate={caseData.referenceDate}
                                            setRefDate={(d) => updateCase({ referenceDate: d })}
                                            googleUser={googleUser}
                                        />
                                    </div>
                                </div>
                            }
                            right={
                                <div className="h-full flex flex-col p-2 md:p-4 gap-2">
                                    <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2 px-1">
                                        <Scale className="w-3 h-3" /> Legal Extraction
                                    </h3>
                                    <div className="flex-1 min-h-0 border rounded-lg overflow-hidden shadow-sm bg-card">
                                        <OutputSection 
                                            report={caseData.report} 
                                            onUpdateReport={(r) => updateCase({ report: r })}
                                            lang={lang} 
                                            apiKey={apiKey}
                                            domain={caseData.domain}
                                        />
                                    </div>
                                </div>
                            }
                        />
                    </div>
                )}

                {/* 2. DRAFTING TAB */}
                {activeTab === 'drafting' && (
                    <div className="h-full w-full animate-in fade-in zoom-in-95 duration-200">
                        <ResizableSplitView
                            initialLeftWidth={30}
                            left={
                                <div className="h-full flex flex-col p-4 bg-muted/10 border-r">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-semibold flex items-center gap-2">
                                            <LayoutTemplate className="w-4 h-4" /> Templates
                                        </h3>
                                        <div className="flex gap-1">
                                            {googleUser && (
                                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={handleDriveTemplateImport} title="Import from Drive">
                                                    <Database className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                            <Button size="sm" variant="outline" onClick={() => templateInputRef.current?.click()} className="h-8 gap-1">
                                                <Plus className="w-3 h-3" /> Import
                                            </Button>
                                        </div>
                                        <input 
                                            type="file" 
                                            ref={templateInputRef} 
                                            className="hidden" 
                                            accept=".txt,.md" 
                                            onChange={(e) => e.target.files?.[0] && handleAddTemplate(e.target.files[0])} 
                                        />
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                                        {(caseData.templates || []).length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-4">No templates.</p>
                                        )}
                                        {(caseData.templates || []).map(tmpl => (
                                            <div key={tmpl.id} className="p-3 bg-card border rounded-md hover:border-primary cursor-pointer group" onClick={() => loadTemplateToDraft(tmpl)}>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-semibold">{tmpl.name}</span>
                                                    <Badge variant="secondary" className="text-[9px]">{tmpl.category}</Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground line-clamp-2">{tmpl.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            }
                            right={
                                <div className="h-full flex flex-col bg-background">
                                     <div className="border-b p-2 flex items-center justify-between bg-muted/10">
                                         <div className="flex items-center gap-2">
                                             <FileText className="w-4 h-4 text-primary" />
                                             <input 
                                                className="bg-transparent border-none font-bold text-sm focus:outline-none"
                                                value={activeDraft?.title || "Untitled Draft"}
                                                onChange={(e) => {
                                                    const updated = caseData.drafts.map(d => d.id === caseData.activeDraftId ? {...d, title: e.target.value} : d);
                                                    updateCase({ drafts: updated });
                                                }}
                                             />
                                         </div>
                                         <div className="flex gap-2">
                                             <Button size="sm" variant="ghost" onClick={() => {
                                                 const newDraft = {
                                                     id: Date.now().toString(), title: `Draft ${caseData.drafts.length + 1}`,
                                                     content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'Draft' as const
                                                 };
                                                 updateCase({ drafts: [...caseData.drafts, newDraft], activeDraftId: newDraft.id });
                                             }}>
                                                 <FilePlus className="w-3.5 h-3.5 mr-2" /> New
                                             </Button>
                                             <Button size="sm" variant="default">
                                                 <Save className="w-3.5 h-3.5 mr-2" /> Save Draft
                                             </Button>
                                         </div>
                                     </div>
                                     <textarea 
                                        className="flex-1 resize-none p-8 font-mono text-sm leading-relaxed outline-none custom-scrollbar bg-background text-foreground"
                                        placeholder="Start drafting here or use the AI Assistant to write..."
                                        value={activeDraft?.content || ""}
                                        onChange={(e) => {
                                            const updated = caseData.drafts.map(d => d.id === caseData.activeDraftId ? {...d, content: e.target.value, updatedAt: new Date().toISOString()} : d);
                                            updateCase({ drafts: updated });
                                        }}
                                        spellCheck={false}
                                     />
                                     <div className="border-t p-1 bg-muted/10 text-[10px] text-muted-foreground text-center">
                                         Last updated: {new Date(activeDraft?.updatedAt || Date.now()).toLocaleTimeString()}
                                     </div>
                                </div>
                            }
                        />
                    </div>
                )}

                {/* 3. DOCUMENTS TAB (Using ResourceExplorer) */}
                {activeTab === 'documents' && (
                    <ResourceExplorer
                        items={documentResources}
                        addItemLabel="Upload Document"
                        onAddItem={() => fileInputRef.current?.click()}
                        emptyMessage="No documents found."
                        filterOptions={[
                            { label: 'All', value: 'all' },
                            { label: 'Plaintiff', value: 'plaintiff' },
                            { label: 'Defendant', value: 'defendant' }
                        ]}
                        activeFilter={docFilter}
                        onFilterChange={(val) => setDocFilter(val)}
                    />
                )}
                {/* Hidden File Input for Documents */}
                <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef}
                    accept=".pdf,.txt"
                    onChange={(e) => e.target.files?.[0] && handleAddDocument(e.target.files[0])} 
                />

                {/* 4. NOTES TAB (Using ResourceExplorer) */}
                {activeTab === 'notes' && (
                    <ResourceExplorer
                        items={noteResources}
                        addItemLabel="New Note"
                        onAddItem={handleAddNote}
                        emptyMessage="No notes created."
                    />
                )}

                {/* 5. EXHIBITS TAB (Using ResourceExplorer - Placeholder) */}
                {activeTab === 'exhibits' && (
                    <ResourceExplorer
                        items={[]}
                        addItemLabel="Tag Exhibit"
                        onAddItem={() => alert("Coming soon")}
                        emptyMessage="No exhibits tagged yet."
                    />
                )}

            </div>
        </div>
    );
};

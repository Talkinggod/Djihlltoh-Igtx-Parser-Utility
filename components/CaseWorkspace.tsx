
import React, { useState } from 'react';
import { CaseState, Note, StoredDocument, StoredExhibit } from '../types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { InputSection } from './InputSection';
import { OutputSection } from './OutputSection';
import { FileText, Files, StickyNote, Image, Trash2, Plus, Search, Calendar, Scale, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';

interface CaseWorkspaceProps {
    caseData: CaseState;
    updateCase: (updates: Partial<CaseState>) => void;
    // Props for Analysis View
    onProcess: any;
    onClear: any;
    lang: any;
    apiKey: string;
}

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({ 
    caseData, updateCase, onProcess, onClear, lang, apiKey 
}) => {
    const [activeTab, setActiveTab] = useState("analysis");
    const [docFilter, setDocFilter] = useState<'all' | 'plaintiff' | 'defendant'>('all');
    const [newNote, setNewNote] = useState("");
    const fileInputRef = React.useRef<HTMLInputElement>(null);

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

    const loadDocumentToAnalysis = (doc: StoredDocument) => {
        updateCase({
            input: doc.content,
            report: null // Reset report when loading new text
        });
        setActiveTab("analysis");
    };

    const deleteDocument = (id: string) => {
        updateCase({
            documents: caseData.documents.filter(d => d.id !== id)
        });
    };

    // --- Notes Logic ---
    const handleAddNote = () => {
        if (!newNote.trim()) return;
        const note: Note = {
            id: Date.now().toString(),
            title: `Note ${caseData.notes.length + 1}`,
            content: newNote,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            history: []
        };
        updateCase({
            notes: [note, ...caseData.notes]
        });
        setNewNote("");
    };

    const deleteNote = (id: string) => {
        updateCase({
            notes: caseData.notes.filter(n => n.id !== id)
        });
    };

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Case Workspace Navigation */}
            <div className="border-b bg-background px-4 py-2 flex items-center gap-4 shrink-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-muted/40 h-10 w-full justify-start gap-4 px-2">
                        <TabsTrigger value="analysis" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Scale className="w-4 h-4" /> Analysis
                        </TabsTrigger>
                        <TabsTrigger value="documents" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Files className="w-4 h-4" /> Documents
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.documents.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="exhibits" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Image className="w-4 h-4" /> Exhibits
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.exhibits.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <StickyNote className="w-4 h-4" /> Notes
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.notes.length}</Badge>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="flex-1 overflow-hidden relative">
                
                {/* 1. ANALYSIS TAB (Existing Editor) */}
                {activeTab === 'analysis' && (
                    <div className="h-full flex flex-col md:flex-row gap-4 p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex-1 h-full min-w-0 flex flex-col gap-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                                <FileText className="w-3 h-3" /> Active Document
                            </h3>
                             <div className="flex-1 min-h-0 border rounded-lg overflow-hidden shadow-sm">
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
                                />
                             </div>
                        </div>
                        <div className="flex-1 h-full min-w-0 flex flex-col gap-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-2">
                                <Scale className="w-3 h-3" /> Legal Extraction
                            </h3>
                            <div className="flex-1 min-h-0 border rounded-lg overflow-hidden shadow-sm">
                                <OutputSection 
                                    report={caseData.report} 
                                    onUpdateReport={(r) => updateCase({ report: r })}
                                    lang={lang} 
                                    apiKey={apiKey}
                                    domain={caseData.domain}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. DOCUMENTS TAB */}
                {activeTab === 'documents' && (
                    <div className="h-full p-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="max-w-5xl mx-auto h-full flex flex-col gap-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className={cn("h-7 text-xs", docFilter === 'all' && "bg-background shadow-sm")}
                                        onClick={() => setDocFilter('all')}
                                    >All</Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className={cn("h-7 text-xs", docFilter === 'plaintiff' && "bg-background shadow-sm")}
                                        onClick={() => setDocFilter('plaintiff')}
                                    >Plaintiff</Button>
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className={cn("h-7 text-xs", docFilter === 'defendant' && "bg-background shadow-sm")}
                                        onClick={() => setDocFilter('defendant')}
                                    >Defendant</Button>
                                </div>
                                <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                                    <Plus className="w-4 h-4 mr-2" /> Upload Document
                                </Button>
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    ref={fileInputRef}
                                    accept=".pdf,.txt"
                                    onChange={(e) => e.target.files?.[0] && handleAddDocument(e.target.files[0])} 
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                {caseData.documents.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground border-2 border-dashed rounded-xl">
                                        <Files className="w-10 h-10 mb-2 opacity-50" />
                                        <p>No documents stored.</p>
                                    </div>
                                ) : (
                                    caseData.documents
                                        .filter(d => docFilter === 'all' || d.side === docFilter)
                                        .map(doc => (
                                        <div key={doc.id} className="flex items-center justify-between p-4 bg-card border rounded-lg hover:border-primary/50 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-primary/5 rounded-lg flex items-center justify-center text-primary">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-sm">{doc.name}</h4>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                        <span>{new Date(doc.dateAdded).toLocaleDateString()}</span>
                                                        <span>•</span>
                                                        <span className="uppercase">{doc.type}</span>
                                                        <span>•</span>
                                                        <Badge variant="outline" className="text-[9px] h-4">{doc.side}</Badge>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="sm" variant="secondary" onClick={() => loadDocumentToAnalysis(doc)}>
                                                    Analyze
                                                </Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteDocument(doc.id)}>
                                                    <Trash2 className="w-4 h-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. NOTES TAB */}
                {activeTab === 'notes' && (
                    <div className="h-full flex gap-0 divide-x animate-in fade-in slide-in-from-right-2 duration-300">
                        {/* Sidebar List */}
                        <div className="w-64 flex flex-col bg-muted/10 h-full">
                            <div className="p-4 border-b">
                                <h3 className="text-sm font-semibold mb-2">My Notes</h3>
                                <Button size="sm" className="w-full justify-start" onClick={handleAddNote} disabled={!newNote.trim()}>
                                    <Plus className="w-3.5 h-3.5 mr-2" /> Add Current Note
                                </Button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {caseData.notes.map(note => (
                                    <div key={note.id} className="p-3 rounded bg-card border hover:border-primary/50 cursor-pointer group">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold truncate">{note.title}</span>
                                            <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-destructive">
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">{note.content}</p>
                                        <div className="mt-2 text-[9px] text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-2.5 h-2.5" />
                                            {new Date(note.updatedAt).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Editor Area */}
                        <div className="flex-1 flex flex-col p-6 bg-background">
                             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <StickyNote className="w-5 h-5 text-primary" />
                                Quick Note Editor
                             </h2>
                             <textarea 
                                className="flex-1 resize-none bg-muted/20 border-none rounded-lg p-4 focus:ring-1 ring-primary outline-none"
                                placeholder="Type a note here and click 'Add'..."
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                             />
                             <div className="mt-2 text-xs text-muted-foreground">
                                Notes are saved with history automatically when added.
                             </div>
                        </div>
                    </div>
                )}

                {/* 4. EXHIBITS TAB */}
                {activeTab === 'exhibits' && (
                    <div className="h-full p-8 flex flex-col items-center justify-center text-muted-foreground animate-in fade-in duration-500">
                         <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
                             <Image className="w-10 h-10 opacity-50" />
                         </div>
                         <h3 className="text-lg font-medium text-foreground">Exhibits Gallery</h3>
                         <p className="max-w-md text-center mt-2">
                            This module allows tagging specific documents or image snippets as Exhibits (A, B, C...) for trial preparation.
                         </p>
                         <Button variant="outline" className="mt-6" disabled>
                             Feature Coming Soon
                         </Button>
                    </div>
                )}

            </div>
        </div>
    );
};

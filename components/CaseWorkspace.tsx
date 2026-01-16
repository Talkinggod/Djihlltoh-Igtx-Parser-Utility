
import React, { useState, useEffect } from 'react';
// Fix: removed non-existent DocCategory import
import { CaseState, Note, StoredDocument, Template, Draft, GoogleUser, TrialExhibit, ExhibitStatus, ViabilityAssessment, CustomRule, CaseEvent, IGTXSource } from '../types';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { InputSection } from './InputSection';
import { OutputSection } from './OutputSection';
import { ResourceExplorer, ResourceItem } from './ResourceExplorer';
import { ViabilityDashboard } from './ViabilityDashboard';
import { LegalBenchTools } from './LegalBenchTools';
import { ClaimManager } from './ClaimManager';
import { FileText, Files, StickyNote, Image, Trash2, Plus, Search, Calendar, Scale, Clock, PenTool, LayoutTemplate, Save, FilePlus, Database, Gavel, CheckCircle2, AlertCircle, TrendingUp, Loader2, Microscope, Bell, Filter, Check, X, Info, AlertTriangle, FolderTree, Wand2, Sparkles, Languages, Eye, Edit3, BookOpen, BrainCircuit, History, ShieldAlert } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { GoogleDriveService } from '../services/googleDriveService';
import { ResizableSplitView } from './ui/ResizableSplitView';
import { generateViabilityAssessment, refineDraft } from '../services/aiService';
import { RuleEditorDialog } from './RuleEditorDialog';
import { FileSystemService } from '../services/fileSystemService';

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
    const [strategySubTab, setStrategySubTab] = useState<'viability' | 'legalbench' | 'claims'>('viability');
    const [docFilter, setDocFilter] = useState<string>('all');
    const [exhibitFilter, setExhibitFilter] = useState<ExhibitStatus | 'all'>('all');
    const [isAssessing, setIsAssessing] = useState(false);
    const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
    const [scaffolding, setScaffolding] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    
    // Drafting State
    const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
    const [workMode, setWorkMode] = useState<'practice' | 'draft' | 'research'>('draft');

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const templateInputRef = React.useRef<HTMLInputElement>(null);

    // Initialize Active Draft and Claims if none
    useEffect(() => {
        const updates: Partial<CaseState> = {};
        let hasUpdates = false;

        if (!caseData.activeDraftId && caseData.drafts && caseData.drafts.length > 0) {
            updates.activeDraftId = caseData.drafts[0].id;
            hasUpdates = true;
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
             updates.drafts = [newDraft];
             updates.activeDraftId = newDraft.id;
             hasUpdates = true;
        }

        if (!caseData.claims) {
            updates.claims = [];
            hasUpdates = true;
        }

        if (hasUpdates) updateCase(updates);
    }, [caseData.drafts, caseData.activeDraftId, caseData.claims]);

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
            dateAdded: new Date().toISOString(),
            category: 'other' // Default
        };

        updateCase({
            documents: [...caseData.documents, newDoc]
        });
    };

    const handleScaffoldFolders = async () => {
        // Updated directoryHandle property access
        if (!caseData.directoryHandle) {
            alert("Please connect a Local Folder first (top right header).");
            return;
        }
        setScaffolding(true);
        try {
            // Updated directoryHandle property access
            await FileSystemService.scaffoldCaseStructure(caseData.directoryHandle, caseData.name);
            alert("Structure created successfully on local disk!");
        } catch(e: any) {
            console.error(e);
            alert("Scaffolding failed: " + e.message);
        } finally {
            setScaffolding(false);
        }
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
                dateAdded: new Date().toISOString(),
                category: 'other'
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
            // Fixed sourceMeta property access
            sourceMeta: { 
                ...(caseData.sourceMeta || {}), 
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
         // Fixed templates property access
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
            
            // Fixed templates property access
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

    // --- AI Refinement Logic ---
    const handleRefineDraft = async (instruction: string) => {
        if (!activeDraft || !apiKey) {
            alert("Draft or API Key missing.");
            return;
        }
        setIsRefining(true);
        try {
            const refined = await refineDraft(activeDraft.content, instruction, apiKey);
            const updatedDrafts = caseData.drafts.map(d => 
                d.id === activeDraft.id ? { ...d, content: refined, updatedAt: new Date().toISOString() } : d
            );
            updateCase({ drafts: updatedDrafts });
        } catch(e: any) {
            alert(`AI Refinement failed: ${e.message}`);
        } finally {
            setIsRefining(false);
        }
    };

    // --- Drafting Utilities ---
    const handleCommit = () => {
        // In a real app, this might commit to git or save a version
        if (activeDraft) {
            const updatedDrafts = caseData.drafts.map(d => 
                d.id === activeDraft.id ? { ...d, status: 'Final' as const, updatedAt: new Date().toISOString() } : d
            );
            updateCase({ drafts: updatedDrafts });
            alert("Draft committed as Final Version.");
        }
    };

    const handleTimestamp = () => {
        if (activeDraft) {
            const timeStr = ` [${new Date().toLocaleTimeString()}] `;
            const updatedDrafts = caseData.drafts.map(d => 
                d.id === activeDraft.id ? { ...d, content: activeDraft.content + timeStr, updatedAt: new Date().toISOString() } : d
            );
            updateCase({ drafts: updatedDrafts });
        }
    };

    // --- Viability Assessment Logic ---
    const handleRunAssessment = async () => {
        if (caseData.documents.length === 0 && !caseData.input) {
            alert("Please add documents to the case before running an assessment.");
            return;
        }
        if (!apiKey) {
            alert("API Key required.");
            return;
        }

        setIsAssessing(true);
        try {
            const assessment = await generateViabilityAssessment(caseData, apiKey);
            // Fixed viabilityAssessment property access
            updateCase({ viabilityAssessment: assessment });
        } catch (e: any) {
            alert("Assessment failed: " + e.message);
        } finally {
            setIsAssessing(false);
        }
    };

    // --- Notes Logic ---
    const handleAddNote = () => {
        const note: Note = {
            id: Date.now().toString(),
            title: `New Note ${caseData.notes.length + 1}`,
            content: "Double click to edit...",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            // Fixed history property initialization
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

    // --- Exhibit Logic ---
    const updateExhibitStatus = (exhibitId: string, status: ExhibitStatus) => {
        updateCase({
            exhibits: caseData.exhibits.map(ex => ex.id === exhibitId ? { ...ex, status } : ex)
        });
    };

    // --- Events Logic ---
    const handleAddEvent = () => {
        const newEvent: CaseEvent = {
            id: Date.now().toString(),
            type: 'info',
            title: 'Manual Entry',
            message: 'User added event.',
            timestamp: new Date(),
            read: true
        };
        updateCase({ events: [newEvent, ...caseData.events] });
    };

    const markEventRead = (id: string) => {
        updateCase({
            events: caseData.events.map(e => e.id === id ? { ...e, read: true } : e)
        });
    };

    const deleteEvent = (id: string) => {
        updateCase({
            events: caseData.events.filter(e => e.id !== id)
        });
    };

    // --- Resource Mappers ---

    const getDocResources = () => {
        const filtered = caseData.documents.filter(d => {
            if (docFilter === 'all') return true;
            // Support filtering by Side or Category
            // Added side and category property access
            if (['plaintiff', 'defendant'].includes(docFilter)) return d.side === docFilter;
            return d.category === docFilter; // Match category (pleading, motion, etc)
        });

        return filtered.map(doc => ({
            id: doc.id,
            title: doc.name,
            // Added folderPath and category property access
            subtitle: doc.folderPath || doc.category, // Show folder path if available
            date: doc.dateAdded,
            // Explicitly cast type for ResourceItem compatibility
            type: (doc.type.includes('pdf') ? 'pdf' : 'text') as 'pdf' | 'text',
            content: doc.content,
            // Added category and tags property access
            tags: [doc.category || 'doc'],
            evidenceTags: doc.tags,
            onAction: () => loadDocumentToAnalysis(doc),
            actionLabel: "Analyze",
            onDelete: () => deleteDocument(doc.id)
        } as ResourceItem));
    };
    
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

    const filteredExhibits = caseData.exhibits.filter(ex => exhibitFilter === 'all' || ex.status === exhibitFilter);

    // --- DOC FILTER OPTIONS ---
    const docFilters = [
        { label: 'All Files', value: 'all' },
        { label: '01 Pleadings', value: 'pleading' },
        { label: '02 Discovery', value: 'discovery' },
        { label: '03 Motions', value: 'motion' },
        { label: '04 Admin', value: 'administrative' },
        { label: '05 Exhibits', value: 'exhibit' },
        { label: '07 Orders', value: 'order' }
    ];

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
                        <TabsTrigger value="strategy" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <TrendingUp className="w-4 h-4" /> <span className="hidden sm:inline">Strategy</span>
                        </TabsTrigger>
                        <TabsTrigger value="documents" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Files className="w-4 h-4" /> <span className="hidden sm:inline">Files</span>
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.documents.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="exhibits" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Gavel className="w-4 h-4" /> <span className="hidden sm:inline">Exhibits</span>
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 min-w-[1.25rem]">{caseData.exhibits.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="events" className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Bell className="w-4 h-4" /> <span className="hidden sm:inline">Log</span>
                            {caseData.events.some(e => !e.read) && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
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
                                            // Fixed docTypeId and setDocTypeId property access
                                            docTypeId={caseData.docTypeId}
                                            setDocTypeId={(id) => updateCase({ docTypeId: id })}
                                            refDate={caseData.referenceDate}
                                            setRefDate={(d) => updateCase({ referenceDate: d })}
                                            googleUser={googleUser}
                                            // Added lambdaControl props
                                            lambdaControl={caseData.λ_control}
                                            setLambdaControl={(val) => updateCase({ λ_control: val })}
                                            // Fixed customRules property access
                                            customRules={caseData.customRules}
                                            onOpenRuleEditor={() => setIsRuleEditorOpen(true)}
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
                            initialLeftWidth={20}
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
                                        {/* Fixed templates property access */}
                                        {(caseData.templates || []).length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-4">No templates.</p>
                                        )}
                                        {/* Fixed templates property access */}
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
                                    <div className="mt-4 pt-4 border-t">
                                        <Button size="sm" variant="ghost" className="w-full justify-start text-xs" onClick={() => {
                                             const newDraft = {
                                                 id: Date.now().toString(), title: `Draft ${caseData.drafts.length + 1}`,
                                                 content: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'Draft' as const
                                             };
                                             updateCase({ drafts: [...caseData.drafts, newDraft], activeDraftId: newDraft.id });
                                        }}>
                                            <FilePlus className="w-3.5 h-3.5 mr-2" /> New Draft
                                        </Button>
                                    </div>
                                </div>
                            }
                            right={
                                <div className="h-full flex flex-col bg-background relative">
                                     {/* Enhanced Drafting Toolbar */}
                                     <div className="border-b p-2 flex flex-col md:flex-row items-center justify-between bg-muted/10 shrink-0 gap-2">
                                         
                                         {/* Index Number & Title */}
                                         <div className="flex items-center gap-3 w-full md:w-auto">
                                             <Badge variant="outline" className="h-8 rounded px-3 font-mono bg-background shadow-sm border-primary/20 text-primary">
                                                 {caseData.caseMeta.indexNumber || "No Index #"}
                                             </Badge>
                                             <input 
                                                className="bg-transparent border-none font-bold text-sm focus:outline-none flex-1 md:flex-none md:w-64"
                                                value={activeDraft?.title || "Untitled Draft"}
                                                onChange={(e) => {
                                                    const updated = caseData.drafts.map(d => d.id === caseData.activeDraftId ? {...d, title: e.target.value} : d);
                                                    updateCase({ drafts: updated });
                                                }}
                                                placeholder="Draft Title..."
                                             />
                                         </div>

                                         {/* Control Group */}
                                         <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-hide pb-1 md:pb-0">
                                             {/* Modes */}
                                             <div className="flex bg-muted/50 rounded-lg p-1 mr-2">
                                                 <Button size="sm" variant={workMode === 'practice' ? 'default' : 'ghost'} className="h-7 text-xs px-3 rounded-md" onClick={() => setWorkMode('practice')}>
                                                     Practice
                                                 </Button>
                                                 <Button size="sm" variant="ghost" className="h-7 text-xs px-3 rounded-md hover:text-purple-500" onClick={() => handleRefineDraft("Perfect grammar and legal style")}>
                                                     <Sparkles className="w-3 h-3 mr-1" /> Perfect
                                                 </Button>
                                                 <Button size="sm" variant={workMode === 'draft' ? 'default' : 'ghost'} className="h-7 text-xs px-3 rounded-md" onClick={() => setWorkMode('draft')}>
                                                     Draft
                                                 </Button>
                                                 <Button size="sm" variant={workMode === 'research' ? 'default' : 'ghost'} className="h-7 text-xs px-3 rounded-md" onClick={() => { setWorkMode('research'); setActiveTab('strategy'); }}>
                                                     <BrainCircuit className="w-3 h-3 mr-1" /> Research
                                                 </Button>
                                             </div>

                                             <div className="w-px h-6 bg-border mx-1" />

                                             {/* View Toggles */}
                                             <div className="flex gap-1">
                                                 <Button 
                                                    size="sm" 
                                                    variant={editorMode === 'edit' ? 'secondary' : 'ghost'} 
                                                    className="h-8 gap-2 text-xs"
                                                    onClick={() => setEditorMode('edit')}
                                                 >
                                                     <Edit3 className="w-3.5 h-3.5" /> Edit
                                                 </Button>
                                                 <Button 
                                                    size="sm" 
                                                    variant={editorMode === 'preview' ? 'secondary' : 'ghost'} 
                                                    className="h-8 gap-2 text-xs"
                                                    onClick={() => setEditorMode('preview')}
                                                 >
                                                     <Eye className="w-3.5 h-3.5" /> Preview
                                                 </Button>
                                             </div>

                                             <div className="w-px h-6 bg-border mx-1" />

                                             {/* Utilities */}
                                             <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={handleTimestamp} title="Insert Timestamp">
                                                 <Clock className="w-3.5 h-3.5" /> Time
                                             </Button>
                                             
                                             <Button size="sm" variant="default" className={cn("h-8 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white")} onClick={handleCommit}>
                                                 <CheckCircle2 className="w-3.5 h-3.5" /> Commit
                                             </Button>
                                         </div>
                                     </div>
                                     
                                     {/* Editor Surface */}
                                     <div className="flex-1 bg-muted/20 relative overflow-auto custom-scrollbar flex justify-center">
                                         {editorMode === 'edit' ? (
                                             <textarea 
                                                className="w-full h-full resize-none p-8 font-mono text-sm leading-relaxed outline-none bg-background text-foreground border-none"
                                                placeholder="Start drafting here..."
                                                value={activeDraft?.content || ""}
                                                onChange={(e) => {
                                                    const updated = caseData.drafts.map(d => d.id === caseData.activeDraftId ? {...d, content: e.target.value, updatedAt: new Date().toISOString()} : d);
                                                    updateCase({ drafts: updated });
                                                }}
                                                spellCheck={false}
                                             />
                                         ) : (
                                             <div className="py-8 px-4 w-full flex justify-center min-h-full">
                                                 <div className="bg-white text-black w-full max-w-[8.5in] min-h-[11in] shadow-lg p-[1in] font-serif text-[12pt] leading-[2.0] whitespace-pre-wrap select-text">
                                                     {activeDraft?.content || <span className="text-gray-300 italic">No content...</span>}
                                                 </div>
                                             </div>
                                         )}
                                         
                                         {/* Floating AI status if refining */}
                                         {isRefining && (
                                             <div className="absolute bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs animate-in fade-in slide-in-from-bottom-2">
                                                 <Loader2 className="w-4 h-4 animate-spin" /> Perfecting Draft...
                                             </div>
                                         )}
                                     </div>

                                     <div className="border-t p-1 bg-muted/10 text-[10px] text-muted-foreground text-center flex justify-between px-4">
                                         <span>Mode: {workMode.toUpperCase()}</span>
                                         <span>Last updated: {new Date(activeDraft?.updatedAt || Date.now()).toLocaleTimeString()}</span>
                                     </div>
                                </div>
                            }
                        />
                    </div>
                )}

                {/* 3. STRATEGY TAB (New Viability Dashboard + LegalBench Tools) */}
                {activeTab === 'strategy' && (
                    <div className="h-full w-full flex flex-col p-4 bg-muted/5 animate-in fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-primary" /> Case Strategy
                                </h3>
                                <p className="text-xs text-muted-foreground">Viability Assessment & LegalBench Analysis Tools.</p>
                            </div>
                            
                            <div className="flex gap-2">
                                <Tabs value={strategySubTab} onValueChange={(v: any) => setStrategySubTab(v)}>
                                    <TabsList className="bg-muted/50 h-8">
                                        <TabsTrigger value="viability" className="text-xs h-6 px-2">Merits</TabsTrigger>
                                        <TabsTrigger value="legalbench" className="text-xs h-6 px-2 flex gap-1"><Microscope className="w-3 h-3"/> Deep Analysis</TabsTrigger>
                                        <TabsTrigger value="claims" className="text-xs h-6 px-2 flex gap-1"><ShieldAlert className="w-3 h-3"/> Claims</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                                {strategySubTab === 'viability' && (
                                    <Button onClick={handleRunAssessment} disabled={isAssessing} size="sm" className="h-8">
                                        {isAssessing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Gavel className="w-3.5 h-3.5 mr-2" />}
                                        {caseData.viabilityAssessment ? 'Re-Assess' : 'Run Check'}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 bg-background border rounded-xl shadow-sm overflow-hidden">
                            {strategySubTab === 'viability' ? (
                                // Fixed viabilityAssessment property access
                                caseData.viabilityAssessment ? (
                                    <ViabilityDashboard 
                                        assessment={caseData.viabilityAssessment} 
                                        // Fixed viabilityAssessment property access
                                        onUpdate={(updated) => updateCase({ viabilityAssessment: updated })}
                                    />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                                        <Scale className="w-16 h-16 opacity-20" />
                                        <div className="text-center max-w-md">
                                            <h4 className="font-semibold text-foreground">No Assessment Generated</h4>
                                            <p className="text-sm mt-2">
                                                Run a diagnostic to evaluate the "Balance of Equities", win probability, and key strengths/weaknesses based on your current documents.
                                            </p>
                                        </div>
                                        <Button variant="outline" onClick={handleRunAssessment} disabled={isAssessing}>
                                            Start Assessment
                                        </Button>
                                    </div>
                                )
                            ) : strategySubTab === 'claims' ? (
                                <ClaimManager 
                                    caseData={caseData} 
                                    updateCase={updateCase} 
                                    apiKey={apiKey} 
                                />
                            ) : (
                                <LegalBenchTools 
                                    apiKey={apiKey} 
                                    inputText={caseData.input || caseData.report?.fullExtractedText} 
                                    allDocuments={caseData.documents}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* 4. DOCUMENTS TAB (Using ResourceExplorer with Scaffolding) */}
                {activeTab === 'documents' && (
                    <div className="h-full flex flex-col">
                        <div className="bg-blue-500/5 px-4 py-2 border-b border-blue-500/20 flex justify-between items-center text-xs">
                            <span className="text-blue-700 font-medium flex items-center gap-2">
                                <FolderTree className="w-4 h-4" /> 
                                {/* Fixed directoryHandle property access */}
                                Local Sync: {caseData.directoryHandle ? (caseData.directoryHandle as any).name : 'Not Connected'}
                            </span>
                            {/* Fixed directoryHandle property access */}
                            {caseData.directoryHandle && (
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-xs bg-background gap-2"
                                    onClick={handleScaffoldFolders}
                                    disabled={scaffolding}
                                >
                                    {scaffolding ? <Loader2 className="w-3 h-3 animate-spin"/> : <FolderTree className="w-3 h-3 text-emerald-600"/>}
                                    Scaffold Standard Structure
                                </Button>
                            )}
                        </div>
                        <div className="flex-1 min-h-0">
                            <ResourceExplorer
                                items={getDocResources()}
                                addItemLabel="Upload Document"
                                onAddItem={() => fileInputRef.current?.click()}
                                emptyMessage="No documents found."
                                filterOptions={docFilters}
                                activeFilter={docFilter}
                                onFilterChange={(val) => setDocFilter(val)}
                            />
                        </div>
                    </div>
                )}
                {/* Hidden File Input for Documents */}
                <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef}
                    accept=".pdf,.txt"
                    onChange={(e) => e.target.files?.[0] && handleAddDocument(e.target.files[0])} 
                />

                {/* 5. NOTES TAB (Using ResourceExplorer) */}
                {activeTab === 'notes' && (
                    <ResourceExplorer
                        items={noteResources}
                        addItemLabel="New Note"
                        onAddItem={handleAddNote}
                        emptyMessage="No notes created."
                    />
                )}

                {/* 6. EXHIBITS TAB (Formal Legal Table) */}
                {activeTab === 'exhibits' && (
                    <div className="h-full flex flex-col bg-background p-4 animate-in fade-in">
                        <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Gavel className="w-5 h-5 text-primary" /> Exhibit List
                                </h3>
                                <p className="text-xs text-muted-foreground">Formal evidence list for trial preparation (Marked for Identification).</p>
                            </div>
                            <Button size="sm" onClick={() => alert("Ask the AI to mark documents as exhibits!")}>
                                <Plus className="w-4 h-4 mr-2" /> Mark New Exhibit
                            </Button>
                        </div>

                        {/* Status Filter */}
                        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                            {(['all', 'potential', 'marked', 'offered', 'admitted', 'excluded'] as const).map(status => (
                                <Badge
                                    key={status}
                                    variant={exhibitFilter === status ? 'default' : 'outline'}
                                    className="cursor-pointer capitalize shrink-0"
                                    onClick={() => setExhibitFilter(status)}
                                >
                                    {status}
                                </Badge>
                            ))}
                        </div>

                        <div className="border rounded-lg overflow-hidden bg-card flex-1 min-h-0 relative flex flex-col">
                            <div className="overflow-auto custom-scrollbar flex-1">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-muted/50 border-b sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 font-medium text-muted-foreground w-32">Designation</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground">Description</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground w-32">Date Marked</th>
                                            <th className="px-4 py-3 font-medium text-muted-foreground w-40 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {filteredExhibits.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                                                    {caseData.exhibits.length === 0 
                                                        ? "No exhibits marked yet. Ask the AI to 'Mark [Document] as Exhibit A'."
                                                        : "No exhibits match this filter."}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredExhibits.map(ex => (
                                                <tr key={ex.id} className="hover:bg-muted/20 group">
                                                    <td className="px-4 py-3 font-mono font-bold text-primary align-middle">{ex.designation}</td>
                                                    <td className="px-4 py-3 align-middle">{ex.description}</td>
                                                    <td className="px-4 py-3 text-muted-foreground text-xs align-middle font-mono">{new Date(ex.markedDate).toLocaleDateString()}</td>
                                                    <td className="px-4 py-3 align-middle text-center">
                                                        <select
                                                            className={cn(
                                                                "h-7 text-[10px] uppercase font-bold rounded border bg-transparent px-2 py-0 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer w-full text-center appearance-none",
                                                                ex.status === 'admitted' ? "text-green-600 border-green-500/30 bg-green-500/5" :
                                                                ex.status === 'excluded' ? "text-red-600 border-red-500/30 bg-red-500/5" :
                                                                ex.status === 'offered' ? "text-amber-600 border-amber-500/30 bg-amber-500/5" :
                                                                ex.status === 'marked' ? "text-blue-600 border-blue-500/30 bg-blue-500/5" :
                                                                "text-muted-foreground border-border bg-muted/10"
                                                            )}
                                                            value={ex.status}
                                                            onChange={(e) => updateExhibitStatus(ex.id, e.target.value as ExhibitStatus)}
                                                        >
                                                            <option value="potential">Potential</option>
                                                            <option value="marked">Marked (ID)</option>
                                                            <option value="offered">Offered</option>
                                                            <option value="admitted">Admitted</option>
                                                            <option value="excluded">Excluded</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                            <AlertCircle className="w-3 h-3" />
                            <span>Ensure all exhibits are exchanged with opposing counsel prior to trial.</span>
                        </div>
                    </div>
                )}

                {/* 7. EVENTS / LOG TAB */}
                {activeTab === 'events' && (
                    <div className="h-full flex flex-col bg-background p-4 animate-in fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-primary" /> Case Log
                                </h3>
                                <p className="text-xs text-muted-foreground">Timeline of system events, errors, and deadlines.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={handleAddEvent}>
                                <Plus className="w-4 h-4 mr-2" /> Add Entry
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-lg bg-card relative">
                            {caseData.events.length === 0 && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                                    <Info className="w-10 h-10 mb-2 opacity-20" />
                                    <p>No events logged.</p>
                                </div>
                            )}
                            <div className="divide-y">
                                {caseData.events.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(ev => (
                                    <div key={ev.id} className={cn("p-4 flex gap-3 group transition-colors", !ev.read ? "bg-primary/5" : "hover:bg-muted/10")}>
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                                            ev.type === 'error' ? "bg-red-500/10 text-red-600 border-red-200" :
                                            ev.type === 'warning' ? "bg-amber-500/10 text-amber-600 border-amber-200" :
                                            // Fixed success type comparison
                                            (ev.type as string) === 'success' ? "bg-green-500/10 text-green-600 border-green-200" :
                                            ev.type === 'deadline' ? "bg-purple-500/10 text-purple-600 border-purple-200" :
                                            "bg-blue-500/10 text-blue-600 border-blue-200"
                                        )}>
                                            {ev.type === 'error' ? <AlertTriangle className="w-4 h-4" /> :
                                             ev.type === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                                             // Fixed success type comparison
                                             (ev.type as string) === 'success' ? <Check className="w-4 h-4" /> :
                                             ev.type === 'deadline' ? <Clock className="w-4 h-4" /> :
                                             <Info className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start">
                                                <h4 className={cn("text-sm font-semibold", !ev.read && "text-primary")}>{ev.title}</h4>
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                                                    {new Date(ev.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-foreground/80 mt-1 leading-relaxed">{ev.message}</p>
                                        </div>
                                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!ev.read && (
                                                <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => markEventRead(ev.id)} title="Mark Read">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteEvent(ev.id)} title="Delete">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </div>
            
            {/* Rule Editor Modal */}
            <RuleEditorDialog 
                isOpen={isRuleEditorOpen}
                onClose={() => setIsRuleEditorOpen(false)}
                // Fixed customRules property access
                rules={caseData.customRules || []}
                // Fixed customRules property access
                onSaveRules={(rules) => updateCase({ customRules: rules })}
                testContent={caseData.input}
            />
        </div>
    );
};

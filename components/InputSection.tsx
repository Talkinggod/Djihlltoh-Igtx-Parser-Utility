
import React, { useRef, useState } from 'react';
import { Upload, FileText, X, RefreshCw, Loader2, FileType, Eye, Edit3, Settings2, BookOpen, ChevronDown, ChevronUp, Info, Globe, Link, AlertCircle, Scale, Gavel, Calendar, Database, Languages } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { scrapeUrlViaGemini } from '../services/webScraper';
import { GoogleDriveService } from '../services/googleDriveService';
import { PdfViewer } from './PdfViewer';
import { LanguageProfile, IGTXSource, UILanguage, PdfTextDiagnostics, ParserDomain, GoogleUser, CustomRule } from '../types';
import { translations } from '../services/translations';
import { DocumentTypeSelector } from './DocumentTypeSelector';

interface InputSectionProps {
  input: string;
  setInput: (val: string) => void;
  onProcess: (metadata: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics, customRules?: CustomRule[]) => void;
  onClear: () => void;
  profile: LanguageProfile;
  setProfile: (val: LanguageProfile) => void;
  lang: UILanguage;
  apiKey: string;
  domain: ParserDomain;
  // Legal / Case Specifics
  docTypeId?: string;
  setDocTypeId?: (id: string) => void;
  refDate?: Date;
  setRefDate?: (date: Date) => void;
  // Google
  googleUser?: GoogleUser;
  // Custom Rules
  customRules?: CustomRule[];
  onOpenRuleEditor?: () => void;
}

export const InputSection: React.FC<InputSectionProps> = ({ 
    input, setInput, onProcess, onClear, profile, setProfile, lang, apiKey, domain,
    docTypeId, setDocTypeId, refDate, setRefDate, googleUser, customRules, onOpenRuleEditor
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDiagnostics, setPdfDiagnostics] = useState<PdfTextDiagnostics | undefined>(undefined);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState("Parsing PDF...");
  const [activeTab, setActiveTab] = useState<string>("input");
  const [showMetadata, setShowMetadata] = useState(false);
  const [ocrLang, setOcrLang] = useState<string>('eng');
  
  // URL Input State
  const [urlInput, setUrlInput] = useState("");
  const [isScraping, setIsScraping] = useState(false);

  const t = translations[lang];

  // Source Metadata State
  const [sourceMeta, setSourceMeta] = useState<Partial<IGTXSource>>({
    title: "",
    author: "",
    year: null,
    language: "",
    source_type: "legacy_text"
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter") {
      dragCounter.current += 1;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setDragActive(true);
      }
    } else if (e.type === "dragleave") {
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setDragActive(false);
      }
    } else if (e.type === "dragover") {
      e.preventDefault(); // Necessary to allow dropping
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    dragCounter.current = 0;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setIsLoadingFile(true);
    setLoadingProgress(0);
    setLoadingStatus("Preparing file...");
    setPdfFile(null);
    setPdfDiagnostics(undefined);

    try {
      if (file.type === "application/pdf" || file.name.endsWith('.pdf')) {
        setPdfFile(file);
        // Pass selected OCR Language
        const { text, diagnostics } = await extractTextFromPdf(file, (percent, status) => {
          setLoadingProgress(percent);
          if (status) setLoadingStatus(status);
        }, ocrLang);
        
        setInput(text);
        setPdfDiagnostics(diagnostics);
        setSourceMeta(prev => ({ ...prev, source_type: 'pdf', title: file.name }));
        setActiveTab("viewer"); 
      } else if (file.type === "text/plain" || file.name.endsWith('.md') || file.name.endsWith('.igt') || file.name.endsWith('.txt')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            setInput(e.target.result);
            setSourceMeta(prev => ({ ...prev, source_type: 'legacy_text', title: file.name }));
          }
          setIsLoadingFile(false);
        };
        reader.readAsText(file);
        setActiveTab("input");
        return; 
      } else {
        setInput(`[SYSTEM WARNING]: Unsupported file type (${file.type}).\n\nPlease use .pdf, .txt, or .igt files.`);
        setActiveTab("input");
      }
    } catch (e: any) {
      console.error(e);
      setInput(`[SYSTEM ERROR]: File Processing Failed\n----------------------------------------\nError: ${e.message || "Unknown error"}`);
      setActiveTab("input");
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleDriveImport = async () => {
      if (!googleUser) return;
      setIsLoadingFile(true);
      setLoadingStatus("Connecting to Google Drive...");
      try {
          const file = await GoogleDriveService.openPicker(googleUser.accessToken, apiKey);
          setLoadingStatus("Downloading file...");
          const content = await GoogleDriveService.downloadFile(file.id, file.mimeType, googleUser.accessToken);
          
          setInput(content);
          setFileName(file.name);
          setSourceMeta(prev => ({ 
              ...prev, 
              source_type: 'google_drive', 
              title: file.name,
              source_url: `https://docs.google.com/document/d/${file.id}`
          }));
          setActiveTab("input");
      } catch (e) {
          console.error("Drive Import Failed", e);
          if (typeof e === 'string' && e.includes("Picker cancelled")) {
              // Ignore
          } else {
              alert("Failed to import from Google Drive. See console.");
          }
      } finally {
          setIsLoadingFile(false);
      }
  };

  const handleUrlFetch = async () => {
    if (!urlInput) return;
    if (!apiKey) {
        setInput(`[SYSTEM ERROR]: API Key Missing\n----------------------------------------\nPlease enter your Gemini API Key in the top header to use URL scraping.`);
        setActiveTab("input");
        return;
    }

    setIsScraping(true);
    setLoadingStatus(domain === 'legal' ? "Fetching court records..." : "Scraping content via Gemini Pro..."); 
    
    try {
        const { text, metadata } = await scrapeUrlViaGemini(urlInput, apiKey);
        if (!text || text.trim().length === 0) {
             setInput(`[SYSTEM WARNING]: The AI could not retrieve sufficient content from this URL.\n\nReason: The page content may not be fully indexed by Google Search, or it requires direct browsing (which is restricted).\n\nAction: Please Copy & Paste the text manually from ${urlInput} into this editor.`);
             setActiveTab("input");
             return;
        }
        setInput(text);
        setSourceMeta(prev => ({
            ...prev,
            ...metadata,
            title: urlInput
        }));
        setActiveTab("input");
    } catch (e: any) {
        setInput(`[SYSTEM ERROR]: URL Scraping Failed\n----------------------------------------\nError: ${e.message}`);
        setActiveTab("input");
    } finally {
        setIsScraping(false);
    }
  };

  const clearAll = () => {
    onClear();
    setFileName(null);
    setPdfFile(null);
    setPdfDiagnostics(undefined);
    setUrlInput("");
    if (setDocTypeId) setDocTypeId("");
    setSourceMeta({ title: "", author: "", year: null, language: "", source_type: "legacy_text" });
    setActiveTab("input");
  };

  const handleProcessWrapper = () => {
      onProcess({
          ...sourceMeta,
          // Inject the Document Type ID into metadata so AI Service can use it
          // @ts-ignore
          documentType: docTypeId
      }, pdfDiagnostics, customRules);
  };

  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden relative">
      <CardHeader className="pb-3 border-b bg-muted/20 shrink-0">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
                {domain === 'legal' ? <Gavel className="w-5 h-5 text-primary" /> : null}
                {domain === 'legal' ? "Document Source" : t.input_title}
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground font-normal hidden sm:inline-flex">{t.stage0}</Badge>
            </CardTitle>
            <CardDescription>{domain === 'legal' ? "Upload pleadings, affidavits, or contracts for analysis." : t.input_desc}</CardDescription>
          </div>
          {input && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
              <span className="sr-only">{t.clear}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <div 
        className="flex-1 flex flex-col min-h-0 bg-background relative overflow-hidden"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
           <div className="border-b px-4 py-2 bg-muted/10 flex justify-between items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
             <TabsList className="bg-muted/50 h-9 shrink-0">
               <TabsTrigger value="input" className="text-xs gap-2">
                 <Edit3 className="w-3.5 h-3.5" /> {t.tab_input}
               </TabsTrigger>
               <TabsTrigger value="url" className="text-xs gap-2">
                 <Globe className="w-3.5 h-3.5" /> {t.tab_url}
               </TabsTrigger>
               <TabsTrigger value="viewer" disabled={!pdfFile} className="text-xs gap-2">
                 <Eye className="w-3.5 h-3.5" /> {t.tab_viewer}
               </TabsTrigger>
             </TabsList>
             
             {/* Profile/DocType Selector */}
             {domain === 'linguistic' ? (
                <div className="flex items-center gap-2 max-w-full overflow-hidden">
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <select 
                        className="h-8 text-xs bg-background border border-input rounded-md px-2 py-0 focus:outline-none focus:ring-1 focus:ring-ring max-w-[140px] sm:max-w-[200px]"
                        value={profile}
                        onChange={(e) => setProfile(e.target.value as LanguageProfile)}
                    >
                        <option value="generic">Generic (General-Purpose)</option>
                        <option value="polysynthetic">Polysynthetic (Complex)</option>
                        <option value="analytic">Analytic / Isolating</option>
                        <option value="morphological_dense">Morphologically Dense</option>
                    </select>
                </div>
             ) : (
                 <div className="flex items-center gap-2">
                     {/* Temporal Controls */}
                     {setRefDate && refDate && (
                         <div className="flex items-center gap-2 bg-background border rounded px-2 py-1 text-xs">
                             <Calendar className="w-3 h-3 text-muted-foreground" />
                             <span className="text-muted-foreground">Filing:</span>
                             <input 
                                type="date" 
                                className="bg-transparent border-none p-0 h-auto text-xs w-24 focus:outline-none"
                                value={refDate.toISOString().split('T')[0]}
                                onChange={(e) => setRefDate(new Date(e.target.value))}
                             />
                         </div>
                     )}
                 </div>
             )}
           </div>
           
           {/* OCR Language Selector (For PDF Scans) */}
           <div className="bg-secondary/5 px-4 py-1.5 border-b border-secondary/10 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-2">
                    <Languages className="w-3 h-3 text-secondary-foreground/70 shrink-0" />
                    <span className="text-[10px] text-muted-foreground font-medium">Doc Language (for Scans):</span>
                    <select 
                        className="h-6 text-[10px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-foreground font-semibold"
                        value={ocrLang}
                        onChange={(e) => setOcrLang(e.target.value)}
                    >
                        <option value="eng">English</option>
                        <option value="chi_sim">Chinese (Simplified)</option>
                        <option value="chi_tra">Chinese (Traditional)</option>
                        <option value="ara">Arabic</option>
                        <option value="rus">Russian</option>
                        <option value="spa">Spanish</option>
                        <option value="fra">French</option>
                        <option value="hin">Hindi</option>
                        <option value="jpn">Japanese</option>
                        <option value="kor">Korean</option>
                    </select>
               </div>
               
               <div className="flex items-center gap-2">
                    {onOpenRuleEditor && domain === 'legal' && (
                        <button 
                            className="text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-2 py-0.5 rounded transition-colors flex items-center gap-1 border border-primary/20"
                            onClick={onOpenRuleEditor}
                        >
                            <Settings2 className="w-3 h-3" />
                            {customRules && customRules.length > 0 ? `${customRules.filter(r=>r.active).length} Rules Active` : "Configure Rules"}
                        </button>
                    )}
               </div>
           </div>
           
           {/* Legal Doc Type Selector Panel */}
           {domain === 'legal' && activeTab === 'input' && setDocTypeId && (
                <div className="bg-muted/5 border-b border-border px-4 py-3 shrink-0">
                    <DocumentTypeSelector 
                        value={docTypeId || ''}
                        onChange={setDocTypeId}
                        inputPreview={input}
                        apiKey={apiKey}
                    />
                </div>
           )}

           {/* Metadata Injector Panel */}
           {domain !== 'legal' && (
               <div className="bg-muted/5 border-b border-border px-4 py-2 shrink-0">
                  <div 
                    className="flex items-center justify-between cursor-pointer group"
                    onClick={() => setShowMetadata(!showMetadata)}
                  >
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>{t.metadata_label}</span>
                      </div>
                      {showMetadata ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                  </div>
                  
                  {showMetadata && (
                      <div className="mt-3 grid grid-cols-2 gap-3 pb-2 animate-in slide-in-from-top-2 duration-200">
                          <input 
                            type="text" 
                            placeholder={t.ph_title}
                            className="col-span-2 h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={sourceMeta.title || ""}
                            onChange={(e) => setSourceMeta({...sourceMeta, title: e.target.value})}
                          />
                          <input 
                            type="text" 
                            placeholder={t.ph_author}
                            className="h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={sourceMeta.author || ""}
                            onChange={(e) => setSourceMeta({...sourceMeta, author: e.target.value})}
                          />
                      </div>
                  )}
               </div>
           )}

           <div className="flex-1 relative min-h-0">
             <TabsContent value="input" className="absolute inset-0 m-0">
                <div className="relative w-full h-full group">
                  <textarea
                    className={cn(
                      "w-full h-full bg-transparent p-6 text-sm font-mono text-foreground resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground/50 whitespace-pre-wrap overflow-auto custom-scrollbar",
                      (isLoadingFile || isScraping) && "opacity-50"
                    )}
                    placeholder={isLoadingFile ? "Reading file..." : (isScraping ? "Fetching content..." : (domain === 'legal' ? "// Paste Affidavit, Brief, or Complaint here..." : "// Paste your raw IGT text here..."))}
                    value={input}
                    onChange={(e) => {
                        // Normalize line endings to LF for consistent processing across OS (Windows/Linux/Mac)
                        const normalized = e.target.value.replace(/\r\n/g, "\n");
                        setInput(normalized);
                    }}
                    spellCheck={false}
                    disabled={isLoadingFile || isScraping}
                    dir="ltr" 
                  />
                  
                  {/* Drag and Drop Overlay */}
                  {dragActive && (
                    <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                            <Upload className="w-10 h-10 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground">Drop file to ingest</h3>
                        <p className="text-sm text-muted-foreground mt-2">Supports PDF, TXT, MD, IGT</p>
                    </div>
                  )}

                  {/* Loading Overlay */}
                  {(isLoadingFile || isScraping) && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 m-2 rounded-lg">
                       <Loader2 className="w-8 h-8 text-primary mb-2 animate-spin" />
                       <p className="text-primary font-medium text-sm animate-pulse">{loadingStatus}</p>
                       {isLoadingFile && (
                           <div className="flex flex-col items-center gap-1 mt-3">
                               <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all duration-300 ease-out" 
                                    style={{ width: `${loadingProgress}%` }}
                                  />
                               </div>
                               <span className="text-xs text-muted-foreground font-mono">{loadingProgress}%</span>
                           </div>
                       )}
                    </div>
                  )}
                </div>
             </TabsContent>

             <TabsContent value="url" className="absolute inset-0 m-0 p-6 flex flex-col items-center justify-center gap-4 bg-muted/5">
                <div className="max-w-md w-full space-y-4">
                    <div className="text-center space-y-2">
                        {domain === 'legal' ? <Scale className="w-10 h-10 mx-auto text-primary/20" /> : <Globe className="w-10 h-10 mx-auto text-primary/20" />}
                        <h3 className="text-lg font-medium">{t.tab_url}</h3>
                        <p className="text-xs text-muted-foreground">
                            {domain === 'legal' 
                              ? "Scrape public court documents or case text via search." 
                              : "Import linguistic texts directly from web pages using Gemini Semantic Search."}
                        </p>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Link className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input 
                                type="url" 
                                placeholder={t.fetch_placeholder}
                                className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                disabled={isScraping}
                            />
                        </div>
                        <Button onClick={handleUrlFetch} disabled={!urlInput || isScraping || !apiKey} className="shrink-0">
                            {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : t.btn_fetch}
                        </Button>
                    </div>
                </div>
             </TabsContent>

             <TabsContent value="viewer" className="absolute inset-0 m-0">
                {pdfFile ? (
                   <PdfViewer file={pdfFile} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No PDF loaded
                  </div>
                )}
             </TabsContent>
           </div>
        </Tabs>
      </div>

      <CardFooter className="p-4 border-t bg-muted/20 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingFile || isScraping}
          >
            <Upload className="w-3.5 h-3.5 ltr:mr-2 rtl:ml-2" />
            {fileName ? (lang === 'zh-CN' ? '更改' : 'Change') : t.btn_upload}
          </Button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            accept=".txt,.md,.igt,.pdf,application/pdf,text/plain" 
          />
          
          {/* Drive Import Button */}
          {googleUser && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDriveImport}
                disabled={isLoadingFile || isScraping}
                title="Import from Google Drive"
              >
                <Database className="w-3.5 h-3.5" />
              </Button>
          )}
          
          {fileName && (
            <Badge variant="secondary" className="gap-1.5 font-normal">
              {fileName.endsWith('.pdf') ? <FileType className="w-3 h-3 text-red-400" /> : <FileText className="w-3 h-3" />}
              <span className="max-w-[100px] truncate">{fileName}</span>
            </Badge>
          )}
        </div>

        {/* Real-time Character Counter */}
        <div className="flex-1 text-center text-xs text-muted-foreground font-mono hidden sm:block animate-in fade-in">
             {input.length > 0 && `${input.length.toLocaleString()} ${t.chars_label}`}
        </div>

        <Button 
          onClick={handleProcessWrapper}
          disabled={!input.trim() || isLoadingFile || isScraping}
          className="shadow-lg shadow-primary/20"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 ltr:mr-2 rtl:ml-2", (isLoadingFile || isScraping) ? "animate-spin" : "")} />
          {domain === 'legal' ? "Analyze Pleading" : t.btn_extract}
        </Button>
      </CardFooter>
    </Card>
  );
};

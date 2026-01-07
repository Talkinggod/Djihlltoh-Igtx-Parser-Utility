
import React, { useRef, useState } from 'react';
import { Upload, FileText, X, RefreshCw, Loader2, FileType, Eye, Edit3, Settings2, BookOpen, ChevronDown, ChevronUp, Info, Globe, Link, AlertCircle, Scale, Gavel } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { scrapeUrlViaGemini } from '../services/webScraper';
import { PdfViewer } from './PdfViewer';
import { LanguageProfile, IGTXSource, UILanguage, PdfTextDiagnostics, ParserDomain } from '../types';
import { translations } from '../services/translations';

interface InputSectionProps {
  input: string;
  setInput: (val: string) => void;
  onProcess: (metadata: Partial<IGTXSource>, diagnostics?: PdfTextDiagnostics) => void;
  onClear: () => void;
  profile: LanguageProfile;
  setProfile: (val: LanguageProfile) => void;
  lang: UILanguage;
  apiKey: string;
  domain: ParserDomain;
}

export const InputSection: React.FC<InputSectionProps> = ({ 
    input, setInput, onProcess, onClear, profile, setProfile, lang, apiKey, domain
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
      // Prevent default to allow drop
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
        const { text, diagnostics } = await extractTextFromPdf(file, (percent, status) => {
          setLoadingProgress(percent);
          if (status) setLoadingStatus(status);
        });
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
    setSourceMeta({ title: "", author: "", year: null, language: "", source_type: "legacy_text" });
    setActiveTab("input");
  };

  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden relative">
      <CardHeader className="pb-3 border-b bg-muted/20">
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
        className="flex-1 flex flex-col min-h-0 bg-background relative"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
           <div className="border-b px-4 py-2 bg-muted/10 flex justify-between items-center gap-2 flex-wrap sm:flex-nowrap">
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
             
             {/* Profile Selector */}
             <div className="flex items-center gap-2 max-w-full overflow-hidden">
                <Settings2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <select 
                    className="h-8 text-xs bg-background border border-input rounded-md px-2 py-0 focus:outline-none focus:ring-1 focus:ring-ring max-w-[140px] sm:max-w-[200px]"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value as LanguageProfile)}
                >
                    {domain === 'linguistic' ? (
                        <>
                            <option value="generic">Generic (General-Purpose)</option>
                            <option value="polysynthetic">Polysynthetic (Complex)</option>
                            <option value="analytic">Analytic / Isolating</option>
                            <option value="morphological_dense">Morphologically Dense</option>
                        </>
                    ) : (
                        <>
                            <option value="legal_pleading">Court Pleading / Motion</option>
                            <option value="legal_contract">Contract / Agreement</option>
                            <option value="legal_statute">Statute / Regulation</option>
                        </>
                    )}
                </select>
             </div>
           </div>
            
           {/* Profile Disclaimer */}
           <div className="bg-primary/5 px-4 py-1.5 border-b border-primary/10 flex items-center gap-2">
                <Info className="w-3 h-3 text-primary/70 shrink-0" />
                <span className="text-[10px] text-primary/80 font-medium">
                    {domain === 'legal' 
                        ? "Legal Mode active: Optimized for finding captions, index numbers, and parties." 
                        : t.profile_disclaimer}
                </span>
           </div>

           {/* Metadata Injector Panel */}
           <div className="bg-muted/5 border-b border-border px-4 py-2">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setShowMetadata(!showMetadata)}
              >
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{domain === 'legal' ? "Docket Metadata" : t.metadata_label}</span>
                  </div>
                  {showMetadata ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              </div>
              
              {showMetadata && (
                  <div className="mt-3 grid grid-cols-2 gap-3 pb-2 animate-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text" 
                        placeholder={domain === 'legal' ? "Case Name / Title" : t.ph_title}
                        className="col-span-2 h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={sourceMeta.title || ""}
                        onChange={(e) => setSourceMeta({...sourceMeta, title: e.target.value})}
                      />
                      <input 
                        type="text" 
                        placeholder={domain === 'legal' ? "Judge / Attorney" : t.ph_author}
                        className="h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={sourceMeta.author || ""}
                        onChange={(e) => setSourceMeta({...sourceMeta, author: e.target.value})}
                      />
                  </div>
              )}
           </div>

           <div className="flex-1 relative min-h-0">
             <TabsContent value="input" className="absolute inset-0 m-0">
                <div className="relative w-full h-full group">
                  <textarea
                    className={cn(
                      "w-full h-full bg-transparent p-6 text-sm font-mono text-foreground resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground/50 whitespace-pre overflow-auto",
                      (isLoadingFile || isScraping) && "opacity-50"
                    )}
                    placeholder={isLoadingFile ? "Reading file..." : (isScraping ? "Fetching content..." : (domain === 'legal' ? "// Paste Affidavit, Brief, or Complaint here..." : "// Paste your raw IGT text here..."))}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    spellCheck={false}
                    disabled={isLoadingFile || isScraping}
                    dir="ltr" 
                  />
                  {(isLoadingFile || isScraping) && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 m-2 rounded-lg">
                       <Loader2 className="w-8 h-8 text-primary mb-2 animate-spin" />
                       <p className="text-primary font-medium text-sm animate-pulse">{loadingStatus}</p>
                       {isLoadingFile && (
                           <div className="w-48 h-1.5 bg-muted mt-3 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary transition-all duration-300 ease-out" 
                                style={{ width: `${loadingProgress}%` }}
                              />
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
          onClick={() => onProcess(sourceMeta, pdfDiagnostics)}
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

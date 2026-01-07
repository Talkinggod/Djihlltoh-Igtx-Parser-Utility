
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ParseReport, ParserDomain } from '../types';
import { generateExportContent, ExportFormat } from '../services/exportService';
import { enrichReportWithSemantics } from '../services/aiService';
import { Copy, Check, Download, AlertTriangle, Info, AlignLeft, ShieldAlert, FileJson, FileText, FileSpreadsheet, ChevronDown, FileCode, Database, Code2, Network, Braces, Cpu, Sparkles, BrainCircuit, Gavel, FileCheck, Scale, Loader2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { UILanguage } from '../types';
import { translations } from '../services/translations';

interface OutputSectionProps {
  report: ParseReport | null;
  onUpdateReport?: (report: ParseReport) => void;
  lang: UILanguage;
  apiKey: string;
  domain: ParserDomain;
}

export const OutputSection: React.FC<OutputSectionProps> = ({ report, onUpdateReport, lang, apiKey, domain }) => {
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];

  useEffect(() => {
    if (report) {
      setActiveTab("editor");
      setIsEnriching(false);
      setEnrichmentProgress(0);
    }
  }, [report?.metadata.timestamp]); 

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const jsonContent = useMemo(() => {
      if (!report) return '';
      return JSON.stringify(report.igtxDocument, null, 2);
  }, [report]);

  const handleCopy = () => {
    if (!report) return;
    const textToCopy = activeTab === "json" 
      ? jsonContent
      : report.fullExtractedText;
      
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = (format: ExportFormat) => {
    if (!report) return;
    
    const { content, type, ext } = generateExportContent(report, format);

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dziltoo-${report.metadata.profileUsed}-${report.igtxDocument.document_id.substring(0,8)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleAiEnrichment = async () => {
      if (!report || !onUpdateReport) return;
      if (!apiKey) {
          alert("Please enter a Gemini API Key in the header to use AI enrichment.");
          return;
      }
      setIsEnriching(true);
      setEnrichmentProgress(0);
      try {
          const enrichedReport = await enrichReportWithSemantics(report, apiKey, (processed, total) => {
              setEnrichmentProgress(Math.round((processed / total) * 100));
          });
          onUpdateReport(enrichedReport);
      } catch (e) {
          console.error("Enrichment failed", e);
          alert(`Enrichment failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
      } finally {
          setIsEnriching(false);
      }
  };

  const isStage2Complete = report?.igtxDocument.blocks.some(b => 
      domain === 'legal' ? b.legal_state?.parties?.length && b.legal_state.parties.length > 0 : b.semantic_state?.predicate !== null
  );

  if (!report) {
    return (
      <Card className="h-full border-border border-dashed bg-muted/10 shadow-none">
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-border">
            {domain === 'legal' ? <Scale className="w-8 h-8 opacity-50" /> : <AlignLeft className="w-8 h-8 opacity-50" />}
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">{t.ready_title}</h3>
          <p className="text-sm max-w-xs text-muted-foreground">
            {domain === 'legal' ? "Upload a legal document to extract docket info and clauses." : t.ready_desc}
          </p>
        </div>
      </Card>
    );
  }

  const averageConfidence = report.stats.averageConfidence;
  
  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b bg-muted/20 px-4 py-2 flex items-center justify-between shrink-0">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="editor">{t.tab_clean}</TabsTrigger>
            <TabsTrigger value="report">{t.tab_pipeline}</TabsTrigger>
            <TabsTrigger value="json">{t.tab_schema}</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <div className="relative" ref={exportMenuRef}>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowExportMenu(!showExportMenu)} 
                    className="gap-2 px-3 h-9 text-muted-foreground hover:text-foreground"
                    title="Export Options"
                >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">{t.export_btn}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
                {showExportMenu && (
                     <div className="absolute right-0 rtl:left-0 rtl:right-auto top-full mt-1 w-48 rounded-md border bg-popover p-1 shadow-md animate-in fade-in zoom-in-95 z-50 bg-background">
                         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scientific</div>
                         <button onClick={() => handleExport('json')} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground hover:bg-muted hover:text-foreground text-left rtl:text-right transition-colors">
                             <FileJson className="w-4 h-4 text-orange-500/80" /> IGTX (JSON)
                         </button>
                         {domain === 'linguistic' && (
                           <button onClick={() => handleExport('latex')} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground hover:bg-muted hover:text-foreground text-left rtl:text-right transition-colors">
                               <Code2 className="w-4 h-4 text-purple-500/80" /> LaTeX (gb4e)
                           </button>
                         )}
                         
                         <div className="my-1 border-t border-muted" />
                         <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</div>
                         
                         <button onClick={() => handleExport('txt')} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground hover:bg-muted hover:text-foreground text-left rtl:text-right transition-colors">
                             <FileText className="w-4 h-4 text-blue-500/80" /> Plain Text
                         </button>
                         <button onClick={() => handleExport('csv')} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-popover-foreground hover:bg-muted hover:text-foreground text-left rtl:text-right transition-colors">
                             <FileSpreadsheet className="w-4 h-4 text-emerald-500/80" /> CSV
                         </button>
                     </div>
                )}
            </div>
            
            <Button variant="ghost" size="icon" onClick={handleCopy} title={t.copy_btn}>
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-background relative custom-scrollbar">
          <TabsContent value="editor" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-sm text-foreground whitespace-pre leading-relaxed" dir="ltr">
              {report.fullExtractedText}
            </pre>
          </TabsContent>

          <TabsContent value="json" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-xs text-primary/80 whitespace-pre" dir="ltr">
              {jsonContent}
            </pre>
          </TabsContent>

          <TabsContent value="report" className="min-h-full mt-0 p-6 space-y-6">
             {/* Header Info */}
             <div className="flex flex-col gap-4">
                 <div className="bg-muted/10 border border-muted/30 rounded-lg p-3 text-xs font-mono text-muted-foreground flex justify-between items-center">
                    <div className="flex gap-4">
                        <span>Profile: <span className="text-foreground font-semibold uppercase">{report.metadata.profileUsed}</span></span>
                        <span>Mode: <span className="text-foreground uppercase">{domain}</span></span>
                    </div>
                    <div className="flex gap-2 items-center">
                        <span className="opacity-60">ID:</span>
                        <code className="bg-background px-1.5 py-0.5 rounded border border-border text-primary font-bold">
                            {report.igtxDocument.document_id.substring(0, 8)}...
                        </code>
                    </div>
                 </div>
                 
                 {report.metadata.tier4Assessment?.requiresTier4 && (
                   <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex flex-col gap-3">
                     <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <div>
                           <p className="text-sm font-semibold text-amber-500 mb-1">
                               {domain === 'legal' ? "Legal Structure Detected" : t.tier4_alert}
                           </p>
                           <p className="text-xs text-muted-foreground">{report.metadata.tier4Assessment.recommendedAction}.</p>
                        </div>
                     </div>
                   </div>
                 )}
             </div>

             {/* Pipeline Visualizer */}
             <div className="relative">
                 <div className="absolute left-6 rtl:right-6 rtl:left-auto top-6 bottom-6 w-0.5 bg-border/50"></div>
                 <div className="space-y-8 relative">
                    
                    {/* Stage 1 Node */}
                    <div className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center shrink-0 z-10 bg-background">
                            <Braces className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 pt-1">
                            <h4 className="text-sm font-semibold">Stage 1: {domain === 'legal' ? "Structure Parsing" : "Canonicalization"}</h4>
                            <div className="grid grid-cols-2 gap-3 mb-2 mt-2">
                                <Card className="bg-muted/10 border-border shadow-none">
                                    <CardContent className="p-3">
                                        <div className="text-[10px] font-medium text-muted-foreground uppercase mb-1">{t.stats_items}</div>
                                        <div className="text-xl font-bold font-mono text-foreground">{report.stats.extractedLines}</div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>

                    {/* Stage 2 Node */}
                    <div className={cn("flex gap-4 items-start transition-opacity duration-500", isStage2Complete ? "opacity-100" : "opacity-80")}>
                         <div className={cn("w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-background transition-colors", isStage2Complete ? "border-purple-500 bg-purple-500/10 text-purple-500" : "border-muted-foreground/30 bg-muted text-muted-foreground")}>
                            {isEnriching ? <Loader2 className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
                         </div>
                         <div className="flex-1 pt-1">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                                Stage 2: {domain === 'legal' ? "Entity Extraction" : "Semantic State"}
                                {isStage2Complete && <Badge variant="outline" className="text-[10px] text-purple-500 border-purple-500/30">ENRICHED</Badge>}
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                                {isStage2Complete 
                                  ? `AI has extracted ${domain === 'legal' ? "parties and legal points" : "predicates and arguments"}.` 
                                  : "Ready to extract metadata via Gemini."}
                            </p>
                            
                            {!isStage2Complete && !isEnriching && (
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="gap-2 text-xs border-purple-500/30 hover:bg-purple-500/5 hover:text-purple-500 text-muted-foreground"
                                    onClick={handleAiEnrichment}
                                    disabled={!onUpdateReport}
                                >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    {domain === 'legal' ? "Extract Parties" : "Enrich (AI)"}
                                </Button>
                            )}

                            {isEnriching && (
                                <div className="space-y-2 mt-2">
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>Processing blocks...</span>
                                        <span>{enrichmentProgress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${enrichmentProgress}%` }} />
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>

                 </div>
             </div>

             <div>
               <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                 <AlignLeft className="w-4 h-4" /> Extraction Log
               </h4>
               <div className="space-y-3">
                  {report.blocks.map((block) => (
                    <div key={block.id} className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors group">
                       <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">Ln {block.lineNumber}</Badge>
                              {(block.semantic_state?.provenance || block.legal_state?.provenance) && (
                                  <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-600 bg-purple-500/5 gap-1">
                                      <BrainCircuit className="w-3 h-3" /> AI
                                  </Badge>
                              )}
                          </div>
                          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground ltr:ml-2 rtl:mr-2">#{block.id.split('-')[1].substring(0,6)}</Badge>
                       </div>
                       
                       <div className="text-sm font-medium text-primary mb-2 font-mono break-words bg-primary/5 p-2 rounded overflow-x-auto whitespace-pre" dir="ltr">
                         {block.extractedLanguageLine}
                       </div>

                        {/* Semantic State Display (Linguistic) */}
                        {block.semantic_state?.predicate && domain === 'linguistic' && (
                            <div className="mt-3 bg-muted/30 p-2 rounded text-xs font-mono border border-border/50">
                                <div className="grid grid-cols-[60px_1fr] gap-1">
                                    <span className="text-muted-foreground">PRED:</span>
                                    <span className="text-foreground font-semibold">{block.semantic_state.predicate}</span>
                                    <span className="text-muted-foreground">ARGS:</span>
                                    <span className="text-muted-foreground">[{block.semantic_state.arguments?.join(', ')}]</span>
                                </div>
                            </div>
                        )}

                        {/* Legal State Display */}
                        {block.legal_state && domain === 'legal' && (
                             <div className="mt-3 bg-muted/30 p-2 rounded text-xs font-mono border border-border/50 space-y-2">
                                {block.legal_state.case_meta.index_number && (
                                    <div className="flex items-center gap-2 text-emerald-600">
                                        <FileCheck className="w-3 h-3" />
                                        <span className="font-semibold">INDEX: {block.legal_state.case_meta.index_number}</span>
                                    </div>
                                )}
                                {block.legal_state.parties.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {block.legal_state.parties.map((p, i) => (
                                            <Badge key={i} variant="outline" className="text-[9px] bg-background border-primary/20">
                                                {p.role.toUpperCase()}: {p.name}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                                {block.legal_state.legal_points.length > 0 && (
                                    <ul className="list-disc pl-4 text-muted-foreground">
                                        {block.legal_state.legal_points.map((pt, i) => <li key={i}>{pt}</li>)}
                                    </ul>
                                )}
                             </div>
                        )}
                    </div>
                  ))}
               </div>
             </div>
          </TabsContent>
        </div>

        <div className="border-t bg-muted/20 px-4 py-2 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {report.blocks.length} blocks | {domain} mode
          </span>
        </div>
      </Tabs>
    </Card>
  );
};

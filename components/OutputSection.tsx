
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ParseReport, ParserDomain } from '../types';
import { generateExportContent, ExportFormat } from '../services/exportService';
import { enrichReportWithSemantics } from '../services/aiService';
import { Copy, Check, Download, AlertTriangle, Info, AlignLeft, ShieldAlert, FileJson, FileText, FileSpreadsheet, ChevronDown, FileCode, Database, Code2, Network, Braces, Cpu, Sparkles, BrainCircuit, Gavel, FileCheck, Scale, Loader2, FileWarning, Search, ExternalLink, GitBranch, AlertCircle, Bookmark, ClipboardCheck, Siren, Bomb, Star, Shield, Flag, Clock } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { UILanguage } from '../types';
import { translations } from '../services/translations';
import { TimelineView } from './TimelineView';

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
            {domain === 'legal' && <TabsTrigger value="timeline" className="flex items-center gap-1"><Clock className="w-3 h-3"/> Timeline</TabsTrigger>}
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

          <TabsContent value="json" className="min-h-full mt-0 p-6 custom-scrollbar">
            <pre className="font-mono text-xs text-primary/80 whitespace-pre" dir="ltr">
              {jsonContent}
            </pre>
          </TabsContent>

          {domain === 'legal' && (
              <TabsContent value="timeline" className="min-h-full mt-0 p-0">
                  <TimelineView dates={report.timeline || []} />
              </TabsContent>
          )}

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
             </div>

             {/* Custom Extraction Results */}
             {report.customExtractions && report.customExtractions.length > 0 && (
                 <div className="space-y-3">
                     <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                         <RegexIcon className="w-4 h-4 text-primary" /> Rule-Based Extractions
                     </h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         {report.customExtractions.map((ex, i) => (
                             <div key={i} className="bg-background border p-3 rounded-md shadow-sm">
                                 <div className="flex justify-between items-center mb-1">
                                     <Badge variant="outline" className="text-[10px] font-bold uppercase">{ex.ruleName}</Badge>
                                     <span className="text-[9px] text-muted-foreground font-mono">@{ex.index}</span>
                                 </div>
                                 <div className="text-sm font-semibold text-primary">{ex.match}</div>
                                 <div className="text-xs text-muted-foreground mt-1 truncate">"...{ex.context}..."</div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}

             {/* Extraction Log */}
             <div>
               <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                 <AlignLeft className="w-4 h-4" /> Extraction Log
               </h4>
               <div className="space-y-3">
                  {report.blocks.map((block) => {
                    const analysis = block.legal_state?.contract_analysis;
                    const hasHighRisk = analysis?.risks?.some(r => r.severity === 'critical' || r.severity === 'high');
                    const hasFavorable = analysis?.risks?.some(r => r.impact === 'favorable');
                    
                    return (
                    <div key={block.id} className={cn(
                        "p-4 bg-card rounded-lg border transition-colors group relative overflow-hidden",
                        hasHighRisk ? "border-red-500/30 bg-red-500/5" : (hasFavorable ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:border-primary/50")
                    )}>
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
                       
                       <div className="text-sm font-medium text-primary mb-2 font-mono break-words bg-primary/5 p-2 rounded overflow-x-auto whitespace-pre custom-scrollbar" dir="ltr">
                         {block.extractedLanguageLine}
                       </div>
                    </div>
                  )})}
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

function RegexIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 17h16M4 20h16M7 15h2M13 15h2M7 15l2-2M13 15l2-2M17 4v10M13 4l4 4M21 8l-4-4"/></svg>
    );
}

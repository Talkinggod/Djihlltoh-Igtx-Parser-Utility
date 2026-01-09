
import React, { useState } from 'react';
import { LegalBenchTaskType, LegalBenchResult, StoredDocument, LegalAnalysisResult } from '../types';
import { runLegalBenchTask } from '../services/aiService';
import { LegalAnalyzer } from '../services/legalAnalyzer';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Loader2, Gavel, FileCheck, Scale, AlertCircle, BookOpen, Search, ArrowRight, ShieldCheck, HelpCircle, Landmark, UserMinus, FileText, Quote, AlertTriangle, List, DollarSign, Bug, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface LegalBenchToolsProps {
    apiKey: string;
    inputText?: string; // Text to analyze
    allDocuments?: StoredDocument[];
}

export const LegalBenchTools: React.FC<LegalBenchToolsProps> = ({ apiKey, inputText, allDocuments }) => {
    const [activeTask, setActiveTask] = useState<string>('contract_nli');
    const [analysisText, setAnalysisText] = useState(inputText || "");
    const [hypothesis, setHypothesis] = useState("");
    const [context, setContext] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<LegalBenchResult | null>(null);
    
    // Anomaly State
    const [anomalyResult, setAnomalyResult] = useState<LegalAnalysisResult | null>(null);

    const handleRun = async () => {
        if (!apiKey && activeTask !== 'anomaly_scan') {
            alert("API Key required.");
            return;
        }
        if (!analysisText.trim()) {
            alert("Please provide text to analyze.");
            return;
        }

        setLoading(true);
        setResult(null);
        setAnomalyResult(null);

        try {
            if (activeTask === 'anomaly_scan') {
                // Heuristic Analysis (Local)
                const analyzer = new LegalAnalyzer();
                const res = analyzer.analyze({
                    id: 'current-doc',
                    content: analysisText,
                    documentType: 'unknown'
                }, allDocuments);
                setAnomalyResult(res);
            } else {
                // AI Analysis
                const res = await runLegalBenchTask(activeTask as LegalBenchTaskType, { 
                    text: analysisText, 
                    hypothesis: activeTask === 'contract_nli' || activeTask === 'rule_application' || activeTask === 'citation_retrieval' ? hypothesis : undefined,
                    context: activeTask === 'hearsay' || activeTask === 'abercrombie' ? context : undefined
                }, apiKey);
                setResult(res);
            }
        } catch (e: any) {
            alert("Analysis failed: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto p-4 custom-scrollbar space-y-6">
            <div className="bg-gradient-to-r from-indigo-900/10 to-purple-900/10 border border-indigo-500/20 rounded-lg p-4 flex items-start gap-4">
                <div className="p-2 bg-background rounded-full border shadow-sm">
                    <Scale className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-foreground">Pro Sei Pro Deep Analysis</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                        Powered by logic from the <strong>LegalBench</strong>, <strong>LexGLUE</strong>, and <strong>BigLaw</strong> datasets. 
                        Select a specialized tool below.
                    </p>
                </div>
            </div>

            <Tabs value={activeTask} onValueChange={(v) => { setActiveTask(v); setResult(null); setAnomalyResult(null); }} className="space-y-4">
                <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto h-10">
                    <TabsTrigger value="contract_nli" className="gap-2 text-xs"><FileCheck className="w-3.5 h-3.5" /> Contract Logic</TabsTrigger>
                    
                    {/* Contract Review Group */}
                    <div className="w-px h-4 bg-border mx-1 shrink-0" />
                    <TabsTrigger value="cuad_extraction" className="gap-2 text-xs"><FileText className="w-3.5 h-3.5" /> CUAD Scan</TabsTrigger>
                    <TabsTrigger value="unfair_tos" className="gap-2 text-xs text-amber-600"><AlertTriangle className="w-3.5 h-3.5" /> Unfair Terms</TabsTrigger>
                    <TabsTrigger value="anomaly_scan" className="gap-2 text-xs text-red-600 font-medium"><Bug className="w-3.5 h-3.5" /> Anomaly Detector</TabsTrigger>
                    
                    {/* Research Group */}
                    <div className="w-px h-4 bg-border mx-1 shrink-0" />
                    <TabsTrigger value="citation_retrieval" className="gap-2 text-xs"><Quote className="w-3.5 h-3.5" /> Exact Citation</TabsTrigger>
                    <TabsTrigger value="hearsay" className="gap-2 text-xs"><Gavel className="w-3.5 h-3.5" /> Hearsay Check</TabsTrigger>
                    <TabsTrigger value="rule_application" className="gap-2 text-xs"><BookOpen className="w-3.5 h-3.5" /> Rule App</TabsTrigger>
                </TabsList>

                {/* INPUT AREA */}
                <div className="grid gap-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase text-muted-foreground">
                            {activeTask === 'contract_nli' || activeTask === 'cuad_extraction' || activeTask === 'spa_extraction' ? "Contract Clause / Agreement Text" : 
                             activeTask === 'unfair_tos' ? "Terms of Service / EULA Text" :
                             activeTask === 'anomaly_scan' ? "Legal Document Text (Full)" :
                             activeTask === 'hearsay' ? "Evidence Statement" : 
                             activeTask === 'case_hold' ? "Case Text / Summary" :
                             activeTask === 'proa' ? "Statute Text" :
                             activeTask === 'citation_retrieval' ? "Document Corpus" :
                             activeTask === 'abercrombie' ? "Mark / Term" : "Facts / Scenario"}
                        </label>
                        <textarea 
                            className="w-full bg-background border rounded-md p-3 text-sm min-h-[100px] focus:ring-1 focus:ring-primary outline-none resize-none"
                            placeholder="Paste text here..."
                            value={analysisText}
                            onChange={(e) => setAnalysisText(e.target.value)}
                        />
                    </div>

                    {(activeTask === 'contract_nli' || activeTask === 'rule_application' || activeTask === 'citation_retrieval') && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1">
                                <HelpCircle className="w-3 h-3" />
                                {activeTask === 'contract_nli' ? "Hypothesis / Question" : 
                                 activeTask === 'citation_retrieval' ? "Search Query (Returns exact spans)" : "Issue to Analyze"}
                            </label>
                            <input 
                                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                placeholder={activeTask === 'contract_nli' ? "e.g. I am allowed to sublet without permission." : activeTask === 'citation_retrieval' ? "Find clause about termination..." : "e.g. Does this constitute constructive eviction?"}
                                value={hypothesis}
                                onChange={(e) => setHypothesis(e.target.value)}
                            />
                        </div>
                    )}

                    {(activeTask === 'hearsay' || activeTask === 'abercrombie') && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Context / Goods</label>
                            <input 
                                className="w-full bg-background border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                placeholder={activeTask === 'hearsay' ? "e.g. Said by witness during deposition..." : "e.g. Apparel, Software..."}
                                value={context}
                                onChange={(e) => setContext(e.target.value)}
                            />
                        </div>
                    )}

                    <Button onClick={handleRun} disabled={loading} className="w-full sm:w-auto self-end">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                        {activeTask === 'anomaly_scan' ? 'Run Heuristic Check' : 'Run Analysis'}
                    </Button>
                </div>
            </Tabs>

            {/* AI RESULTS AREA */}
            {result && (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                    <Card className="border-primary/20 bg-card overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b py-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    Analysis Result
                                    <Badge variant="outline" className="ml-2 uppercase text-[10px] tracking-wider">{result.task.replace(/_/g, ' ')}</Badge>
                                </CardTitle>
                                <div className="text-xs text-muted-foreground font-mono">
                                    Confidence: {(result.confidence * 100).toFixed(0)}%
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-4">
                            {result.conclusion && (
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "text-lg font-black px-4 py-2 rounded border uppercase tracking-wide",
                                        result.conclusion.toLowerCase().includes('inadmissible') || result.conclusion.toLowerCase().includes('contradiction') || result.conclusion.toLowerCase().includes('no proa') ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                        result.conclusion.toLowerCase().includes('admissible') || result.conclusion.toLowerCase().includes('entailment') || result.conclusion.toLowerCase().includes('proa exists') ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                        "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                    )}>
                                        {result.conclusion}
                                    </div>
                                    {activeTask === 'contract_nli' && (
                                        <span className="text-xs text-muted-foreground flex items-center">
                                            <ArrowRight className="w-3 h-3 mx-1" />
                                            Relation to text
                                        </span>
                                    )}
                                </div>
                            )}

                            {result.extracted_clauses && result.extracted_clauses.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">
                                        {activeTask === 'cuad_extraction' ? "Detected CUAD Clauses" : 
                                         activeTask === 'unfair_tos' ? "Unfair Terms Identified" :
                                         activeTask === 'spa_extraction' ? "Deal Points" :
                                         "Retrieved Citations"}
                                    </h4>
                                    {result.extracted_clauses.map((clause, i) => (
                                        <div key={i} className="bg-muted/10 border p-3 rounded-md">
                                            <div className="text-[10px] font-bold text-primary uppercase mb-1">{clause.type}</div>
                                            <div className="text-sm font-mono text-foreground/90 whitespace-pre-wrap">{clause.text}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {result.reasoning && (
                                <div className="bg-muted/10 p-3 rounded-md text-sm leading-relaxed border border-border">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Reasoning</h4>
                                    {result.reasoning}
                                </div>
                            )}

                            {result.citations && result.citations.length > 0 && (
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold uppercase text-muted-foreground">Cited Authority</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {result.citations.map((cite, i) => (
                                            <Badge key={i} variant="secondary" className="text-[10px] font-mono">
                                                {cite}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ANOMALY RESULTS AREA */}
            {anomalyResult && (
                <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
                    {/* Violations */}
                    {anomalyResult.violations.length > 0 ? (
                        <Card className="border-red-500/30 bg-red-500/5">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-bold text-red-600 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" /> Detected Anomalies ({anomalyResult.violations.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {anomalyResult.violations.map((v, i) => (
                                    <div key={i} className={cn("p-3 rounded border text-sm", v.severity === 'critical' ? "bg-red-100 dark:bg-red-900/30 border-red-500/50" : "bg-background border-border")}>
                                        <div className="font-bold uppercase text-[10px] mb-1 flex justify-between">
                                            <span>{v.constraintId}</span>
                                            <Badge variant="outline" className={cn("text-[9px]", v.severity === 'critical' ? "bg-red-500 text-white border-none" : "border-foreground/20")}>{v.severity}</Badge>
                                        </div>
                                        <p>{v.description}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3 text-emerald-600">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-medium text-sm">No critical temporal or signature anomalies detected.</span>
                        </div>
                    )}

                    {/* Timeline */}
                    <Card>
                        <CardHeader className="pb-2 bg-muted/20">
                            <CardTitle className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Extracted Timeline
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {anomalyResult.dates.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">No dates found.</div>}
                            <div className="divide-y">
                                {anomalyResult.dates.map((d, i) => (
                                    <div key={i} className="flex gap-4 p-3 hover:bg-muted/10">
                                        <div className="w-24 text-xs font-mono font-semibold text-foreground/70 shrink-0">
                                            {d.date.toLocaleDateString()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="secondary" className="text-[9px] uppercase">{d.type}</Badge>
                                                <span className="text-xs font-mono text-muted-foreground bg-muted px-1 rounded">{d.text}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate italic">"...{d.context}..."</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Signatures */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                            <CardHeader className="pb-2 py-3">
                                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Signatures Found</CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 space-y-2">
                                {anomalyResult.signatures.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                                {anomalyResult.signatures.map((s, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs border p-2 rounded bg-muted/10">
                                        <span className="font-semibold">{s.party}</span>
                                        {s.date && <span className="font-mono text-muted-foreground">{s.date.toLocaleDateString()}</span>}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2 py-3">
                                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Document Refs</CardTitle>
                            </CardHeader>
                            <CardContent className="p-3 space-y-2">
                                {anomalyResult.references.length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                                {anomalyResult.references.slice(0, 5).map((r, i) => (
                                    <div key={i} className="text-xs border-b last:border-0 pb-1 mb-1">
                                        <div className="font-medium truncate">{r.text}</div>
                                        {r.documentType && <span className="text-[9px] text-muted-foreground bg-muted px-1 rounded">{r.documentType}</span>}
                                    </div>
                                ))}
                                {anomalyResult.references.length > 5 && <div className="text-[10px] text-muted-foreground italic">...and {anomalyResult.references.length - 5} more</div>}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    );
};

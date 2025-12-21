import React, { useState, useEffect } from 'react';
import { ParseReport, ViewMode } from '../types';
import { Copy, Check, Download, AlertTriangle, Info, AlignLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface OutputSectionProps {
  report: ParseReport | null;
}

export const OutputSection: React.FC<OutputSectionProps> = ({ report }) => {
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (report) {
      // Default to analysis or editor based on needs, sticking to editor for now
      setActiveTab("editor");
    }
  }, [report]);

  const handleCopy = () => {
    if (!report) return;
    const textToCopy = activeTab === "json" 
      ? JSON.stringify(report, null, 2) 
      : report.fullExtractedText;
      
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dziltoo-extraction-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <Card className="h-full border-border border-dashed bg-muted/10 shadow-none">
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-border">
            <AlignLeft className="w-8 h-8 opacity-50" />
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">Ready to Extract</h3>
          <p className="text-sm max-w-xs text-muted-foreground">
            Import interlinear gloss text to begin the deterministic extraction process.
          </p>
        </div>
      </Card>
    );
  }

  const averageConfidence = report.stats.averageConfidence;
  let confidenceVariant: "success" | "warning" | "destructive" = "destructive";
  if (averageConfidence > 0.8) confidenceVariant = "success";
  else if (averageConfidence > 0.5) confidenceVariant = "warning";

  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b bg-muted/20 px-4 py-2 flex items-center justify-between shrink-0">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="editor">Clean Text</TabsTrigger>
            <TabsTrigger value="report">Analysis</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={handleDownload} title="Export JSON">
              <Download className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy Content">
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-background relative custom-scrollbar">
          <TabsContent value="editor" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {report.fullExtractedText}
            </pre>
          </TabsContent>

          <TabsContent value="json" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-xs text-primary/80 whitespace-pre-wrap">
              {JSON.stringify(report, null, 2)}
            </pre>
          </TabsContent>

          <TabsContent value="report" className="min-h-full mt-0 p-6 space-y-6">
             {/* Stats Grid */}
             <div className="grid grid-cols-2 gap-4">
                <Card className="bg-muted/10 border-border">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Confidence Score</div>
                    <div className={cn("text-3xl font-bold font-mono tracking-tight", {
                      "text-emerald-500": averageConfidence > 0.8,
                      "text-amber-500": averageConfidence > 0.5 && averageConfidence <= 0.8,
                      "text-red-500": averageConfidence <= 0.5
                    })}>
                      {(averageConfidence * 100).toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/10 border-border">
                  <CardContent className="p-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Extraction Rate</div>
                    <div className="text-3xl font-bold font-mono text-foreground">
                      {report.stats.extractedLines} <span className="text-sm text-muted-foreground font-normal">/ {report.stats.totalLines} lines</span>
                    </div>
                  </CardContent>
                </Card>
             </div>

             {/* Line Breakdown */}
             <div>
               <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                 <AlignLeft className="w-4 h-4" /> Extraction Log
               </h4>
               <div className="space-y-3">
                  {report.blocks.map((block) => (
                    <div key={block.id} className="p-4 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors group">
                       <div className="flex justify-between items-start mb-3">
                          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">Ln {block.lineNumber}</Badge>
                          <Badge 
                            variant={block.confidence > 0.8 ? 'success' : 'warning'} 
                            className="text-[10px]"
                          >
                            {Math.floor(block.confidence * 100)}%
                          </Badge>
                       </div>
                       
                       <div className="text-sm font-medium text-primary mb-2 font-mono break-words bg-primary/5 p-2 rounded">
                         {block.extractedLanguageLine}
                       </div>
                       
                       <div className="text-xs text-muted-foreground italic pl-2 border-l-2 border-muted">
                         {block.rawSource}
                       </div>

                       {block.warnings.length > 0 && (
                         <div className="mt-3 flex gap-2 flex-wrap">
                           {block.warnings.map((w, i) => (
                             <Badge key={i} variant="outline" className="text-[10px] text-amber-500/80 border-amber-500/20 bg-amber-500/10 gap-1 pl-1">
                               <AlertTriangle className="w-3 h-3" /> {w}
                             </Badge>
                           ))}
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
            {report.blocks.length} blocks extracted
          </span>
          {averageConfidence < 0.6 && (
             <span className="flex items-center gap-1.5 text-[10px] text-amber-500 font-medium">
               <Info className="w-3 h-3" />
               Manual review suggested
             </span>
          )}
        </div>
      </Tabs>
    </Card>
  );
};
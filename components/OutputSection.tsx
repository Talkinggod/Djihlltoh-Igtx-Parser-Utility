
import React, { useState, useEffect, useMemo } from 'react';
import { ParseReport, ParserDomain } from '../types';
import { PhysicsDashboard } from './PhysicsDashboard';
import { TimelineView } from './TimelineView';
import { LegalAnalyzer } from '../services/legalAnalyzer';
import { Copy, Check, Binary, Layout, FileText, FileJson, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
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
  const t = translations[lang];

  useEffect(() => {
    if (report) setActiveTab("editor");
  }, [report?.metadata.timestamp]); 

  const handleCopy = () => {
    if (!report) return;
    const textToCopy = activeTab === "json" ? JSON.stringify(report, null, 2) : report.fullExtractedText;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract dates for Timeline View
  const extractedDates = useMemo(() => {
      if (!report?.fullExtractedText) return [];
      try {
          const analyzer = new LegalAnalyzer();
          // We assume 'unknown' doc type for visualization purposes if not present in metadata
          const result = analyzer.analyze({ 
              id: 'viz', 
              content: report.fullExtractedText, 
              documentType: report.metadata.documentType || 'unknown' 
          });
          return result.dates;
      } catch (e) {
          console.error("Timeline extraction failed", e);
          return [];
      }
  }, [report?.fullExtractedText, report?.metadata.documentType]);

  if (!report) {
    return (
      <Card className="h-full border-border border-dashed bg-muted/10 shadow-none">
        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <Layout className="w-16 h-16 opacity-10 mb-4" />
          <h3 className="text-xl font-medium text-foreground mb-2">Architectural Observer Idle</h3>
          <p className="text-sm max-w-xs text-muted-foreground">Load a linguistic object to observe its semantic gravity and control transformations.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden bg-card">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b bg-muted/20 px-4 py-2 flex items-center justify-between shrink-0">
          <TabsList className="bg-muted/50 h-8">
            <TabsTrigger value="editor" className="text-xs">{t.tab_clean}</TabsTrigger>
            <TabsTrigger value="timeline" className="gap-2 text-xs">
                <Calendar className="w-3 h-3" /> Timeline
            </TabsTrigger>
            <TabsTrigger value="physics" className="gap-2 text-xs">
                <Binary className="w-3 h-3" /> Architecture
            </TabsTrigger>
            <TabsTrigger value="json" className="text-xs">IGTX Schema</TabsTrigger>
          </TabsList>

          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-background relative custom-scrollbar">
          <TabsContent value="editor" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-sm text-foreground whitespace-pre-wrap leading-relaxed" dir="ltr">
              {report.fullExtractedText}
            </pre>
          </TabsContent>

          <TabsContent value="timeline" className="min-h-full mt-0">
             <TimelineView dates={extractedDates} />
          </TabsContent>

          <TabsContent value="physics" className="min-h-full mt-0">
             <PhysicsDashboard 
                physics={report.metadata.twoLayerState.physics}
                control={report.metadata.twoLayerState.control}
                curve={report.coherenceCurve}
             />
          </TabsContent>

          <TabsContent value="json" className="min-h-full mt-0 p-6">
            <pre className="font-mono text-[11px] text-primary/80 whitespace-pre" dir="ltr">
              {JSON.stringify(report, null, 2)}
            </pre>
          </TabsContent>
        </div>

        <div className="border-t bg-muted/20 px-4 py-1.5 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {report.blocks.length} segments | Hash: {report.metadata.provenanceHash.slice(0, 8)}
          </span>
          {report.metadata.twoLayerState.physics.is_admissible && (
              <Badge variant="outline" className="text-[9px] bg-emerald-500/5 text-emerald-600 border-emerald-500/20 py-0 h-5">
                  Admissible Object
              </Badge>
          )}
        </div>
      </Tabs>
    </Card>
  );
};

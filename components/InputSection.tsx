
import React, { useRef, useState } from 'react';
import { Upload, Edit3, Settings2, BookOpen, Zap, Loader2, FileText, Info, Image as ImageIcon } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { analyzeImage } from '../services/aiService';
import { LanguageProfile, IGTXSource, UILanguage, PdfTextDiagnostics, ParserDomain, GoogleUser, CustomRule } from '../types';
import { translations } from '../services/translations';
import { DocumentTypeSelector } from './DocumentTypeSelector';

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
  googleUser?: GoogleUser;
  lambdaControl: number;
  setLambdaControl: (val: number) => void;
  // Added props to align with CaseWorkspace usage
  docTypeId?: string;
  setDocTypeId?: (id: string) => void;
  refDate?: Date;
  setRefDate?: (d: Date) => void;
  customRules?: CustomRule[];
  onOpenRuleEditor?: () => void;
}

export const InputSection: React.FC<InputSectionProps> = ({ 
    input, setInput, onProcess, onClear, profile, setProfile, lang, apiKey, domain,
    googleUser, lambdaControl, setLambdaControl,
    docTypeId, setDocTypeId, refDate, setRefDate, customRules, onOpenRuleEditor
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const t = translations[lang];

  const handleFileChange = async (file: File) => {
    setIsLoadingFile(true);
    setFileName(file.name);
    try {
        if (file.type === 'application/pdf') {
            const res = await extractTextFromPdf(file);
            setInput(res.text);
        } else if (file.type.startsWith('image/')) {
            if (!apiKey) {
                alert("Please enter your Gemini API Key to analyze images.");
                return;
            }
            const analysis = await analyzeImage(file, apiKey);
            setInput(analysis);
        } else {
            const text = await file.text();
            setInput(text);
        }
    } catch (e: any) {
        console.error("File Processing Error:", e);
        let msg = e.message || "Unknown error";
        
        // Friendly Error Mapping
        if (msg.includes("SECURE_PDF")) {
            msg = "This PDF is password protected. Please remove the password protection (e.g. 'Print to PDF') and try uploading again.";
        } else if (msg.includes("CORRUPTED_PDF")) {
            msg = "The file appears to be corrupted or not a valid PDF document.";
        } else if (msg.includes("EMPTY_PDF")) {
            msg = "The PDF file appears to be empty.";
        } else if (msg.includes("OCR_ENGINE_ERROR")) {
            msg = "OCR Engine Failed: The system could not initialize the text recognition engine. This usually happens due to network restrictions blocking the language model download. Please check your internet connection.";
        } else if (msg.includes("ENGINE_LOAD_ERROR")) {
            msg = "Could not load the PDF Processing Engine. Check your internet connection (PDF.js script failed to load).";
        }
        
        alert(`Failed to process ${file.name}:\n\n${msg}`);
        setFileName(null);
    } finally {
        setIsLoadingFile(false);
    }
  };

  return (
    <Card className="flex flex-col h-full border-border shadow-md overflow-hidden relative bg-card">
      <CardHeader className="pb-3 border-b bg-muted/20 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
              <BookOpen className="w-5 h-5 text-primary" />
              Artifact Ingestion
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider ml-2 bg-background">Physics Layer</Badge>
          </CardTitle>
        </div>
      </CardHeader>

      <div className="flex-1 flex flex-col min-h-0 relative">
        <div className="border-b px-4 py-2 bg-muted/10 flex justify-between items-center gap-2 shrink-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-3">
             <div className="flex flex-col items-start gap-1">
                <label className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> λ_control: {lambdaControl.toFixed(2)}
                </label>
                <input 
                    type="range" min="0" max="1" step="0.05"
                    value={lambdaControl}
                    onChange={(e) => setLambdaControl(parseFloat(e.target.value))}
                    className="w-32 h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
                />
             </div>
          </div>
          
          <select 
              className="h-8 text-[11px] font-bold bg-background border rounded px-2 uppercase tracking-tight focus:ring-1 focus:ring-primary outline-none"
              value={profile}
              onChange={(e) => setProfile(e.target.value as LanguageProfile)}
          >
              <option value="generic">Baseline Calibration</option>
              <option value="legal_statute">Statute (λ ≈ 0.0)</option>
              <option value="legal_pleading">Pleading (λ ≤ 0.04)</option>
              <option value="narrative">Narrative (λ ≥ 0.06)</option>
          </select>
        </div>

        {domain === 'legal' && setDocTypeId && (
            <div className="px-4 py-2 border-b bg-muted/5">
                <DocumentTypeSelector 
                    value={docTypeId || ""} 
                    onChange={setDocTypeId} 
                    inputPreview={input} 
                    apiKey={apiKey}
                />
            </div>
        )}

        {isLoadingFile && (
            <div className="absolute inset-0 bg-background/50 z-10 flex items-center justify-center backdrop-blur-sm">
                <div className="bg-card border p-4 rounded-lg shadow-xl flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm font-semibold">Processing Artifact...</span>
                </div>
            </div>
        )}

        <textarea
            className="flex-1 w-full bg-transparent p-6 text-sm font-mono text-foreground resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground/30 whitespace-pre-wrap overflow-auto custom-scrollbar"
            placeholder="// Enter linguistic object, upload PDF, or attach image for structural measurement..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
        />
      </div>

      <CardFooter className="p-4 border-t bg-muted/20 flex items-center justify-between gap-4 shrink-0">
        <Button 
          variant="outline" 
          size="sm"
          className="text-xs font-bold uppercase h-9"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoadingFile}
        >
          {isLoadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Upload className="w-3.5 h-3.5 mr-2" />}
          Upload Artifact
        </Button>
        <input 
            type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.jpg,.jpeg,.png,.webp"
            onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        />

        <Button 
          onClick={() => onProcess({ title: fileName || "Artifact Scan" })}
          disabled={!input.trim()}
          className="bg-primary text-primary-foreground font-black uppercase tracking-tighter h-10 px-8 hover:opacity-90 shadow-lg shadow-primary/10"
        >
          Measure Object λ
        </Button>
      </CardFooter>
    </Card>
  );
};

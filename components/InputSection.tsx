
import React, { useRef, useState } from 'react';
import { Upload, Edit3, Settings2, BookOpen, Zap, Loader2, FileText, Info, Image as ImageIcon, ChevronDown, Server, Cpu, Mic } from 'lucide-react';
import { Card, CardHeader, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';
import { ConverterService } from '../services/converterService';
import { analyzeImage } from '../services/aiService';
import { DoctorService } from '../services/doctorService';
import { useApi } from '../contexts/ApiContext';
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
  const [loadingStatus, setLoadingStatus] = useState("Processing Artifact...");
  const [extractionSource, setExtractionSource] = useState<'local' | 'doctor' | 'neural' | null>(null);
  const { apiSettings } = useApi();
  const t = translations[lang];

  const handleFileChange = async (file: File) => {
    setIsLoadingFile(true);
    setLoadingStatus("Analyzing File Type...");
    setFileName(file.name);
    setExtractionSource(null);
    
    try {
        let extractedText = "";
        let usedDoctor = false;

        // 1. Audio Special Handling (Always Local Neural)
        if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i)) {
             setExtractionSource('neural');
             setLoadingStatus("Initializing Neural Audio Engine...");
             extractedText = await ConverterService.convertAudioToText(file, (status) => setLoadingStatus(status));
             usedDoctor = true; // Skip doctor logic for audio
        }

        // 2. Try Doctor Service (if enabled and not audio)
        if (!usedDoctor && apiSettings.doctor.enabled && apiSettings.doctor.endpoint) {
            try {
                setLoadingStatus("Contacting Doctor Service...");
                console.log("Attempting extraction via Doctor service...");
                const response = await DoctorService.extractDocument(file, apiSettings.doctor.endpoint, apiSettings.doctor.token);
                // Doctor extraction response handling
                if (response && response.content) {
                    extractedText = response.content;
                    usedDoctor = true;
                    setExtractionSource('doctor');
                } else if (typeof response === 'string') {
                    extractedText = response;
                    usedDoctor = true;
                    setExtractionSource('doctor');
                }
            } catch (err) {
                console.warn("Doctor extraction failed, falling back to local engine:", err);
                // Continue to local fallback
            }
        }

        // 3. Local Fallback (if Doctor skipped or failed)
        if (!usedDoctor && !extractionSource) {
            setExtractionSource('local');
            
            // Image Special Handling: Prefer Gemini Vision if API key exists, otherwise local Tesseract
            if (file.type.startsWith('image/')) {
                if (apiKey) {
                    setLoadingStatus("Analyzing Image via Gemini Vision...");
                    extractedText = await analyzeImage(file, apiKey);
                } else {
                    setLoadingStatus("Running Local OCR (Tesseract)...");
                    extractedText = await ConverterService.convertImageToText(file, 'eng', (status) => setLoadingStatus(status));
                }
            } else {
                // Use Universal Client Converter (PDF, DOCX, Text)
                extractedText = await ConverterService.smartExtract(file, (status) => setLoadingStatus(status));
            }
        }

        if (input.trim()) {
            // If text already exists, append
            if (confirm("Append new content to existing text?")) {
                setInput(input + "\n\n" + extractedText);
            } else {
                setInput(extractedText);
            }
        } else {
            setInput(extractedText);
        }

    } catch (e: any) {
        console.error("File Processing Error:", e);
        let msg = e.message || "Unknown error";
        
        // Friendly Error Mapping
        if (msg.includes("SECURE_PDF")) {
            msg = "This PDF is password protected. Please remove the password protection (e.g. 'Print to PDF') and try uploading again.";
        } else if (msg.includes("CORRUPTED_PDF")) {
            msg = "The file appears to be corrupted or not a valid PDF document.";
        } else if (msg.includes("OCR_ENGINE_ERROR")) {
            msg = "OCR Engine Failed: The system could not initialize the text recognition engine. This usually happens due to network restrictions blocking the language model download.";
        } else if (msg.includes("Doctor Service Error")) {
            msg = `Doctor Service Error: Ensure the Doctor container is running at ${apiSettings.doctor.endpoint}.`;
        }
        
        alert(`Failed to process ${file.name}:\n\n${msg}`);
        setFileName(null);
    } finally {
        setIsLoadingFile(false);
        setLoadingStatus("Processing Artifact...");
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
          
          {extractionSource === 'neural' ? (
              <Badge variant="default" className="text-[9px] gap-1 bg-purple-600">
                  <Mic className="w-3 h-3" /> Neural Audio
              </Badge>
          ) : apiSettings.doctor.enabled ? (
              <Badge variant={extractionSource === 'doctor' ? 'default' : 'outline'} className={cn("text-[9px] gap-1", extractionSource === 'doctor' ? "bg-emerald-600" : "text-muted-foreground")}>
                  <Server className="w-3 h-3" /> {extractionSource === 'doctor' ? 'Doctor Active' : 'Doctor Ready'}
              </Badge>
          ) : (
              <Badge variant="outline" className="text-[9px] gap-1 text-muted-foreground">
                  <Cpu className="w-3 h-3" /> Client-Side Converters
              </Badge>
          )}
        </div>
      </CardHeader>

      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Improved Calibration Toolbar */}
        <div className="border-b px-4 py-3 bg-muted/10 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <div className="flex items-center gap-3 bg-background/50 px-3 py-1.5 rounded-full border shadow-sm">
             <div className="flex items-center gap-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 min-w-[80px] select-none">
                    <Zap className="w-3 h-3 text-amber-500" /> 
                    <span className="font-mono text-foreground">λ: {lambdaControl.toFixed(2)}</span>
                </label>
                <input 
                    type="range" min="0" max="1" step="0.05"
                    value={lambdaControl}
                    onChange={(e) => setLambdaControl(parseFloat(e.target.value))}
                    className="w-24 md:w-32 h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
                    title="Control Transformation Aggressiveness (Lambda)"
                />
             </div>
          </div>
          
          <div className="relative group">
              <select 
                  className="h-8 text-xs font-semibold bg-background border border-input rounded-md pl-3 pr-8 shadow-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none cursor-pointer appearance-none transition-all hover:border-primary/50 w-full min-w-[160px]"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value as LanguageProfile)}
              >
                  <option value="generic">Baseline Calibration</option>
                  <option value="legal_statute">Statute (λ ≈ 0.0)</option>
                  <option value="legal_pleading">Pleading (λ ≤ 0.04)</option>
                  <option value="narrative">Narrative (λ ≥ 0.06)</option>
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground group-hover:text-primary transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
              </div>
          </div>
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
                <div className="bg-card border p-4 rounded-lg shadow-xl flex flex-col items-center gap-3 animate-in fade-in zoom-in-95">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <div className="text-center">
                        <span className="text-sm font-semibold block">{loadingStatus}</span>
                        {extractionSource === 'neural' && (
                            <span className="text-[10px] text-muted-foreground mt-1 block max-w-[200px]">
                                Downloading Whisper (40MB) to browser... run once only.
                            </span>
                        )}
                    </div>
                </div>
            </div>
        )}

        <textarea
            className="flex-1 w-full bg-transparent p-6 text-sm font-mono text-foreground resize-none focus:outline-none leading-relaxed placeholder:text-muted-foreground/30 whitespace-pre-wrap overflow-auto custom-scrollbar"
            placeholder="// Enter linguistic object, upload PDF/DOCX/Audio, or attach evidence for structural measurement..."
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
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,.doc,.docx,.rtf,.mp3,.wav,.m4a,.ogg,.flac"
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

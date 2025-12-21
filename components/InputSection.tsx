import React, { useRef, useState } from 'react';
import { Upload, FileText, X, RefreshCw, Loader2, FileType } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { extractTextFromPdf } from '../services/pdfExtractor';

interface InputSectionProps {
  input: string;
  setInput: (val: string) => void;
  onProcess: () => void;
  onClear: () => void;
}

export const InputSection: React.FC<InputSectionProps> = ({ input, setInput, onProcess, onClear }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    
    // Reset states
    setIsLoadingFile(true);
    setLoadingProgress(0);

    try {
      if (file.type === "application/pdf" || file.name.endsWith('.pdf')) {
        // PDF Handling
        const text = await extractTextFromPdf(file, (percent) => {
          setLoadingProgress(percent);
        });
        setInput(text);
      } else if (file.type === "text/plain" || file.name.endsWith('.md') || file.name.endsWith('.igt') || file.name.endsWith('.txt')) {
        // Text Handling
        const reader = new FileReader();
        reader.onload = (e) => {
          if (typeof e.target?.result === 'string') {
            setInput(e.target.result);
          }
          setIsLoadingFile(false);
        };
        reader.readAsText(file);
        return; // Return here as readAsText is async via callback
      } else {
        // Fallback
        setInput(`[SYSTEM WARNING]: Unsupported file type (${file.type}).\n\nPlease use .pdf, .txt, or .igt files.`);
      }
    } catch (e: any) {
      console.error(e);
      setInput(`[SYSTEM ERROR]: Failed to read file.\n${e.message || 'Unknown error'}`);
    } finally {
      setIsLoadingFile(false);
    }
  };

  return (
    <Card className="flex flex-col h-full border-border shadow-md">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Input Source</CardTitle>
            <CardDescription>Raw gloss text or PDF upload</CardDescription>
          </div>
          {input && (
            <Button variant="ghost" size="sm" onClick={onClear} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Clear</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <div className="flex-1 relative group bg-background">
        <textarea
          className={cn(
            "w-full h-full bg-transparent p-6 text-sm font-mono text-foreground resize-none focus:outline-none leading-relaxed custom-scrollbar placeholder:text-muted-foreground/50",
            (dragActive || isLoadingFile) && "opacity-50"
          )}
          placeholder={isLoadingFile ? "Reading file..." : "// Paste your raw IGT text here...\n// Or drag and drop a PDF/text file.\n\nExample:\n10.2 ’Áádę́ę́’ ’áá ’áá1 there adv =dę́ę́’..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          spellCheck={false}
          disabled={isLoadingFile}
        />
        
        {dragActive && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary flex flex-col items-center justify-center pointer-events-none z-10 m-2 rounded-lg">
             <Upload className="w-10 h-10 text-primary mb-2 animate-bounce" />
             <p className="text-primary font-medium">Drop file to load content</p>
          </div>
        )}

        {isLoadingFile && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 m-2 rounded-lg">
             <Loader2 className="w-8 h-8 text-primary mb-2 animate-spin" />
             <p className="text-primary font-medium text-sm">Parsing PDF...</p>
             {loadingProgress > 0 && (
               <p className="text-muted-foreground text-xs mt-1">{loadingProgress}%</p>
             )}
          </div>
        )}
      </div>

      <CardFooter className="p-4 border-t bg-muted/20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingFile}
          >
            <Upload className="w-3.5 h-3.5 mr-2" />
            {fileName ? 'Change' : 'Upload'}
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

        <Button 
          onClick={onProcess}
          disabled={!input.trim() || isLoadingFile}
          className="shadow-lg shadow-primary/20"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoadingFile ? "animate-spin" : "")} />
          Extract
        </Button>
      </CardFooter>
    </Card>
  );
};
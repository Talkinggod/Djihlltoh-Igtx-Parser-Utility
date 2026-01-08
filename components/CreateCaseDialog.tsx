
import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Gavel, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { extractTextFromPdf } from '../services/pdfExtractor';
import { extractCaseInitialMetadata } from '../services/igtxParser';
import { CaseMetadata, CaseType } from '../types';

interface CreateCaseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (name: string, meta: CaseMetadata, initialDoc?: { name: string, content: string }) => void;
}

export const CreateCaseDialog: React.FC<CreateCaseDialogProps> = ({ isOpen, onClose, onCreate }) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [caseName, setCaseName] = useState("");
    const [meta, setMeta] = useState<CaseMetadata>({
        type: 'Civil',
        jurisdiction: '',
        plaintiffs: [''],
        defendants: [''],
        indexNumber: ''
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [initialDoc, setInitialDoc] = useState<{ name: string, content: string } | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileUpload = async (file: File) => {
        setIsProcessing(true);
        try {
            let text = "";
            if (file.type === 'application/pdf') {
                const result = await extractTextFromPdf(file);
                text = result.text;
            } else {
                text = await file.text();
            }

            // Auto-extract metadata
            const extracted = extractCaseInitialMetadata(text);
            
            setMeta({
                ...extracted,
                plaintiffs: extracted.plaintiffs.length ? extracted.plaintiffs : [''],
                defendants: extracted.defendants.length ? extracted.defendants : ['']
            });

            // Set default name
            if (extracted.plaintiffs[0] && extracted.defendants[0]) {
                setCaseName(`${extracted.plaintiffs[0]} v. ${extracted.defendants[0]}`);
            } else {
                setCaseName(file.name.replace(/\.[^/.]+$/, ""));
            }

            setInitialDoc({
                name: file.name,
                content: text
            });
            setStep(2);
        } catch (e) {
            console.error(e);
            alert("Failed to parse document");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSubmit = () => {
        if (!caseName) return;
        onCreate(caseName, meta, initialDoc);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
            <Card className="w-full max-w-lg border-primary/20 shadow-2xl bg-card">
                <div className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Gavel className="w-5 h-5 text-primary" />
                        Create New Case
                    </h2>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                <div className="p-6">
                    {step === 1 ? (
                        <div className="space-y-6">
                            <div 
                                className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/5 transition-colors cursor-pointer group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                    {isProcessing ? <Loader2 className="w-6 h-6 text-primary animate-spin" /> : <Upload className="w-6 h-6 text-primary" />}
                                </div>
                                <h3 className="font-semibold text-foreground">Ingest Commencing Document</h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                    Upload a Complaint, Petition, or Notice to auto-fill case details.
                                </p>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept=".pdf,.txt" 
                                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                />
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-card px-2 text-muted-foreground">Or start blank</span>
                                </div>
                            </div>

                            <Button variant="outline" className="w-full" onClick={() => setStep(2)}>
                                Skip Ingestion & Create Manually
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Case Name</label>
                                <input 
                                    className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="e.g. Smith v. Jones"
                                    value={caseName}
                                    onChange={(e) => setCaseName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Type</label>
                                    <select 
                                        className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm outline-none"
                                        value={meta.type}
                                        onChange={(e) => setMeta({...meta, type: e.target.value as CaseType})}
                                    >
                                        <option value="Civil">Civil</option>
                                        <option value="LT">Landlord/Tenant</option>
                                        <option value="Federal">Federal</option>
                                        <option value="Small Claims">Small Claims</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Index No</label>
                                    <input 
                                        className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm outline-none"
                                        placeholder="12345/2024"
                                        value={meta.indexNumber}
                                        onChange={(e) => setMeta({...meta, indexNumber: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Jurisdiction / Court</label>
                                <input 
                                    className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm outline-none"
                                    placeholder="Supreme Court, New York County"
                                    value={meta.jurisdiction}
                                    onChange={(e) => setMeta({...meta, jurisdiction: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Plaintiff</label>
                                    <input 
                                        className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm outline-none"
                                        value={meta.plaintiffs[0]}
                                        onChange={(e) => setMeta({...meta, plaintiffs: [e.target.value]})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Defendant</label>
                                    <input 
                                        className="w-full bg-muted/30 border rounded-md px-3 py-2 text-sm outline-none"
                                        value={meta.defendants[0]}
                                        onChange={(e) => setMeta({...meta, defendants: [e.target.value]})}
                                    />
                                </div>
                            </div>

                            <Button className="w-full mt-4" onClick={handleSubmit} disabled={!caseName}>
                                <Check className="w-4 h-4 mr-2" />
                                Create Case File
                            </Button>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

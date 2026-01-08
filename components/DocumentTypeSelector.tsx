
import React, { useState, useEffect } from 'react';
import { Combobox } from './ui/combobox';
import { DocumentTypeDefinition } from '../types';
import { DocumentTypeService } from '../services/documentTypeService';
import { DocumentTypeAdvisor } from '../services/documentTypeAdvisor';
import { Card, CardHeader, CardContent } from './ui/card';
import { AlertCircle, Clock, CheckCircle2, Zap, BrainCircuit, Loader2 } from 'lucide-react';
import { Badge } from './ui/badge';

interface DocumentTypeSelectorProps {
    value: string;
    onChange: (value: string) => void;
    inputPreview?: string;
    apiKey: string;
}

export const DocumentTypeSelector: React.FC<DocumentTypeSelectorProps> = ({ value, onChange, inputPreview, apiKey }) => {
    const [types, setTypes] = useState<DocumentTypeDefinition[]>(DocumentTypeService.getAll());
    const [definition, setDefinition] = useState<DocumentTypeDefinition | undefined>(undefined);
    const [isGenerating, setIsGenerating] = useState(false);

    // Initial Load & Sync
    useEffect(() => {
        setTypes(DocumentTypeService.getAll());
    }, []);

    // Update definition when value changes
    useEffect(() => {
        const def = DocumentTypeService.getById(value);
        setDefinition(def);
    }, [value, types]);

    // Auto-detect from input text if no value selected
    useEffect(() => {
        if (!value && inputPreview) {
            const detectedId = DocumentTypeService.detectType(inputPreview);
            if (detectedId) {
                onChange(detectedId);
            }
        }
    }, [inputPreview, value, onChange]);

    const handleCreate = async (label: string) => {
        setIsGenerating(true);
        // Optimistic create
        const tempId = label.toLowerCase().replace(/\s+/g, '_');
        
        let newDef: DocumentTypeDefinition;

        if (apiKey) {
            // Intelligent Generation via AI
            newDef = await DocumentTypeAdvisor.generateDefinitionForNewType(label, apiKey);
        } else {
            // Manual fallback
            newDef = {
                id: tempId,
                name: label,
                category: 'other',
                description: 'Custom user document type',
                actions: [],
                deadlines: [],
                relatedMotions: [],
                strategies: [],
                isUserDefined: true
            };
        }
        
        DocumentTypeService.addCustomType(newDef);
        setTypes(DocumentTypeService.getAll()); // Refresh list
        onChange(newDef.id);
        setIsGenerating(false);
    };

    const advice = definition ? DocumentTypeAdvisor.getAdvice(definition) : null;

    return (
        <div className="space-y-4 animate-in slide-in-from-top-2">
            <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                    DOC TYPE CLASSIFICATION
                    {isGenerating && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                </label>
                <Combobox 
                    options={types.map(t => ({ value: t.id, label: t.name }))}
                    value={value}
                    onChange={onChange}
                    onCreate={handleCreate}
                    placeholder="Select or Create Document Type..."
                    className="w-full"
                />
            </div>

            {advice && (
                <Card className="bg-muted/10 border-primary/10 shadow-sm overflow-hidden">
                    <CardHeader className="p-3 bg-muted/20 border-b border-border/50">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-background text-[10px] uppercase tracking-wider">{definition?.category}</Badge>
                                <span className="text-xs font-bold text-foreground">{definition?.name}</span>
                            </div>
                            {definition?.isUserDefined && <Badge variant="secondary" className="text-[9px]">Custom</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{definition?.description}</p>
                    </CardHeader>
                    
                    <CardContent className="p-3 space-y-3">
                        {/* Critical Alerts */}
                        {advice.criticalAlerts.length > 0 && (
                            <div className="space-y-1">
                                {advice.criticalAlerts.map((alert, i) => (
                                    <div key={i} className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 p-2 rounded-md border border-amber-500/20">
                                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                        <span>{alert}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions & Strategies */}
                        {advice.suggestedActions.length > 0 && (
                            <div className="space-y-1">
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> Recommended Actions
                                </div>
                                <ul className="space-y-1">
                                    {advice.suggestedActions.map((action, i) => (
                                        <li key={i} className="text-xs flex items-center gap-2 text-foreground/80 pl-1">
                                            <div className="w-1 h-1 rounded-full bg-primary/50" />
                                            {action}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Deadlines */}
                        {definition?.deadlines && definition.deadlines.length > 0 && (
                             <div className="grid grid-cols-2 gap-2 mt-2">
                                 {definition.deadlines.map((dl, i) => (
                                     <div key={i} className="bg-background border rounded p-2 text-[10px] flex flex-col">
                                         <span className="font-semibold text-foreground flex items-center gap-1">
                                             <Clock className="w-3 h-3 text-muted-foreground" /> {dl.duration}
                                         </span>
                                         <span className="text-muted-foreground">after {dl.trigger}</span>
                                     </div>
                                 ))}
                             </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

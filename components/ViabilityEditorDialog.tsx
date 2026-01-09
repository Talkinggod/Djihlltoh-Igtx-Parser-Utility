import React, { useState, useEffect } from 'react';
import { ViabilityAssessment, ViabilityFactor } from '../types';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { X, Plus, Trash2, Save, RefreshCw, Target, Shield, Scale, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Card } from './ui/card';
import { cn } from '../lib/utils';

interface ViabilityEditorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    assessment: ViabilityAssessment;
    onSave: (updated: ViabilityAssessment) => void;
}

export const ViabilityEditorDialog: React.FC<ViabilityEditorDialogProps> = ({ 
    isOpen, onClose, assessment, onSave 
}) => {
    const [localAssessment, setLocalAssessment] = useState<ViabilityAssessment>(assessment);
    const [newFactorName, setNewFactorName] = useState("");
    const [newEquityText, setNewEquityText] = useState("");
    const [activeTab, setActiveTab] = useState("overview");

    // Sync when opening
    useEffect(() => {
        if (isOpen) {
            setLocalAssessment(JSON.parse(JSON.stringify(assessment)));
            setActiveTab("overview");
        }
    }, [isOpen, assessment]);

    const handleSave = () => {
        onSave({
            ...localAssessment,
            generated_at: new Date().toISOString() // Update timestamp to show manual edit
        });
        onClose();
    };

    const updateFactor = (index: number, updates: Partial<ViabilityFactor>) => {
        const newFactors = [...localAssessment.factors];
        newFactors[index] = { ...newFactors[index], ...updates };
        setLocalAssessment({ ...localAssessment, factors: newFactors });
    };

    const updateFactorArrayItem = (factorIndex: number, type: 'key_strengths' | 'key_weaknesses', itemIndex: number, val: string) => {
        const newFactors = [...localAssessment.factors];
        const newArray = [...newFactors[factorIndex][type]];
        newArray[itemIndex] = val;
        newFactors[factorIndex] = { ...newFactors[factorIndex], [type]: newArray };
        setLocalAssessment({ ...localAssessment, factors: newFactors });
    };

    const addFactorArrayItem = (factorIndex: number, type: 'key_strengths' | 'key_weaknesses') => {
        const newFactors = [...localAssessment.factors];
        newFactors[factorIndex] = { 
            ...newFactors[factorIndex], 
            [type]: [...newFactors[factorIndex][type], ""] 
        };
        setLocalAssessment({ ...localAssessment, factors: newFactors });
    };

    const removeFactorArrayItem = (factorIndex: number, type: 'key_strengths' | 'key_weaknesses', itemIndex: number) => {
        const newFactors = [...localAssessment.factors];
        const newArray = [...newFactors[factorIndex][type]];
        newArray.splice(itemIndex, 1);
        newFactors[factorIndex] = { ...newFactors[factorIndex], [type]: newArray };
        setLocalAssessment({ ...localAssessment, factors: newFactors });
    };

    const addFactor = () => {
        if (!newFactorName.trim()) return;
        const newFactor: ViabilityFactor = {
            category: newFactorName.trim().toLowerCase().replace(/\s+/g, '_'),
            score: 50,
            rationale: "Manually added factor based on experience.",
            key_strengths: [],
            key_weaknesses: []
        };
        setLocalAssessment({ ...localAssessment, factors: [...localAssessment.factors, newFactor] });
        setNewFactorName("");
    };

    const removeFactor = (index: number) => {
        const newFactors = [...localAssessment.factors];
        newFactors.splice(index, 1);
        setLocalAssessment({ ...localAssessment, factors: newFactors });
    };

    const addEquity = (side: 'plaintiff' | 'defendant') => {
        if (!newEquityText.trim()) return;
        if (side === 'plaintiff') {
            setLocalAssessment({
                ...localAssessment,
                balance_of_equities: {
                    ...localAssessment.balance_of_equities,
                    plaintiff_equities: [...localAssessment.balance_of_equities.plaintiff_equities, newEquityText]
                }
            });
        } else {
            setLocalAssessment({
                ...localAssessment,
                balance_of_equities: {
                    ...localAssessment.balance_of_equities,
                    defendant_equities: [...localAssessment.balance_of_equities.defendant_equities, newEquityText]
                }
            });
        }
        setNewEquityText("");
    };

    const removeEquity = (side: 'plaintiff' | 'defendant', index: number) => {
        if (side === 'plaintiff') {
            const list = [...localAssessment.balance_of_equities.plaintiff_equities];
            list.splice(index, 1);
            setLocalAssessment({
                ...localAssessment,
                balance_of_equities: { ...localAssessment.balance_of_equities, plaintiff_equities: list }
            });
        } else {
            const list = [...localAssessment.balance_of_equities.defendant_equities];
            list.splice(index, 1);
            setLocalAssessment({
                ...localAssessment,
                balance_of_equities: { ...localAssessment.balance_of_equities, defendant_equities: list }
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
            <Card className="w-[95vw] max-w-5xl h-[90vh] bg-card border shadow-xl flex flex-col overflow-hidden">
                <div className="h-14 border-b px-6 flex items-center justify-between bg-muted/20 shrink-0">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <RefreshCw className="w-5 h-5 text-primary" />
                        Fine-Tune Assessment Strategy
                    </h2>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} className="gap-2">
                            <Save className="w-4 h-4" /> Save Changes
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <div className="px-6 pt-4 shrink-0">
                            <TabsList>
                                <TabsTrigger value="overview" className="gap-2"><Target className="w-4 h-4"/> Overview</TabsTrigger>
                                <TabsTrigger value="merits" className="gap-2"><Scale className="w-4 h-4"/> Factors & Merits</TabsTrigger>
                                <TabsTrigger value="equities" className="gap-2"><Shield className="w-4 h-4"/> Equities</TabsTrigger>
                            </TabsList>
                        </div>

                        {/* OVERVIEW TAB */}
                        <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-4">
                                <label className="text-sm font-bold uppercase text-muted-foreground block">
                                    Win Probability Estimate
                                </label>
                                <div className="flex items-center gap-4 bg-muted/10 p-4 rounded-lg border">
                                    <div className={cn(
                                        "text-4xl font-black tabular-nums w-24 text-center",
                                        localAssessment.overall_probability >= 70 ? "text-emerald-500" : localAssessment.overall_probability >= 40 ? "text-amber-500" : "text-red-500"
                                    )}>
                                        {localAssessment.overall_probability}%
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                        value={localAssessment.overall_probability}
                                        onChange={(e) => setLocalAssessment({...localAssessment, overall_probability: parseInt(e.target.value)})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 flex-1 flex flex-col">
                                <label className="text-sm font-bold uppercase text-muted-foreground block">
                                    Executive Summary
                                </label>
                                <textarea 
                                    className="w-full min-h-[300px] flex-1 bg-background border rounded-lg p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
                                    value={localAssessment.executive_summary}
                                    onChange={(e) => setLocalAssessment({...localAssessment, executive_summary: e.target.value})}
                                />
                            </div>
                        </TabsContent>

                        {/* MERITS / FACTORS TAB */}
                        <TabsContent value="merits" className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="grid gap-6">
                                {localAssessment.factors.map((factor, idx) => (
                                    <div key={idx} className="border rounded-lg p-4 bg-background shadow-sm">
                                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-dashed">
                                            <span className="text-sm font-bold uppercase bg-muted px-2 py-1 rounded">
                                                {factor.category.replace(/_/g, ' ')}
                                            </span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm font-mono font-bold w-8 text-right">{factor.score}</span>
                                                <input 
                                                    type="range" 
                                                    className="w-32 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                                                    value={factor.score}
                                                    onChange={(e) => updateFactor(idx, { score: parseInt(e.target.value) })}
                                                />
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => removeFactor(idx)}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Rationale</label>
                                                <textarea 
                                                    className="w-full bg-muted/10 border rounded p-2 text-xs h-16 resize-none focus:outline-none focus:border-primary"
                                                    value={factor.rationale}
                                                    onChange={(e) => updateFactor(idx, { rationale: e.target.value })}
                                                    placeholder="Rationale..."
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {/* Strengths */}
                                                <div className="bg-emerald-500/5 p-3 rounded-md border border-emerald-500/20">
                                                    <label className="text-[10px] font-bold text-emerald-600 uppercase mb-2 flex items-center justify-between">
                                                        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3"/> Strengths</span>
                                                        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => addFactorArrayItem(idx, 'key_strengths')}><Plus className="w-3 h-3" /></Button>
                                                    </label>
                                                    <div className="space-y-1.5">
                                                        {factor.key_strengths.map((s, sIdx) => (
                                                            <div key={sIdx} className="flex gap-1">
                                                                <input 
                                                                    className="text-xs bg-background border rounded px-2 py-1 flex-1 focus:outline-none focus:border-emerald-500"
                                                                    value={s} 
                                                                    onChange={(e) => updateFactorArrayItem(idx, 'key_strengths', sIdx, e.target.value)}
                                                                    placeholder="Add strength..."
                                                                />
                                                                <button className="text-muted-foreground hover:text-destructive px-1" onClick={() => removeFactorArrayItem(idx, 'key_strengths', sIdx)}><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                        {factor.key_strengths.length === 0 && <span className="text-[10px] text-muted-foreground italic pl-1">No specific strengths listed.</span>}
                                                    </div>
                                                </div>

                                                {/* Weaknesses */}
                                                <div className="bg-red-500/5 p-3 rounded-md border border-red-500/20">
                                                    <label className="text-[10px] font-bold text-red-600 uppercase mb-2 flex items-center justify-between">
                                                        <span className="flex items-center gap-1"><ThumbsDown className="w-3 h-3"/> Weaknesses</span>
                                                        <Button size="icon" variant="ghost" className="h-4 w-4" onClick={() => addFactorArrayItem(idx, 'key_weaknesses')}><Plus className="w-3 h-3" /></Button>
                                                    </label>
                                                    <div className="space-y-1.5">
                                                        {factor.key_weaknesses.map((w, wIdx) => (
                                                            <div key={wIdx} className="flex gap-1">
                                                                <input 
                                                                    className="text-xs bg-background border rounded px-2 py-1 flex-1 focus:outline-none focus:border-red-500"
                                                                    value={w} 
                                                                    onChange={(e) => updateFactorArrayItem(idx, 'key_weaknesses', wIdx, e.target.value)}
                                                                    placeholder="Add weakness..."
                                                                />
                                                                <button className="text-muted-foreground hover:text-destructive px-1" onClick={() => removeFactorArrayItem(idx, 'key_weaknesses', wIdx)}><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                        {factor.key_weaknesses.length === 0 && <span className="text-[10px] text-muted-foreground italic pl-1">No specific weaknesses listed.</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Custom Factor */}
                            <div className="flex items-center gap-2 p-4 bg-muted/20 border-t border-dashed mt-4 rounded-lg">
                                <input 
                                    className="flex-1 bg-background border rounded px-3 py-2 text-sm focus:outline-none"
                                    placeholder="Enter custom factor name (e.g. 'Client Credibility')"
                                    value={newFactorName}
                                    onChange={(e) => setNewFactorName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addFactor()}
                                />
                                <Button onClick={addFactor} disabled={!newFactorName.trim()}>
                                    <Plus className="w-4 h-4 mr-2" /> Add Factor
                                </Button>
                            </div>
                        </TabsContent>

                        {/* EQUITIES TAB */}
                        <TabsContent value="equities" className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-2 gap-6 h-full">
                                {/* Plaintiff Column */}
                                <div className="flex flex-col border rounded-lg bg-emerald-500/5 h-full">
                                    <div className="p-3 border-b bg-emerald-500/10 font-bold text-emerald-700 text-sm flex items-center gap-2">
                                        <Shield className="w-4 h-4" /> Plaintiff Equities
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                        {localAssessment.balance_of_equities.plaintiff_equities.map((eq, i) => (
                                            <div key={i} className="flex gap-2 text-sm bg-background/50 p-2 rounded border group">
                                                <span className="flex-1">{eq}</span>
                                                <button onClick={() => removeEquity('plaintiff', i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-3 border-t bg-background/50 flex gap-2">
                                        <input 
                                            className="flex-1 bg-background border rounded px-2 py-1 text-xs focus:outline-none"
                                            placeholder="Add point..."
                                            value={newEquityText}
                                            onChange={(e) => setNewEquityText(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addEquity('plaintiff')}
                                        />
                                        <Button size="sm" variant="ghost" onClick={() => addEquity('plaintiff')}><Plus className="w-4 h-4"/></Button>
                                    </div>
                                </div>

                                {/* Defendant Column */}
                                <div className="flex flex-col border rounded-lg bg-amber-500/5 h-full">
                                    <div className="p-3 border-b bg-amber-500/10 font-bold text-amber-700 text-sm flex items-center gap-2">
                                        <Shield className="w-4 h-4" /> Defendant Equities
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                        {localAssessment.balance_of_equities.defendant_equities.map((eq, i) => (
                                            <div key={i} className="flex gap-2 text-sm bg-background/50 p-2 rounded border group">
                                                <span className="flex-1">{eq}</span>
                                                <button onClick={() => removeEquity('defendant', i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-3 border-t bg-background/50 flex gap-2">
                                        <input 
                                            className="flex-1 bg-background border rounded px-2 py-1 text-xs focus:outline-none"
                                            placeholder="Add point..."
                                            value={newEquityText}
                                            onChange={(e) => setNewEquityText(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addEquity('defendant')}
                                        />
                                        <Button size="sm" variant="ghost" onClick={() => addEquity('defendant')}><Plus className="w-4 h-4"/></Button>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-4 space-y-2">
                                <label className="text-sm font-bold uppercase text-muted-foreground">Conclusion / Balancing Test</label>
                                <textarea 
                                    className="w-full h-24 bg-background border rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                    value={localAssessment.balance_of_equities.conclusion}
                                    onChange={(e) => setLocalAssessment({
                                        ...localAssessment, 
                                        balance_of_equities: { ...localAssessment.balance_of_equities, conclusion: e.target.value }
                                    })}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </Card>
        </div>
    );
};

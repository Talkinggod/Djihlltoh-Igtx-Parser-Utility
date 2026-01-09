
import React, { useState } from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { CustomRule } from '../types';
import { Plus, Trash2, Save, Regex, AlertCircle, Play, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface RuleEditorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    rules: CustomRule[];
    onSaveRules: (rules: CustomRule[]) => void;
    testContent?: string;
}

export const RuleEditorDialog: React.FC<RuleEditorDialogProps> = ({ isOpen, onClose, rules, onSaveRules, testContent = "" }) => {
    const [localRules, setLocalRules] = useState<CustomRule[]>(rules);
    const [testMatches, setTestMatches] = useState<Record<string, string[]>>({});

    const handleAddRule = () => {
        const newRule: CustomRule = {
            id: Date.now().toString(),
            name: "New Rule",
            pattern: "",
            active: true,
            color: "blue"
        };
        setLocalRules([...localRules, newRule]);
    };

    const handleUpdateRule = (id: string, updates: Partial<CustomRule>) => {
        setLocalRules(localRules.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const handleDeleteRule = (id: string) => {
        setLocalRules(localRules.filter(r => r.id !== id));
    };

    const handleSave = () => {
        onSaveRules(localRules);
        onClose();
    };

    const runTest = (rule: CustomRule) => {
        if (!rule.pattern || !testContent) return;
        try {
            const regex = new RegExp(rule.pattern, rule.flags || 'gi');
            const matches = testContent.match(regex);
            setTestMatches({
                ...testMatches,
                [rule.id]: matches ? Array.from(matches).slice(0, 5) : [] // Limit to 5 previews
            });
        } catch (e) {
            setTestMatches({
                ...testMatches,
                [rule.id]: ["Invalid Regex"]
            });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in">
            <Card className="w-[90vw] max-w-4xl h-[80vh] bg-card border shadow-xl flex flex-col overflow-hidden">
                <div className="h-14 border-b px-6 flex items-center justify-between bg-muted/20 shrink-0">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Regex className="w-5 h-5 text-primary" />
                        Custom Extraction Rules
                    </h2>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} className="gap-2">
                            <Save className="w-4 h-4" /> Save Rules
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/5">
                    {localRules.length === 0 && (
                        <div className="text-center py-10 text-muted-foreground">
                            <p>No custom rules defined.</p>
                            <Button variant="outline" className="mt-4" onClick={handleAddRule}>
                                <Plus className="w-4 h-4 mr-2" /> Create First Rule
                            </Button>
                        </div>
                    )}

                    {localRules.map((rule) => (
                        <div key={rule.id} className="bg-background border rounded-lg p-4 shadow-sm space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground">Label Name</label>
                                        <input 
                                            className="w-full h-9 px-3 rounded border bg-muted/10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                            value={rule.name}
                                            onChange={(e) => handleUpdateRule(rule.id, { name: e.target.value })}
                                            placeholder="e.g. Contract Value"
                                        />
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground flex justify-between">
                                            <span>Regex Pattern</span>
                                            <span className="text-[9px] font-mono opacity-50">JavaScript Flavor</span>
                                        </label>
                                        <div className="flex gap-2">
                                            <input 
                                                className="flex-1 h-9 px-3 rounded border bg-muted/10 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                                                value={rule.pattern}
                                                onChange={(e) => handleUpdateRule(rule.id, { pattern: e.target.value })}
                                                placeholder="e.g. \$[\d,]+(\.\d{2})?"
                                            />
                                            <Button size="sm" variant="secondary" onClick={() => runTest(rule)} title="Test on current doc">
                                                <Play className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 pt-5">
                                    <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={rule.active} 
                                            onChange={(e) => handleUpdateRule(rule.id, { active: e.target.checked })}
                                            className="rounded border-primary text-primary focus:ring-0"
                                        />
                                        Active
                                    </label>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteRule(rule.id)}>
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Test Results Area */}
                            {testMatches[rule.id] && (
                                <div className="bg-muted/20 p-2 rounded text-xs">
                                    <div className="font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Found Matches (Preview):
                                    </div>
                                    {testMatches[rule.id].length === 0 ? (
                                        <span className="italic opacity-50">No matches found in current document.</span>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {testMatches[rule.id].map((m, i) => (
                                                <span key={i} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono border border-primary/20">
                                                    {m}
                                                </span>
                                            ))}
                                            {testMatches[rule.id].length >= 5 && <span className="opacity-50">...</span>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {localRules.length > 0 && (
                        <Button variant="outline" className="w-full border-dashed" onClick={handleAddRule}>
                            <Plus className="w-4 h-4 mr-2" /> Add Rule
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
};

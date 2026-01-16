
import React, { useState, useRef } from 'react';
import { Claim, CaseState } from '../types';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { detectPotentialClaims } from '../services/aiService';
import { Sparkles, AlertCircle, CheckCircle2, XCircle, Search, ShieldAlert, Plus, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ClaimManagerProps {
    caseData: CaseState;
    updateCase: (updates: Partial<CaseState>) => void;
    apiKey: string;
}

export const ClaimManager: React.FC<ClaimManagerProps> = ({ caseData, updateCase, apiKey }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const handleScan = async () => {
        if (!apiKey) {
            setScanError("API Key required for intelligent scanning.");
            return;
        }
        
        setIsScanning(true);
        setScanError(null);
        
        // Timeout protection (30s)
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        try {
            // Race between detection and timeout
            const newClaimsPromise = detectPotentialClaims(caseData, apiKey);
            
            // Note: The GenAI SDK doesn't natively support AbortSignal yet for generateContent, 
            // but we can wrap it to reject on client-side timeout to update UI.
            const racePromise = new Promise<Claim[]>((resolve, reject) => {
                newClaimsPromise.then(resolve).catch(reject);
                controller.signal.addEventListener('abort', () => reject(new Error("Scan timed out (30s). Try fewer documents.")));
            });

            const newClaims = await racePromise;
            clearTimeout(timeoutId);
            
            if (newClaims.length === 0) {
                // If it successfully returned empty array, it means AI found nothing
                // But if it failed silently before, now we know.
            }

            // Merge with existing claims (avoid duplicates by title)
            const existingTitles = new Set((caseData.claims || []).map(c => c.title));
            const uniqueNewClaims = newClaims.filter(c => !existingTitles.has(c.title));
            
            const updatedClaims = [...(caseData.claims || []), ...uniqueNewClaims];
            
            // Notify via event log
            const newEvent = {
                id: Date.now().toString(),
                type: 'info' as const,
                title: 'Intelligent Claim Scan',
                message: uniqueNewClaims.length > 0 
                    ? `Scan complete. Detected ${uniqueNewClaims.length} new potential claims.` 
                    : "Scan complete. No new claims detected.",
                timestamp: new Date(),
                read: false
            };

            updateCase({ 
                claims: updatedClaims, 
                events: [newEvent, ...caseData.events] 
            });

        } catch (e: any) {
            console.error("Claim scan error:", e);
            setScanError(e.message || "Failed to scan for claims.");
        } finally {
            clearTimeout(timeoutId);
            setIsScanning(false);
            abortControllerRef.current = null;
        }
    };

    const updateClaimStatus = (id: string, status: Claim['status']) => {
        const updated = (caseData.claims || []).map(c => c.id === id ? { ...c, status } : c);
        updateCase({ claims: updated });
    };

    const claims = caseData.claims || [];
    const activeClaims = claims.filter(c => c.status === 'asserted' || c.status === 'defended');
    const potentialClaims = claims.filter(c => c.status === 'potential');

    return (
        <div className="h-full flex flex-col p-4 space-y-6 overflow-y-auto custom-scrollbar">
            
            {/* Header / Scanner */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-indigo-500" />
                        Claim Intelligence Radar
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md">
                        AI-powered analysis of case documents to detect, validate, and track Causes of Action or Defenses.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <Button 
                        onClick={handleScan} 
                        disabled={isScanning} 
                        className={cn(
                            "gap-2 font-semibold shadow-md transition-all",
                            isScanning ? "opacity-80" : "hover:scale-105"
                        )}
                    >
                        {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {isScanning ? "Scanning Corpus..." : "Scan for Claims"}
                    </Button>
                    {scanError && <span className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {scanError}</span>}
                </div>
            </div>

            {/* Active Claims Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Active Claims / Defenses
                    </h4>
                    <Badge variant="outline" className="font-mono">{activeClaims.length}</Badge>
                </div>
                
                {activeClaims.length === 0 ? (
                    <div className="p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-muted-foreground bg-muted/5">
                        <p className="text-sm">No active claims tracked.</p>
                        <p className="text-xs mt-1">Accept potential claims below to integrate them.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeClaims.map(claim => (
                            <Card key={claim.id} className="border-l-4 border-l-emerald-500 shadow-sm bg-card hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h5 className="font-bold text-sm text-foreground">{claim.title}</h5>
                                        <Badge className={cn(
                                            "uppercase text-[9px]",
                                            claim.status === 'asserted' ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : "bg-blue-500/10 text-blue-600 border-blue-200"
                                        )}>
                                            {claim.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{claim.description}</p>
                                    <div className="flex justify-between items-center text-[10px] text-muted-foreground border-t pt-2">
                                        <span>Likelihood: {claim.likelihood}%</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => updateClaimStatus(claim.id, 'dismissed')} className="hover:text-red-500">Dismiss</button>
                                            <button onClick={() => updateClaimStatus(claim.id, 'potential')} className="hover:text-amber-500">Revert</button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Potential Claims Section */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500" /> Potential / Detected Claims
                    </h4>
                    <Badge variant="outline" className="font-mono">{potentialClaims.length}</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {potentialClaims.map(claim => (
                        <Card key={claim.id} className="border border-dashed border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors relative group">
                            <CardContent className="p-4">
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600 hover:bg-emerald-200" onClick={() => updateClaimStatus(claim.id, 'asserted')} title="Accept & Assert">
                                        <Plus className="w-4 h-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:bg-red-200" onClick={() => updateClaimStatus(claim.id, 'dismissed')} title="Reject">
                                        <XCircle className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="flex flex-col gap-1 mb-2">
                                    <h5 className="font-bold text-sm text-foreground/90">{claim.title}</h5>
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-500" style={{ width: `${claim.likelihood}%` }} />
                                        </div>
                                        <span className="text-[10px] font-mono text-amber-600">{claim.likelihood}% Prob.</span>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{claim.description}</p>
                                
                                {claim.supportingEvidenceIds && claim.supportingEvidenceIds.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-amber-500/10 text-[10px] text-amber-700/70 flex gap-1 items-center">
                                        <Search className="w-3 h-3" /> Found in: {claim.supportingEvidenceIds.slice(0, 2).join(', ')}
                                    </div>
                                )}
                                
                                <div className="mt-3 flex justify-end">
                                    <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-primary hover:bg-primary/10" onClick={() => updateClaimStatus(claim.id, 'asserted')}>
                                        Integrate to Case <ArrowRight className="w-3 h-3" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {potentialClaims.length === 0 && (
                        <div className="col-span-full py-8 text-center text-xs text-muted-foreground italic">
                            No potential claims detected. Run a scan to analyze documents.
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

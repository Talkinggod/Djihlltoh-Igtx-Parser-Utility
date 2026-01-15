
import React, { useState } from 'react';
import { ViabilityAssessment, ViabilityFactor } from '../types';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { TrendingUp, Scale, AlertTriangle, CheckCircle2, XCircle, Gavel, FileText, Target, Shield, AlertOctagon, Edit2 } from 'lucide-react';
import { ViabilityEditorDialog } from './ViabilityEditorDialog';

interface ViabilityDashboardProps {
    assessment: ViabilityAssessment;
    onUpdate?: (updated: ViabilityAssessment) => void;
}

export const ViabilityDashboard: React.FC<ViabilityDashboardProps> = ({ assessment, onUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);

    const getScoreColor = (score: number) => {
        if (score >= 70) return 'text-emerald-500 bg-emerald-500';
        if (score >= 40) return 'text-amber-500 bg-amber-500';
        return 'text-red-500 bg-red-500';
    };

    const getScoreBg = (score: number) => {
        if (score >= 70) return 'bg-emerald-500/10 border-emerald-500/20';
        if (score >= 40) return 'bg-amber-500/10 border-amber-500/20';
        return 'bg-red-500/10 border-red-500/20';
    };

    return (
        <div className="h-full overflow-y-auto p-4 space-y-6 custom-scrollbar relative">
            
            {onUpdate && (
                <div className="absolute top-4 right-4 z-10">
                    <Button variant="outline" size="sm" className="gap-2 shadow-sm bg-background h-8" onClick={() => setIsEditing(true)}>
                        <Edit2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit Strategy</span>
                    </Button>
                </div>
            )}

            {/* Header / Executive Summary */}
            <div className="flex flex-col lg:flex-row gap-4 items-start">
                <Card className="flex-1 bg-gradient-to-br from-card to-muted/20 border-primary/10 w-full">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Executive Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm leading-relaxed text-foreground/90 font-medium whitespace-pre-wrap">
                            {assessment.executive_summary}
                        </p>
                        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                            <ClockIcon className="w-3 h-3" />
                            Generated: {new Date(assessment.generated_at).toLocaleString()}
                        </div>
                    </CardContent>
                </Card>

                {/* Win Probability Gauge */}
                <Card className="w-full lg:w-64 shrink-0 flex flex-col items-center justify-center p-6 bg-card border-primary/20 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-muted/20 pointer-events-none" />
                    <div className="relative z-10 flex flex-col items-center">
                        <span className="text-xs font-bold uppercase text-muted-foreground mb-2">Win Probability</span>
                        <div className={cn("text-5xl font-black tabular-nums tracking-tight", getScoreColor(assessment.overall_probability).split(' ')[0])}>
                            {assessment.overall_probability}%
                        </div>
                        <Badge 
                            variant="outline" 
                            className={cn("mt-2 uppercase tracking-wide", getScoreBg(assessment.overall_probability))}
                        >
                            {assessment.overall_probability >= 70 ? 'Strong Case' : assessment.overall_probability >= 40 ? 'Contestable' : 'High Risk'}
                        </Badge>
                    </div>
                </Card>
            </div>

            {/* Factors Grid */}
            <div>
                <h3 className="text-sm font-bold text-muted-foreground uppercase mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4" /> Merits Analysis
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {assessment.factors.map((factor, idx) => (
                        <FactorCard key={idx} factor={factor} getScoreColor={getScoreColor} />
                    ))}
                </div>
            </div>

            {/* Balance of Equities */}
            <Card className="border-primary/20 overflow-hidden">
                <CardHeader className="bg-muted/30 border-b pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Scale className="w-4 h-4 text-indigo-500" /> Balance of Equities
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                    
                    {/* Plaintiff Side */}
                    <div className="p-4 bg-emerald-500/5">
                        <h4 className="text-xs font-bold uppercase text-emerald-600 mb-3 flex items-center gap-2">
                            <Shield className="w-3 h-3" /> Plaintiff Equities
                        </h4>
                        <ul className="space-y-2">
                            {assessment.balance_of_equities.plaintiff_equities.map((eq, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <span>{eq}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Defendant Side */}
                    <div className="p-4 bg-amber-500/5">
                        <h4 className="text-xs font-bold uppercase text-amber-600 mb-3 flex items-center gap-2">
                            <Shield className="w-3 h-3" /> Defendant Equities
                        </h4>
                        <ul className="space-y-2">
                            {assessment.balance_of_equities.defendant_equities.map((eq, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                    <span>{eq}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
                <div className="bg-muted/50 p-3 border-t text-center text-sm font-medium text-foreground/80">
                    <span className="font-bold text-primary">Conclusion: </span> 
                    {assessment.balance_of_equities.conclusion}
                </div>
            </Card>

            {/* Editor Modal */}
            {isEditing && onUpdate && (
                <ViabilityEditorDialog 
                    isOpen={isEditing} 
                    onClose={() => setIsEditing(false)} 
                    assessment={assessment} 
                    onSave={onUpdate}
                />
            )}

        </div>
    );
};

const FactorCard: React.FC<{ factor: ViabilityFactor, getScoreColor: (s: number) => string }> = ({ factor, getScoreColor }) => {
    const Icon = getIconForCategory(factor.category);
    
    return (
        <div className="border rounded-lg bg-card p-4 shadow-sm hover:border-primary/30 transition-colors flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className="p-1.5 bg-muted rounded-md text-muted-foreground shrink-0">
                        {Icon}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs font-bold uppercase text-muted-foreground truncate" title={factor.category.replace(/_/g, ' ')}>
                            {factor.category.replace(/_/g, ' ')}
                        </div>
                    </div>
                </div>
                <div className={cn("text-lg font-bold shrink-0 ml-2", getScoreColor(factor.score).split(' ')[0])}>
                    {factor.score}/100
                </div>
            </div>
            
            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-3">
                <div 
                    className={cn("h-full transition-all duration-500", getScoreColor(factor.score).split(' ')[1])} 
                    style={{ width: `${factor.score}%` }} 
                />
            </div>

            <p className="text-xs text-foreground/80 mb-3 line-clamp-3 whitespace-pre-wrap flex-1">
                {factor.rationale}
            </p>

            <div className="space-y-1 mt-auto">
                {factor.key_strengths.length > 0 && (
                    <div className="flex items-start gap-1.5 text-[10px] text-emerald-600">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="truncate">{factor.key_strengths[0]}</span>
                    </div>
                )}
                {factor.key_weaknesses.length > 0 && (
                    <div className="flex items-start gap-1.5 text-[10px] text-red-600">
                        <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="truncate">{factor.key_weaknesses[0]}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

function getIconForCategory(cat: string) {
    switch(cat) {
        case 'factual_strength': return <FileText className="w-4 h-4" />;
        case 'legal_basis': return <Gavel className="w-4 h-4" />;
        case 'liability_causation': return <AlertOctagon className="w-4 h-4" />;
        case 'opponent_position': return <Shield className="w-4 h-4" />;
        case 'judicial_venue': return <Scale className="w-4 h-4" />;
        default: return <Target className="w-4 h-4" />; // Generic icon for custom/unknown factors
    }
}

function ClockIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    );
}

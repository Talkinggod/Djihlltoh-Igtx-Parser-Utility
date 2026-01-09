
import React from 'react';
import { ExtractedDate } from '../types';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Calendar, FileText, Gavel, Mail, PenTool, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface TimelineViewProps {
    dates: ExtractedDate[];
}

export const TimelineView: React.FC<TimelineViewProps> = ({ dates }) => {
    
    // Sort dates purely chronologically
    const sortedDates = [...dates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const getIcon = (type: ExtractedDate['type']) => {
        switch (type) {
            case 'filing': return <FileText className="w-4 h-4 text-blue-500" />;
            case 'hearing': return <Gavel className="w-4 h-4 text-red-500" />;
            case 'service': return <Mail className="w-4 h-4 text-emerald-500" />;
            case 'signature': return <PenTool className="w-4 h-4 text-purple-500" />;
            case 'jurat': return <Badge variant="outline" className="text-[10px] h-4 w-4 flex items-center justify-center p-0 rounded-full border-amber-500 text-amber-600">J</Badge>;
            default: return <Calendar className="w-4 h-4 text-muted-foreground" />;
        }
    };

    const getTypeLabel = (type: ExtractedDate['type']) => {
        switch (type) {
            case 'filing': return "Filing Date";
            case 'hearing': return "Hearing / Appearance";
            case 'service': return "Service of Process";
            case 'signature': return "Signed";
            case 'jurat': return "Sworn/Notarized";
            default: return "Reference";
        }
    };

    if (sortedDates.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                <Calendar className="w-12 h-12 mb-3 opacity-20" />
                <p>No dates extracted from this document.</p>
            </div>
        );
    }

    return (
        <div className="relative p-6 max-w-3xl mx-auto">
            {/* Vertical Line */}
            <div className="absolute left-9 top-6 bottom-6 w-px bg-border"></div>

            <div className="space-y-6">
                {sortedDates.map((item, idx) => (
                    <div key={idx} className="relative flex gap-4 group">
                        {/* Dot / Icon */}
                        <div className={cn(
                            "relative z-10 w-6 h-6 rounded-full border bg-background flex items-center justify-center shrink-0 shadow-sm transition-colors",
                            item.type === 'filing' ? "border-blue-200" : 
                            item.type === 'hearing' ? "border-red-200" : "border-muted"
                        )}>
                            {getIcon(item.type)}
                        </div>

                        {/* Content Card */}
                        <Card className="flex-1 hover:border-primary/30 transition-all shadow-sm">
                            <CardContent className="p-3">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                            {getTypeLabel(item.type)}
                                        </span>
                                        <span className="text-sm font-mono font-semibold text-foreground">
                                            {new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })}
                                        </span>
                                    </div>
                                    <Badge variant="secondary" className="font-mono text-[10px]">
                                        Ln {Math.floor(item.location.start / 50)} {/* Approx Line Number */}
                                    </Badge>
                                </div>
                                
                                <div className="bg-muted/30 p-2 rounded text-xs font-serif italic text-foreground/80 border-l-2 border-primary/20">
                                    "...{item.context}..."
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>
        </div>
    );
};

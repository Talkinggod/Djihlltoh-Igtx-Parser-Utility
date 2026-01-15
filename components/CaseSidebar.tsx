
import React from 'react';
import { Plus, Briefcase, Scale, FileText, AlertCircle, Cloud, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { CaseState } from '../types';

interface CaseSidebarProps {
    cases: CaseState[];
    activeCaseId: string;
    onSwitchCase: (id: string) => void;
    onCreateCase: () => void;
    onCloseCase: (id: string) => void;
    isOpen: boolean;
    toggleSidebar: () => void;
    // New prop for cloud connect
    onConnectCloud?: () => void;
}

export const CaseSidebar: React.FC<CaseSidebarProps> = ({ 
    cases, activeCaseId, onSwitchCase, onCreateCase, onCloseCase, isOpen, toggleSidebar, onConnectCloud 
}) => {
    
    // Sort cases by last active
    const sortedCases = [...cases].sort((a, b) => b.lastActive.getTime() - a.lastActive.getTime());

    return (
        <div 
            className={cn(
                "h-full bg-muted/20 border-r border-border flex flex-col transition-all duration-300 overflow-hidden",
                isOpen ? "w-64" : "w-14"
            )}
        >
            <div className={cn("border-b border-border/50 flex shrink-0 transition-all", isOpen ? "p-3 items-center justify-between h-14" : "flex-col items-center py-4 gap-4 h-auto")}>
                {isOpen ? (
                    <>
                        <span className="text-sm font-bold flex items-center gap-2 text-foreground truncate">
                            <Briefcase className="w-4 h-4 text-primary" />
                            Case Files
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted" onClick={toggleSidebar} title="Collapse Sidebar">
                            <PanelLeftClose className="w-4 h-4" />
                        </Button>
                    </>
                ) : (
                    <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted" onClick={toggleSidebar} title="Expand Sidebar">
                            <PanelLeftOpen className="w-4 h-4" />
                        </Button>
                        <div className="w-full h-px bg-border/50" />
                        <Briefcase className="w-5 h-5 text-primary" />
                    </>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                {sortedCases.map(c => {
                    const isActive = c.id === activeCaseId;
                    // Count unread critical events (Error or Deadline)
                    const criticalEvents = c.events.filter(e => !e.read && (e.type === 'error' || e.type === 'deadline')).length;
                    const hasCloud = !!c.googleFolderId;
                    
                    return (
                        <div 
                            key={c.id}
                            onClick={() => onSwitchCase(c.id)}
                            className={cn(
                                "group relative flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all border",
                                isActive 
                                    ? "bg-background border-primary/30 shadow-sm" 
                                    : "bg-transparent border-transparent hover:bg-muted/50 hover:border-border/50"
                            )}
                            title={c.name}
                        >
                            <div className={cn(
                                "w-9 h-9 rounded flex items-center justify-center shrink-0 border transition-colors relative",
                                isActive 
                                    ? "bg-primary/10 border-primary/20 text-primary" 
                                    : "bg-muted border-muted-foreground/20 text-muted-foreground"
                            )}>
                                {c.domain === 'legal' ? <Scale className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                {hasCloud && (
                                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full border border-blue-200">
                                        <Cloud className="w-3 h-3 text-blue-500 p-0.5" />
                                    </div>
                                )}
                            </div>
                            
                            {isOpen && (
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate text-foreground">{c.name}</div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="truncate max-w-[80px]">{c.docTypeId ? c.docTypeId.replace(/_/g, ' ') : 'Draft'}</span>
                                        {criticalEvents > 0 && (
                                            <span className="flex items-center gap-0.5 text-amber-600 font-bold bg-amber-500/10 px-1 rounded animate-pulse">
                                                <AlertCircle className="w-2.5 h-2.5" />
                                                {criticalEvents}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {isActive && isOpen && cases.length > 1 && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onCloseCase(c.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-all"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="p-3 border-t border-border/50 shrink-0 space-y-2">
                <Button 
                    variant="outline" 
                    className={cn(
                        "w-full gap-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 hover:text-primary transition-all",
                        !isOpen && "px-0 justify-center h-9 w-9"
                    )}
                    onClick={onCreateCase}
                    title="New Case"
                >
                    <Plus className="w-4 h-4" />
                    {isOpen && "New Case"}
                </Button>
                
                {onConnectCloud && (
                    <Button 
                        variant="ghost" 
                        className={cn(
                            "w-full gap-2 text-xs text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10",
                            !isOpen && "px-0 justify-center h-9 w-9"
                        )}
                        onClick={onConnectCloud}
                        title="Link Google Drive Folder"
                    >
                        <Cloud className="w-4 h-4" />
                        {isOpen && "Link Cloud Drive"}
                    </Button>
                )}
            </div>
        </div>
    );
};

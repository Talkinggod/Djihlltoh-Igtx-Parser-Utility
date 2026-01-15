
import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, List as ListIcon, Search, Eye, FileText, Image, StickyNote, Calendar, Tag, Trash2, Download, ExternalLink, X, File, FileType, Clock, Gavel, Scale, AlertTriangle, Lightbulb } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { PdfViewer } from './PdfViewer';
import { EvidenceTag } from '../types';

export interface ResourceItem {
    id: string;
    title: string;
    subtitle?: string; // e.g., "Plaintiff" or "Updated 2h ago"
    date: string;
    type: 'pdf' | 'text' | 'image' | 'note' | 'exhibit';
    content?: string; // Text content for preview
    tags?: string[];
    evidenceTags?: EvidenceTag[]; // NEW: Rich Semantic Tags
    rawFile?: File; // Optional raw file for PDF viewer/Images
    onDelete?: () => void;
    onAction?: () => void; // Primary action (e.g. Analyze)
    actionLabel?: string;
}

interface ResourceExplorerProps {
    items: ResourceItem[];
    onAddItem?: () => void;
    addItemLabel?: string;
    emptyMessage?: string;
    filterOptions?: { label: string; value: string }[];
    activeFilter?: string;
    onFilterChange?: (val: string) => void;
}

export const ResourceExplorer: React.FC<ResourceExplorerProps> = ({
    items,
    onAddItem,
    addItemLabel = "Add Item",
    emptyMessage = "No items found.",
    filterOptions,
    activeFilter,
    onFilterChange
}) => {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter items based on search and external filter
    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              item.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesSearch;
    });

    const selectedItem = selectedIndex !== null ? filteredItems[selectedIndex] : null;

    // --- Keyboard Navigation Logic ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only capture keys if focused within container or global logic allows
            if (!containerRef.current?.contains(document.activeElement) && !isPreviewOpen) return;
            
            if (filteredItems.length === 0) return;

            // If we are editing an input (like search), don't hijack arrows
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

            let newIndex = selectedIndex;

            if (newIndex === null) {
                // Initial selection
                if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                    setSelectedIndex(0);
                    e.preventDefault();
                }
                return;
            }

            const cols = viewMode === 'grid' ? 4 : 1; // Assuming 4 cols for grid in md+
            
            switch (e.code) {
                case 'ArrowRight':
                    e.preventDefault();
                    if (newIndex < filteredItems.length - 1) newIndex++;
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (newIndex > 0) newIndex--;
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    if (newIndex + cols < filteredItems.length) newIndex += cols;
                    else if (viewMode === 'list' && newIndex < filteredItems.length - 1) newIndex++; // Fallback for list
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (newIndex - cols >= 0) newIndex -= cols;
                    else if (viewMode === 'list' && newIndex > 0) newIndex--; // Fallback for list
                    break;
                case 'Space':
                    e.preventDefault();
                    setIsPreviewOpen(prev => !prev);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (selectedItem?.onAction) selectedItem.onAction();
                    break;
                case 'Escape':
                    if (isPreviewOpen) {
                        e.preventDefault();
                        setIsPreviewOpen(false);
                    }
                    break;
            }

            if (newIndex !== selectedIndex) {
                setSelectedIndex(newIndex);
                const el = document.getElementById(`resource-item-${newIndex}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, filteredItems.length, viewMode, isPreviewOpen, selectedItem]);


    const getIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="w-full h-full text-red-500" />;
            case 'image': return <Image className="w-full h-full text-purple-500" />;
            case 'note': return <StickyNote className="w-full h-full text-yellow-500" />;
            case 'exhibit': return <Scale className="w-full h-full text-blue-500" />;
            default: return <FileText className="w-full h-full text-gray-500" />;
        }
    };

    const renderPreviewContent = () => {
        if (!selectedItem) return null;

        if (selectedItem.type === 'pdf' && selectedItem.rawFile) {
            return (
                <div className="w-full h-full">
                    {/* Reusing existing PDF viewer logic if accessible, otherwise basic iframe/embed */}
                    <iframe 
                        src={URL.createObjectURL(selectedItem.rawFile)} 
                        className="w-full h-full" 
                        title="PDF Preview"
                    />
                </div>
            );
        }
        
        if (selectedItem.type === 'image' && (selectedItem.content || selectedItem.rawFile)) {
             const imgSrc = selectedItem.rawFile 
                ? URL.createObjectURL(selectedItem.rawFile)
                : selectedItem.content?.startsWith('http') || selectedItem.content?.startsWith('data:') 
                    ? selectedItem.content 
                    : undefined;
                    
             if (imgSrc) {
                 return (
                     <div className="w-full h-full flex items-center justify-center p-4 bg-black/5">
                         <img src={imgSrc} className="max-w-full max-h-full object-contain rounded-md shadow-sm" alt={selectedItem.title} />
                     </div>
                 );
             }
        }

        if (selectedItem.content) {
            return (
                <div className="w-full h-full p-8 overflow-auto">
                    <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 shadow-sm border p-8 min-h-full rounded-sm">
                        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
                            {selectedItem.content}
                        </pre>
                    </div>
                </div>
            );
        }

        return (
            <div className="text-center text-muted-foreground">
                <Eye className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>No preview content available</p>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-background outline-none" ref={containerRef} tabIndex={0}>
            {/* Toolbar */}
            <div className="h-12 border-b bg-muted/20 px-4 flex items-center justify-between shrink-0 gap-4 overflow-hidden">
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex bg-muted rounded-md p-0.5">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-7 w-7 rounded-sm", viewMode === 'grid' && "bg-background shadow-sm")}
                            onClick={() => setViewMode('grid')}
                            title="Grid View"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className={cn("h-7 w-7 rounded-sm", viewMode === 'list' && "bg-background shadow-sm")}
                            onClick={() => setViewMode('list')}
                            title="List View"
                        >
                            <ListIcon className="w-4 h-4" />
                        </Button>
                    </div>

                    {filterOptions && (
                        <div className="flex bg-muted/50 rounded-md p-0.5 ml-2 overflow-x-auto scrollbar-hide max-w-[150px] md:max-w-none">
                            {filterOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    className={cn(
                                        "px-3 py-1 text-xs rounded-sm transition-all whitespace-nowrap",
                                        activeFilter === opt.value ? "bg-background shadow-sm font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => onFilterChange && onFilterChange(opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex-1 max-w-sm relative hidden sm:block">
                    <Search className="absolute left-2 top-2 w-4 h-4 text-muted-foreground" />
                    <input 
                        className="w-full bg-muted/40 border-none rounded-md pl-8 pr-4 py-1.5 text-sm focus:ring-1 focus:ring-primary"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {onAddItem && (
                    <Button size="sm" onClick={onAddItem} className="shrink-0 text-xs h-8">
                        {addItemLabel}
                    </Button>
                )}
            </div>

            {/* Content Area */}
            <div 
                className={cn(
                    "flex-1 overflow-y-auto p-4 custom-scrollbar",
                    viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 content-start" : "flex flex-col gap-1"
                )}
                onClick={() => setSelectedIndex(null)}
            >
                {filteredItems.length === 0 ? (
                    <div className="col-span-full h-64 flex flex-col items-center justify-center text-muted-foreground">
                        <Search className="w-12 h-12 mb-2 opacity-20" />
                        <p>{emptyMessage}</p>
                    </div>
                ) : (
                    filteredItems.map((item, idx) => (
                        <div
                            key={item.id}
                            id={`resource-item-${idx}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIndex(idx);
                            }}
                            onDoubleClick={() => {
                                if (item.onAction) item.onAction();
                                else setIsPreviewOpen(true);
                            }}
                            className={cn(
                                "group cursor-default transition-all duration-200 select-none overflow-hidden",
                                viewMode === 'grid' 
                                    ? "flex flex-col items-center gap-3 p-4 rounded-xl border-2 hover:bg-muted/50 relative w-full min-w-0"
                                    : "flex items-center gap-4 p-2 rounded-lg border-b border-transparent hover:bg-muted/50 px-4",
                                selectedIndex === idx 
                                    ? "bg-blue-500/10 border-blue-500 ring-0 ring-offset-0 z-10" 
                                    : "border-transparent"
                            )}
                        >
                            {/* Icon / Thumbnail */}
                            <div className={cn(
                                "shrink-0 flex items-center justify-center shadow-sm bg-background rounded-lg border relative overflow-hidden",
                                viewMode === 'grid' ? "w-16 h-20 md:w-20 md:h-24 p-2 md:p-4" : "w-10 h-10 p-2"
                            )}>
                                {getIcon(item.type)}
                                {item.evidenceTags && item.evidenceTags.length > 0 && (
                                    <div className="absolute -top-1 -right-1 flex">
                                        <div className="bg-amber-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full shadow-sm ring-1 ring-background">
                                            {item.evidenceTags.length}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className={cn("min-w-0 flex-1", viewMode === 'grid' ? "text-center w-full" : "flex items-center justify-between")}>
                                <div className={cn("flex flex-col min-w-0", viewMode === 'grid' && "items-center")}>
                                    <span className={cn(
                                        "font-medium truncate leading-tight w-full block", 
                                        viewMode === 'grid' ? "text-xs md:text-sm" : "text-sm",
                                        selectedIndex === idx && "text-blue-600 dark:text-blue-400"
                                    )} title={item.title}>
                                        {item.title}
                                    </span>
                                    <div className="flex items-center gap-2 mt-1 justify-center flex-wrap">
                                        {item.subtitle && (
                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider bg-muted px-1.5 rounded-sm truncate max-w-full">
                                                {item.subtitle}
                                            </span>
                                        )}
                                        {viewMode === 'list' && (
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(item.date).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                    {/* Evidence Tags Display in Grid */}
                                    {viewMode === 'grid' && item.evidenceTags && item.evidenceTags.length > 0 && (
                                        <div className="flex flex-wrap justify-center gap-1 mt-1 w-full overflow-hidden h-4">
                                            {item.evidenceTags.slice(0, 2).map((tag, i) => (
                                                <Badge key={i} variant="outline" className={cn(
                                                    "text-[8px] px-1 h-3.5 border-opacity-50",
                                                    tag.category === 'outcome' ? "border-green-500 text-green-600 bg-green-500/5" : 
                                                    tag.category === 'implication' ? "border-amber-500 text-amber-600 bg-amber-500/5" :
                                                    "border-blue-500 text-blue-600 bg-blue-500/5"
                                                )}>
                                                    {tag.label}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* List View Columns */}
                                {viewMode === 'list' && (
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground hidden md:flex">
                                        <div className="flex gap-1">
                                            {item.evidenceTags?.map((tag, i) => (
                                                <Badge key={`ev-${i}`} variant="outline" className={cn(
                                                    "text-[9px] h-5 px-1.5",
                                                    tag.category === 'outcome' ? "border-green-500 text-green-600" : "border-primary/30"
                                                )}>
                                                    {tag.label}
                                                </Badge>
                                            ))}
                                            {item.tags?.map(tag => (
                                                <Badge key={tag} variant="outline" className="text-[9px] h-5">{tag}</Badge>
                                            ))}
                                        </div>
                                        {item.onAction && (
                                            <Button 
                                                size="sm" 
                                                variant="secondary" 
                                                className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    item.onAction!();
                                                }}
                                            >
                                                {item.actionLabel || "Open"}
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Stats */}
            <div className="h-8 bg-muted/10 border-t flex items-center justify-center text-[10px] text-muted-foreground">
                {filteredItems.length} items • {viewMode === 'grid' ? 'Grid View' : 'List View'} • Space to Preview
            </div>

            {/* Quick Look Preview Modal */}
            {isPreviewOpen && selectedItem && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setIsPreviewOpen(false)}
                >
                    <div 
                        className="w-[90vw] h-[85vh] md:w-[800px] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Preview Header */}
                        <div className="h-12 border-b bg-muted/30 flex items-center justify-between px-4 shrink-0">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-8 h-8 flex items-center justify-center bg-background rounded border shadow-sm shrink-0">
                                    {getIcon(selectedItem.type)}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-bold truncate">{selectedItem.title}</span>
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-2">
                                        {new Date(selectedItem.date).toLocaleString()} • {selectedItem.type.toUpperCase()}
                                        {selectedItem.subtitle && ` • ${selectedItem.subtitle}`}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedItem.onAction && (
                                    <Button size="sm" onClick={() => { selectedItem.onAction!(); setIsPreviewOpen(false); }}>
                                        {selectedItem.actionLabel || "Open"}
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPreviewOpen(false)}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Preview Content */}
                        <div className="flex-1 overflow-auto bg-background/50 relative p-0 flex items-center justify-center">
                            {/* Navigation Hints (Overlay) */}
                            <div className="absolute top-1/2 left-2 z-10 pointer-events-none opacity-0 md:opacity-20">
                                <Button variant="outline" size="icon" className="h-12 w-12 rounded-full"><X className="w-6 h-6 rotate-45" /></Button>
                            </div>
                            
                            {renderPreviewContent()}
                        </div>

                        {/* Footer / Meta */}
                        <div className="h-10 border-t bg-muted/10 flex items-center justify-between px-4 text-xs text-muted-foreground">
                            <div className="flex gap-2 items-center">
                                {selectedItem.evidenceTags && selectedItem.evidenceTags.map((t, i) => (
                                    <Badge key={i} variant="secondary" className="h-5 px-1.5 text-[10px] bg-primary/10 text-primary border-primary/20" title={t.description}>
                                        {t.label}
                                    </Badge>
                                ))}
                                {selectedItem.tags?.map(t => <Badge key={t} variant="outline" className="h-5 px-1.5 text-[10px]">{t}</Badge>)}
                            </div>
                            <span className="font-mono opacity-50">Press Arrows to Navigate • Space to Close</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

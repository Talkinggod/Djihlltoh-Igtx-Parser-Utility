
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog } from './ui/dialog';
import { X, Folder, FileText, ChevronRight, HardDrive, Cloud, ArrowLeft, Loader2, FileType, Image, Eye, Download } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { ExplorerItem } from '../types';
import { FileSystemService } from '../services/fileSystemService';
import { GoogleDriveService } from '../services/googleDriveService';
import { PdfViewer } from './PdfViewer';

interface FileExplorerModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'local' | 'google';
    rootHandle?: any; // For Local
    accessToken?: string; // For Google
    onImport: (item: ExplorerItem) => void;
}

export const FileExplorerModal: React.FC<FileExplorerModalProps> = ({ 
    isOpen, onClose, mode, rootHandle, accessToken, onImport 
}) => {
    const [path, setPath] = useState<{name: string, id: any}[]>([]); // Stack of folder handles/ids
    const [items, setItems] = useState<ExplorerItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<ExplorerItem | null>(null);
    const [previewItem, setPreviewItem] = useState<ExplorerItem | null>(null);
    const [previewContent, setPreviewContent] = useState<string | Blob | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    
    // Ref for focus management
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setPath([{ name: mode === 'local' ? (rootHandle?.name || 'Local Root') : 'My Drive', id: mode === 'local' ? rootHandle : 'root' }]);
            setSelectedItem(null);
            setPreviewItem(null);
            setPreviewContent(null);
            
            // Focus container for keyboard events
            setTimeout(() => {
                containerRef.current?.focus();
            }, 50);
        }
    }, [isOpen, mode, rootHandle]);

    // Fetch items when path changes
    useEffect(() => {
        if (!isOpen || path.length === 0) return;
        
        const currentFolder = path[path.length - 1];
        setLoading(true);
        
        const fetchItems = async () => {
            try {
                if (mode === 'local') {
                    if (currentFolder.id) { // handle object
                        const files = await FileSystemService.getDirectoryContents(currentFolder.id);
                        setItems(files);
                    }
                } else if (mode === 'google' && accessToken) {
                    const files = await GoogleDriveService.listFolderContents(currentFolder.id, accessToken);
                    setItems(files);
                }
            } catch (e) {
                console.error("Failed to list files", e);
            } finally {
                setLoading(false);
            }
        };
        fetchItems();
    }, [path, isOpen, mode, accessToken]);

    // Keyboard Navigation Logic
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            
            // Allow typing in search or other inputs if we add them later
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // List Navigation
            if (!previewItem && items.length > 0) {
                const cols = 4; // Approx for grid
                const currentIndex = selectedItem ? items.findIndex(i => i.id === selectedItem.id) : -1;
                
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = currentIndex < items.length - 1 ? currentIndex + 1 : currentIndex;
                    setSelectedItem(items[next]);
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = currentIndex > 0 ? currentIndex - 1 : 0;
                    setSelectedItem(items[prev]);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = currentIndex + cols < items.length ? currentIndex + cols : items.length - 1;
                    setSelectedItem(items[next]);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = currentIndex - cols >= 0 ? currentIndex - cols : 0;
                    setSelectedItem(items[prev]);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (selectedItem) {
                        if (selectedItem.kind === 'directory') handleNavigate(selectedItem);
                        else onImport(selectedItem);
                    }
                }
            }

            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scroll
                if (previewItem) {
                    setPreviewItem(null); // Close
                } else if (selectedItem && selectedItem.kind === 'file') {
                    setPreviewItem(selectedItem); // Open
                }
            }
            
            if (e.key === 'Escape') {
                if (previewItem) {
                    setPreviewItem(null);
                    e.stopPropagation(); // Don't close modal if closing preview
                } else {
                    onClose();
                }
            }
        };
        
        const element = containerRef.current || window;
        element.addEventListener('keydown', handleKeyDown as any);
        return () => element.removeEventListener('keydown', handleKeyDown as any);
    }, [isOpen, selectedItem, previewItem, onClose, items]);

    // Load Preview Content
    useEffect(() => {
        if (!previewItem) {
            setPreviewContent(null);
            return;
        }
        
        const loadContent = async () => {
            setPreviewLoading(true);
            try {
                if (mode === 'local' && previewItem.handle) {
                    // @ts-ignore
                    const file = await previewItem.handle.getFile();
                    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                         const text = await file.text();
                         setPreviewContent(text);
                    } else if (file.type.includes('image') || file.type.includes('pdf')) {
                        // Return the file blob directly for PDF viewer / Image
                        setPreviewContent(file);
                    } else {
                        setPreviewContent(`[Binary File: ${file.name} - ${file.size} bytes]`);
                    }
                } else if (mode === 'google' && accessToken) {
                    // Google Drive
                    if (previewItem.mimeType?.includes('google-apps.document')) {
                        const text = await GoogleDriveService.downloadFile(previewItem.id, previewItem.mimeType, accessToken);
                        setPreviewContent(text);
                    } else if (previewItem.mimeType?.includes('image') || previewItem.mimeType?.includes('pdf')) {
                        const blob = await GoogleDriveService.downloadFileBlob(previewItem.id, previewItem.mimeType, accessToken);
                        setPreviewContent(blob);
                    } else {
                         setPreviewContent(`[Preview not available for ${previewItem.mimeType}]`);
                    }
                }
            } catch(e) {
                setPreviewContent("Error loading preview.");
            } finally {
                setPreviewLoading(false);
            }
        };
        loadContent();
    }, [previewItem, mode, accessToken]);

    const handleNavigate = (item: ExplorerItem) => {
        if (item.kind === 'directory') {
            setPath([...path, { name: item.name, id: mode === 'local' ? item.handle : item.id }]);
            setSelectedItem(null);
        }
    };

    const handleBreadcrumb = (index: number) => {
        setPath(path.slice(0, index + 1));
        setSelectedItem(null);
    };

    const renderPreview = () => {
        if (previewLoading) return <Loader2 className="w-10 h-10 animate-spin text-primary" />;
        if (!previewContent) return <div className="text-muted-foreground">No content</div>;

        // Check content type
        if (typeof previewContent === 'string') {
            return <pre className="text-xs font-mono whitespace-pre-wrap max-w-full overflow-auto p-4">{previewContent.slice(0, 10000)}</pre>;
        }

        // It's a Blob/File
        const blob = previewContent as Blob;
        
        if (blob.type.includes('image')) {
            const url = URL.createObjectURL(blob);
            return <img src={url} className="max-w-full max-h-full object-contain" alt="Preview" />;
        }

        if (blob.type.includes('pdf')) {
            // Need to convert blob to File object for PdfViewer if strict typing, or cast it
            const file = new File([blob], previewItem?.name || "preview.pdf", { type: "application/pdf" });
            return <div className="w-full h-full"><PdfViewer file={file} /></div>;
        }

        return <div className="text-muted-foreground">Binary Content ({blob.size} bytes)</div>;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in">
            <div 
                ref={containerRef}
                className="w-[90vw] md:w-[800px] h-[80vh] bg-card border rounded-xl shadow-2xl flex flex-col overflow-hidden relative focus:outline-none focus:ring-2 focus:ring-primary/20"
                tabIndex={0}
            >
                
                {/* Finder Header */}
                <div className="h-12 border-b bg-muted/30 flex items-center justify-between px-4 shrink-0">
                    <div className="flex items-center gap-3">
                         <div className="flex gap-2">
                             <div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer hover:bg-red-600" onClick={onClose} />
                             <div className="w-3 h-3 rounded-full bg-yellow-500" />
                             <div className="w-3 h-3 rounded-full bg-green-500" />
                         </div>
                         <div className="h-4 w-px bg-border mx-2" />
                         <div className="flex items-center gap-2 text-sm text-muted-foreground">
                             {mode === 'local' ? <HardDrive className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                             <span className="font-semibold text-foreground">{path[path.length - 1]?.name}</span>
                         </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {selectedItem && selectedItem.kind === 'file' && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => onImport(selectedItem)}>
                                <Download className="w-3 h-3 mr-1" /> Import
                            </Button>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex min-h-0">
                    
                    {/* Sidebar */}
                    <div className="w-48 bg-muted/10 border-r p-3 hidden md:flex flex-col gap-2">
                         <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Locations</div>
                         <div className={cn("flex items-center gap-2 p-2 rounded text-sm cursor-pointer", mode === 'local' && "bg-primary/10 text-primary font-medium")}>
                             <HardDrive className="w-4 h-4" /> Local Drive
                         </div>
                         <div className={cn("flex items-center gap-2 p-2 rounded text-sm cursor-pointer", mode === 'google' && "bg-primary/10 text-primary font-medium")}>
                             <Cloud className="w-4 h-4" /> Google Drive
                         </div>
                    </div>

                    {/* Files Area */}
                    <div className="flex-1 flex flex-col bg-background">
                         {/* Breadcrumbs */}
                         <div className="h-10 border-b flex items-center px-4 gap-1 text-sm overflow-x-auto whitespace-nowrap scrollbar-hide shrink-0">
                             {path.map((folder, idx) => (
                                 <React.Fragment key={idx}>
                                     {idx > 0 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                     <span 
                                        className={cn("cursor-pointer hover:underline", idx === path.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground")}
                                        onClick={() => handleBreadcrumb(idx)}
                                     >
                                         {folder.name}
                                     </span>
                                 </React.Fragment>
                             ))}
                         </div>

                         {/* Grid/List */}
                         <div 
                             className="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 content-start" 
                             onClick={() => setSelectedItem(null)}
                         >
                             {loading ? (
                                 <div className="col-span-full flex items-center justify-center text-muted-foreground h-40">
                                     <Loader2 className="w-8 h-8 animate-spin" />
                                 </div>
                             ) : items.length === 0 ? (
                                 <div className="col-span-full text-center text-muted-foreground py-10">Folder is empty</div>
                             ) : (
                                 items.map((item) => (
                                     <div 
                                        key={item.id}
                                        id={`explorer-item-${item.id}`}
                                        className={cn(
                                            "flex flex-col items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors border border-transparent group",
                                            selectedItem?.id === item.id ? "bg-blue-500/10 border-blue-500/50" : "hover:bg-muted"
                                        )}
                                        onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                        onDoubleClick={() => handleNavigate(item)}
                                    >
                                         <div className="w-12 h-12 flex items-center justify-center text-primary/80">
                                             {item.kind === 'directory' ? (
                                                 <Folder className="w-10 h-10 fill-blue-500/20 text-blue-500" />
                                             ) : item.mimeType?.includes('image') || item.name.match(/\.(jpg|png|jpeg)$/i) ? (
                                                 <Image className="w-8 h-8 text-purple-500" />
                                             ) : item.mimeType?.includes('pdf') || item.name.endsWith('.pdf') ? (
                                                 <FileType className="w-8 h-8 text-red-500" />
                                             ) : (
                                                 <FileText className="w-8 h-8 text-gray-500" />
                                             )}
                                         </div>
                                         <span className="text-xs text-center truncate w-full px-1 select-none">
                                             {item.name}
                                         </span>
                                     </div>
                                 ))
                             )}
                         </div>

                         <div className="h-8 border-t bg-muted/10 flex items-center px-4 text-[10px] text-muted-foreground justify-between">
                             <span>{items.length} items</span>
                             <span>Double-click to open • Space to preview</span>
                         </div>
                    </div>
                </div>

                {/* Preview Modal (Quick Look) */}
                {previewItem && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setPreviewItem(null)}>
                        <div className="bg-card w-[70%] h-[80%] rounded-lg shadow-2xl border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                             <div className="h-10 border-b flex items-center justify-between px-3 bg-muted/20 shrink-0">
                                 <span className="text-sm font-semibold truncate">{previewItem.name}</span>
                                 <div className="flex items-center gap-2">
                                     {selectedItem?.kind === 'file' && (
                                        <Button size="sm" className="h-6 text-xs" onClick={() => { onImport(selectedItem); setPreviewItem(null); }}>
                                            Import
                                        </Button>
                                     )}
                                     <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPreviewItem(null)}>
                                         <X className="w-4 h-4" />
                                     </Button>
                                 </div>
                             </div>
                             <div className="flex-1 overflow-auto p-0 flex items-center justify-center bg-background text-foreground relative">
                                 {renderPreview()}
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Scale, Library, Sparkles, FileEdit, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '../lib/utils';
import { sendChatMessage } from '../services/aiService';
import { ParserDomain, LanguageProfile, CaseEvent } from '../types';

interface ChatBotProps {
    apiKey: string;
    domain: ParserDomain;
    profile: LanguageProfile;
    context?: string;
    onUpdateEditor?: (content: string) => void;
    // Enhanced Context
    caseContext?: {
        id: string;
        name: string;
        docType: string;
        events: CaseEvent[];
        refDate: Date;
    };
    // Local Sync Info
    localSyncInfo?: {
        folderName: string;
        fileCount: number;
    };
}

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
    action?: string;
}

export const ChatBot: React.FC<ChatBotProps> = ({ apiKey, domain, profile, context, onUpdateEditor, caseContext, localSyncInfo }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'init-1',
            role: 'model',
            text: domain === 'legal' 
                ? "Hello. I am the Legal Studio Assistant. How can I help you with procedural rules or document formatting today?"
                : "Greetings. I am your Linguistic Parsing Assistant. Ask me about glossing standards or morphology.",
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeEvents = caseContext?.events.filter(e => !e.read && (e.type === 'error' || e.type === 'deadline')) || [];

    // Auto-scroll to bottom
    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    // Reset welcome message on domain switch
    useEffect(() => {
        setMessages([{
            id: `init-${domain}`,
            role: 'model',
            text: domain === 'legal' 
                ? "Hello. I am the Legal Studio Assistant. How can I help you with procedural rules or document formatting today?"
                : "Greetings. I am your Linguistic Parsing Assistant. Ask me about glossing standards or morphology.",
            timestamp: new Date()
        }]);
    }, [domain]);

    const handleSend = async () => {
        if (!input.trim()) return;
        if (!apiKey) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                text: "Please enter your Gemini API Key in the top header to enable chat functionality.",
                timestamp: new Date()
            }]);
            return;
        }

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setIsLoading(true);

        try {
            // Prepare history for API (excluding the local welcome message)
            const historyPayload = messages
                .filter(m => !m.id.startsWith('init-'))
                .map(m => ({ role: m.role, text: m.text }));
            
            // Build Context Payload
            let richContext = context || "";
            if (caseContext) {
                const eventSummary = caseContext.events.length > 0 
                    ? `\n\n[CASE EVENTS / DEADLINES]\n${caseContext.events.map(e => `- [${e.type.toUpperCase()}] ${e.title}: ${e.message}`).join('\n')}`
                    : "";
                
                const metaSummary = `\n\n[CASE METADATA]\nID: ${caseContext.id}\nName: ${caseContext.name}\nDocType: ${caseContext.docType}\nFiling Date: ${caseContext.refDate.toISOString()}`;
                
                richContext = metaSummary + eventSummary + "\n\n[DOCUMENT CONTENT]\n" + richContext;
            }

            // Inject File System Context
            if (localSyncInfo) {
                richContext += `\n\n[LOCAL FILE SYSTEM]\nStatus: Connected\nFolder: ${localSyncInfo.folderName}\nFiles: ${localSyncInfo.fileCount} items synced.\nYou can tell the user that their work is being saved to this folder automatically.`;
            }

            const response = await sendChatMessage(
                historyPayload, 
                userMsg.text, 
                apiKey, 
                domain, 
                profile,
                richContext
            );

            // Check for tool execution
            let actionTaken = "";
            if (response.toolCall && response.toolCall.name === 'write_to_editor') {
                const content = response.toolCall.args.content;
                if (content && onUpdateEditor) {
                    onUpdateEditor(content);
                    actionTaken = "Document Drafted";
                }
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: response.text,
                timestamp: new Date(),
                action: actionTaken
            };
            setMessages(prev => [...prev, botMsg]);

        } catch (error: any) {
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: `Error: ${error.message || "Failed to connect to Gemini."}`,
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
                <Button 
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "h-14 w-14 rounded-full shadow-xl transition-all duration-300 relative",
                        isOpen ? "bg-destructive hover:bg-destructive/90 rotate-90" : "bg-primary hover:bg-primary/90"
                    )}
                >
                    {isOpen ? <X className="h-6 w-6 text-destructive-foreground" /> : <MessageSquare className="h-6 w-6 text-primary-foreground" />}
                    
                    {!isOpen && activeEvents.length > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 text-[10px] items-center justify-center font-bold text-white">
                              {activeEvents.length}
                          </span>
                        </span>
                    )}
                </Button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <Card className="fixed bottom-24 right-6 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] z-50 shadow-2xl flex flex-col border-primary/20 bg-background/95 backdrop-blur animate-in slide-in-from-bottom-10 fade-in zoom-in-95">
                    
                    {/* Header */}
                    <div className="p-4 border-b bg-muted/30 flex items-center gap-3 shrink-0 rounded-t-lg">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center border shadow-sm",
                            domain === 'legal' ? "bg-indigo-900/20 border-indigo-500/30 text-indigo-500" : "bg-emerald-900/20 border-emerald-500/30 text-emerald-500"
                        )}>
                            {domain === 'legal' ? <Scale className="w-4 h-4" /> : <Library className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                {domain === 'legal' ? "Legal Studio Assistant" : "Linguistic Assistant"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {caseContext ? `Context: ${caseContext.name}` : "No case active"}
                            </p>
                        </div>
                        {activeEvents.length > 0 && (
                            <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-500/10 px-2 py-1 rounded-full animate-pulse">
                                <AlertCircle className="w-3 h-3" />
                                {activeEvents.length} Alerts
                            </div>
                        )}
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={cn(
                                    "flex gap-3 max-w-[85%]",
                                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                )}
                            >
                                <div className={cn(
                                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1",
                                    msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                )}>
                                    {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className={cn(
                                        "rounded-lg p-3 text-sm leading-relaxed shadow-sm",
                                        msg.role === 'user' 
                                            ? "bg-primary text-primary-foreground rounded-tr-none" 
                                            : "bg-muted/50 border border-border/50 text-foreground rounded-tl-none"
                                    )}>
                                        {msg.role === 'model' ? (
                                            <div 
                                                className="prose prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0 text-sm max-w-none"
                                                dangerouslySetInnerHTML={{ 
                                                    __html: msg.text
                                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Simple bold
                                                        .replace(/\n/g, '<br />') // Simple newlines
                                                        .replace(/- /g, '• ') // Fake bullets
                                                }} 
                                            />
                                        ) : (
                                            msg.text
                                        )}
                                    </div>
                                    {/* Action Feedback Badge */}
                                    {msg.action && (
                                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-400 animate-in fade-in slide-in-from-left-2">
                                            <FileEdit className="w-3 h-3" />
                                            <span>{msg.action}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                                <div className="bg-muted/50 border border-border/50 rounded-lg p-3 rounded-tl-none flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 border-t bg-background shrink-0">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                className="w-full bg-muted/30 border border-input rounded-md pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                                placeholder={domain === 'legal' ? "Ask about deadlines or drafting..." : "Ask about glossing rules..."}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isLoading}
                                autoFocus
                            />
                            <Button 
                                size="icon" 
                                className="absolute right-1.5 h-8 w-8"
                                onClick={handleSend}
                                disabled={!input.trim() || isLoading}
                            >
                                {isLoading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="text-[9px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1 opacity-70">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>AI is aware of your case context.</span>
                        </div>
                    </div>
                </Card>
            )}
        </>
    );
};

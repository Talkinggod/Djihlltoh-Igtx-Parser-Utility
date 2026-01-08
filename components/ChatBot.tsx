import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Scale, Library, Sparkles, FileEdit, AlertCircle, Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { sendChatMessage, writeEditorTool } from '../services/aiService';
import { ParserDomain, LanguageProfile, CaseEvent } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

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

    // --- Live API State ---
    const [isLive, setIsLive] = useState(false);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

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

    // --- AUDIO UTILS ---
    function b64ToUint8Array(base64: string) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    function createPCM16Blob(inputData: Float32Array): { data: string; mimeType: string } {
        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = inputData[i] * 32768;
        }
        
        let binary = '';
        const bytes = new Uint8Array(int16.buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);

        return {
            data: b64,
            mimeType: 'audio/pcm;rate=16000',
        };
    }

    async function decodeAudioData(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
        const bytes = b64ToUint8Array(base64);
        const dataInt16 = new Int16Array(bytes.buffer);
        const numChannels = 1;
        const sampleRate = 24000;
        const frameCount = dataInt16.length / numChannels;
        const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
        
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i] / 32768.0;
        }
        return buffer;
    }

    // --- LIVE API HANDLERS ---
    const connectLive = async () => {
        if (!apiKey) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                text: "Please enter your Gemini API Key in the top header to use Voice Mode.",
                timestamp: new Date()
            }]);
            return;
        }

        setIsLive(true);

        try {
            const ai = new GoogleGenAI({ apiKey });
            
            // Setup Audio Contexts
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            inputAudioContextRef.current = inputCtx;
            outputAudioContextRef.current = outputCtx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Prepare System Instruction
            let systemInstruction = domain === 'legal'
                ? "You are the Voice Assistant for Dziłtǫ́ǫ́ Legal Studio. Be concise, professional, and helpful with legal drafting and procedure. You can draft documents."
                : "You are the Voice Assistant for Dziłtǫ́ǫ́ IGT Parser. Help with linguistics.";
            
            if (context) systemInstruction += `\nContext: ${context.slice(0, 1000)}...`;

            // Connect
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: async () => {
                        console.log("Live Session Opened");
                        // Setup Input Stream
                        const source = inputCtx.createMediaStreamSource(stream);
                        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                        
                        processor.onaudioprocess = (e) => {
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcmData = createPCM16Blob(inputData);
                            sessionPromise.then(session => {
                                session.sendRealtimeInput({ media: pcmData });
                            });
                        };
                        
                        source.connect(processor);
                        processor.connect(inputCtx.destination);
                    },
                    onmessage: async (msg: LiveServerMessage) => {
                        const serverContent = msg.serverContent;
                        
                        // Handle Turn Complete (Transcription updates)
                        if (serverContent?.turnComplete) {
                            // No-op for now, we rely on incremental transcription or just audio
                        }

                        // Handle Transcriptions
                        if (serverContent?.modelTurn?.parts?.[0]?.text) {
                            // Text output from model (rare in audio mode unless specified)
                        }

                        // Handle Tool Calls
                        if (msg.toolCall) {
                             for (const fc of msg.toolCall.functionCalls) {
                                 if (fc.name === 'write_to_editor') {
                                     const content = (fc.args as any).content;
                                     if (content && onUpdateEditor) {
                                         onUpdateEditor(content);
                                         setMessages(prev => [...prev, {
                                             id: Date.now().toString(),
                                             role: 'model',
                                             text: "[Drafted Document via Voice Command]",
                                             timestamp: new Date(),
                                             action: "Document Drafted"
                                         }]);
                                     }
                                     // Send response back
                                     sessionPromise.then(session => session.sendToolResponse({
                                         functionResponses: {
                                             name: fc.name,
                                             id: fc.id,
                                             response: { result: "ok" }
                                         }
                                     }));
                                 }
                             }
                        }

                        // Handle Audio Output
                        const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            
                            const buffer = await decodeAudioData(audioData, ctx);
                            const source = ctx.createBufferSource();
                            source.buffer = buffer;
                            source.connect(ctx.destination);
                            
                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += buffer.duration;
                            sourcesRef.current.add(source);
                        }
                    },
                    onclose: () => {
                        console.log("Live Session Closed");
                        setIsLive(false);
                    },
                    onerror: (e) => {
                        console.error("Live Session Error", e);
                        setIsLive(false);
                        setMessages(prev => [...prev, {
                             id: Date.now().toString(),
                             role: 'model',
                             text: "Voice session error. Please reconnect.",
                             timestamp: new Date()
                        }]);
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    systemInstruction: systemInstruction,
                    tools: [{ functionDeclarations: [writeEditorTool] }],
                    inputAudioTranscription: { model: "google-speech-v2" }, 
                    outputAudioTranscription: { model: "google-speech-v2" } // Keep simple
                }
            });

            sessionPromiseRef.current = sessionPromise;

        } catch (e: any) {
            console.error(e);
            setIsLive(false);
        }
    };

    const disconnectLive = async () => {
        setIsLive(false);
        if (sessionPromiseRef.current) {
            const session = await sessionPromiseRef.current;
            session.close();
            sessionPromiseRef.current = null;
        }
        
        if (inputAudioContextRef.current) inputAudioContextRef.current.close();
        if (outputAudioContextRef.current) outputAudioContextRef.current.close();
        
        // Stop all playing audio
        sourcesRef.current.forEach(s => s.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    };


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
                                {isLive && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-500 border-red-500/30 animate-pulse">LIVE</Badge>}
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
                         {isLive && messages.length === 0 && (
                             <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                 <Volume2 className="w-8 h-8 animate-pulse" />
                                 <p className="text-sm">Listening...</p>
                             </div>
                         )}
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
                        {isLive ? (
                            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-md p-2">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                         <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </div>
                                    <span className="text-xs font-semibold text-red-500">Voice Mode Active</span>
                                </div>
                                <Button size="sm" variant="destructive" onClick={isLive ? disconnectLive : connectLive} className="h-8">
                                    End Session
                                </Button>
                            </div>
                        ) : (
                            <div className="relative flex items-center gap-2">
                                <Button 
                                    size="icon" 
                                    variant={isLive ? "destructive" : "outline"} 
                                    className="h-9 w-9 shrink-0"
                                    onClick={isLive ? disconnectLive : connectLive}
                                    title="Start Voice Mode"
                                >
                                    {isLive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                                </Button>
                                
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        className="w-full bg-muted/30 border border-input rounded-md pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50 h-9"
                                        placeholder={domain === 'legal' ? "Ask about deadlines or drafting..." : "Ask about glossing rules..."}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        disabled={isLoading}
                                        autoFocus
                                    />
                                    <Button 
                                        size="icon" 
                                        className="absolute right-0.5 top-0.5 h-8 w-8"
                                        variant="ghost"
                                        onClick={handleSend}
                                        disabled={!input.trim() || isLoading}
                                    >
                                        {isLoading ? <Sparkles className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {!isLive && (
                             <div className="text-[9px] text-center text-muted-foreground mt-2 flex items-center justify-center gap-1 opacity-70">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>AI is aware of your case context.</span>
                            </div>
                        )}
                    </div>
                </Card>
            )}
        </>
    );
};
import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Scale, Library, Sparkles, FileEdit, AlertCircle, Mic, MicOff, Volume2, Settings, Lock, Check, FileCheck, Globe, Database, FolderSearch, Gavel, Tag, StopCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { sendChatMessage, writeDraftTool } from '../services/aiService';
import { ParserDomain, LanguageProfile, CaseEvent, UILanguage, AIPrivileges, Template, Draft, GoogleUser, CaseState } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { translations } from '../services/translations';
import { GoogleDriveService } from '../services/googleDriveService';

interface ChatBotProps {
    apiKey: string;
    domain: ParserDomain;
    profile: LanguageProfile;
    context?: string; 
    
    // Callbacks
    onUpdateEditor?: (content: string) => void;
    onUpdateDraft?: (content: string) => void;
    // New Callbacks for Evidence Tools
    onUpdateCaseState?: (updates: (prevState: CaseState) => Partial<CaseState>) => void;

    // Enhanced Context
    caseContext?: {
        id: string;
        name: string;
        docType: string;
        events: CaseEvent[];
        refDate: Date;
    };
    
    // Resources
    allDocuments?: { name: string, content: string }[];
    templates?: Template[];
    
    // Local Sync Info
    localSyncInfo?: {
        folderName: string;
        fileCount: number;
    };
    lang: UILanguage;
    // Google Auth
    googleUser?: GoogleUser;
}

interface Message {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
    action?: string;
}

const languageMap: Record<string, string> = {
    'en': 'English',
    'zh-CN': 'Simplified Chinese (Mandarin)',
    'zh-TW': 'Traditional Chinese (Mandarin)',
    'ar': 'Arabic'
};

// --- Audio Utils for Gemini Live API ---

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
    int16[i] = Math.max(-32768, Math.min(32767, data[i] * 32768));
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 back to Float32
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const ChatBot: React.FC<ChatBotProps> = ({ 
    apiKey, domain, profile, context, onUpdateEditor, onUpdateDraft, onUpdateCaseState,
    caseContext, localSyncInfo, lang, allDocuments, templates, googleUser
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showPrivileges, setShowPrivileges] = useState(false);
    
    // AI Privileges State
    const [privileges, setPrivileges] = useState<AIPrivileges>({
        allowFullCaseContext: true,
        allowTemplates: true,
        allowWebSearch: false,
        allowLocalFileSystem: !!localSyncInfo,
        driveScope: undefined
    });

    const t = translations[lang];
    const initialWelcome = domain === 'legal' ? t.chatbot_welcome_legal : t.chatbot_welcome_linguistic;

    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'init-1',
            role: 'model',
            text: initialWelcome,
            timestamp: new Date()
        }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeEvents = caseContext?.events.filter(e => !e.read && (e.type === 'error' || e.type === 'deadline')) || [];

    // --- Live API State ---
    const [isLive, setIsLive] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    
    // Transcription State
    const [currentInputTranscription, setCurrentInputTranscription] = useState("");
    const [currentOutputTranscription, setCurrentOutputTranscription] = useState("");

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, currentInputTranscription, currentOutputTranscription]);

    useEffect(() => {
        const newWelcome = domain === 'legal' ? translations[lang].chatbot_welcome_legal : translations[lang].chatbot_welcome_linguistic;
        setMessages([{
            id: `init-${domain}-${lang}`,
            role: 'model',
            text: newWelcome,
            timestamp: new Date()
        }]);
    }, [domain, lang]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            disconnectLiveSession();
        };
    }, []);

    // --- SCOPE HANDLER ---
    const handleSetScope = async () => {
        if (!googleUser || !apiKey) {
            alert("Connect Google Drive and Enter API Key first.");
            return;
        }
        try {
            const folder = await GoogleDriveService.pickFolder(googleUser.accessToken, apiKey);
            setPrivileges(p => ({
                ...p,
                driveScope: { id: folder.id, name: folder.name, type: 'folder' }
            }));
        } catch(e) {
            console.error(e);
        }
    };

    const clearScope = () => {
        setPrivileges(p => ({ ...p, driveScope: undefined }));
    };

    // --- LIVE API HANDLERS ---

    const buildSystemInstruction = () => {
        let instruction = domain === 'legal' 
            ? "You are a professional legal assistant. Be concise, procedural, and professional. You have access to the case documents." 
            : "You are a linguistic expert assistant. You have access to the texts.";

        // Inject Context
        let richContext = "";
        if (caseContext) {
             richContext += `[CASE METADATA]\nID: ${caseContext.id}\nName: ${caseContext.name}\nDocType: ${caseContext.docType}\nFiling Date: ${caseContext.refDate.toISOString()}\n\n`;
             if (caseContext.events.length > 0) {
                 richContext += `[CASE EVENTS]\n${caseContext.events.map(e => `- [${e.type}] ${e.title}: ${e.message}`).join('\n')}\n\n`;
             }
        }
        if (context) {
            richContext += `[ACTIVE SOURCE DOCUMENT]\n${context.slice(0, 5000)}...\n\n`;
        }
        if (privileges.allowFullCaseContext && allDocuments && allDocuments.length > 0) {
             richContext += `[CASE REPOSITORY]\n`;
             allDocuments.forEach((doc, idx) => {
                 richContext += `--- Document ${idx + 1}: ${doc.name} ---\n${doc.content.slice(0, 2000)}...\n\n`;
             });
        }
        if (privileges.allowTemplates && templates && templates.length > 0) {
             richContext += `[AVAILABLE TEMPLATES]\n`;
             templates.forEach(t => {
                 richContext += `Template Name: "${t.name}" (${t.category})\nContent:\n${t.content.slice(0, 500)}...\n\n`;
             });
        }

        return instruction + "\n\nCONTEXT:\n" + richContext;
    };

    const connectLiveSession = async () => {
        if (!apiKey) {
            alert("Please enter your API Key first.");
            return;
        }
        
        setIsConnecting(true);

        try {
            const ai = new GoogleGenAI({ apiKey });
            
            // Audio Contexts
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            
            // Input: 16kHz required by Gemini Live
            inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
            // Output: 24kHz standard for Gemini Live responses
            outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
            
            nextStartTimeRef.current = 0;

            let mediaStream: MediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                alert("Microphone access denied or not available.");
                setIsConnecting(false);
                return;
            }

            const systemInstruction = buildSystemInstruction();

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO], 
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: { parts: [{ text: systemInstruction }]},
                    // Enable transcription to display chat bubbles (Empty object enables it, do not pass model name here)
                    inputAudioTranscription: {}, 
                    outputAudioTranscription: {} 
                },
                callbacks: {
                    onopen: () => {
                        console.log("Live Session Opened");
                        setIsLive(true);
                        setIsConnecting(false);

                        // Setup Input Stream
                        const ctx = inputAudioContextRef.current;
                        if (ctx) {
                            const source = ctx.createMediaStreamSource(mediaStream);
                            // bufferSize 4096, 1 input channel, 1 output channel
                            // Using ScriptProcessor for broader compatibility without worklet files
                            const processor = ctx.createScriptProcessor(4096, 1, 1);
                            
                            processor.onaudioprocess = (e) => {
                                const inputData = e.inputBuffer.getChannelData(0);
                                const pcmBlob = createPcmBlob(inputData);
                                sessionPromise.then((session) => {
                                    session.sendRealtimeInput({ media: pcmBlob });
                                });
                            };

                            source.connect(processor);
                            processor.connect(ctx.destination);
                        }
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        // 1. Handle Audio Output
                        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (audioData && outputAudioContextRef.current) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            
                            const audioBytes = decode(audioData);
                            const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                            
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(ctx.destination);
                            
                            source.addEventListener('ended', () => {
                                sourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }

                        // 2. Handle Transcription (User)
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            if (text) setCurrentInputTranscription(prev => prev + text);
                        }

                        // 3. Handle Transcription (Model)
                        if (message.serverContent?.outputTranscription) {
                            const text = message.serverContent.outputTranscription.text;
                            if (text) setCurrentOutputTranscription(prev => prev + text);
                        }

                        // 4. Handle Turn Complete (Push to history)
                        if (message.serverContent?.turnComplete) {
                            // We need to commit the current transcriptions to the message history
                            // Using functional updates to ensure we have the latest state values inside callback
                            setCurrentInputTranscription(prevInput => {
                                if (prevInput.trim()) {
                                    setMessages(prevMsgs => [...prevMsgs, {
                                        id: Date.now().toString() + '-user',
                                        role: 'user',
                                        text: prevInput,
                                        timestamp: new Date()
                                    }]);
                                }
                                return "";
                            });

                            setCurrentOutputTranscription(prevOutput => {
                                if (prevOutput.trim()) {
                                    setMessages(prevMsgs => [...prevMsgs, {
                                        id: Date.now().toString() + '-model',
                                        role: 'model',
                                        text: prevOutput,
                                        timestamp: new Date()
                                    }]);
                                }
                                return "";
                            });
                        }

                        // 5. Handle Interruption
                        if (message.serverContent?.interrupted) {
                            sourcesRef.current.forEach(source => {
                                try { source.stop(); } catch(e) {}
                            });
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            // Reset current transcriptions on interrupt to avoid stale partials
                            setCurrentOutputTranscription(""); 
                        }
                    },
                    onclose: () => {
                        console.log("Live Session Closed");
                        setIsLive(false);
                    },
                    onerror: (e) => {
                        console.error("Live Session Error", e);
                        setIsLive(false);
                        setIsConnecting(false);
                        // Provide user feedback if detailed error available
                        if (e instanceof ErrorEvent && e.message) {
                             alert(`Live Session Error: ${e.message}`);
                        }
                    }
                }
            });
            sessionPromiseRef.current = sessionPromise;

        } catch (e) {
            console.error("Failed to connect live", e);
            setIsConnecting(false);
            alert("Failed to start Live session. Check console.");
        }
    };

    const disconnectLiveSession = () => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(s => s.close());
            sessionPromiseRef.current = null;
        }
        
        inputAudioContextRef.current?.close();
        outputAudioContextRef.current?.close();
        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        
        setIsLive(false);
        setIsConnecting(false);
        
        // Commit any pending transcriptions
        if (currentInputTranscription.trim()) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: currentInputTranscription, timestamp: new Date() }]);
        }
        if (currentOutputTranscription.trim()) {
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: currentOutputTranscription, timestamp: new Date() }]);
        }
        setCurrentInputTranscription("");
        setCurrentOutputTranscription("");
    };

    const toggleLive = () => {
        if (isLive) disconnectLiveSession();
        else connectLiveSession();
    };

    // --- STANDARD CHAT HANDLER ---

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
            const historyPayload = messages
                .filter(m => !m.id.startsWith('init-'))
                .map(m => ({ role: m.role, text: m.text }));
            
            // Build Context
            let richContext = "";
            if (caseContext) {
                 richContext += `[CASE METADATA]\nID: ${caseContext.id}\nName: ${caseContext.name}\nDocType: ${caseContext.docType}\nFiling Date: ${caseContext.refDate.toISOString()}\n\n`;
                 if (caseContext.events.length > 0) {
                     richContext += `[CASE EVENTS]\n${caseContext.events.map(e => `- [${e.type}] ${e.title}: ${e.message}`).join('\n')}\n\n`;
                 }
            }
            if (context) {
                richContext += `[ACTIVE SOURCE DOCUMENT]\n${context.slice(0, 10000)}${context.length > 10000 ? '...[TRUNCATED]' : ''}\n\n`;
            }
            if (privileges.allowFullCaseContext && allDocuments && allDocuments.length > 0) {
                 richContext += `[CASE REPOSITORY]\n`;
                 allDocuments.forEach((doc, idx) => {
                     richContext += `--- Document ${idx + 1}: ${doc.name} ---\n${doc.content.slice(0, 2000)}\n\n`;
                 });
            }
            if (privileges.allowTemplates && templates && templates.length > 0) {
                 richContext += `[AVAILABLE TEMPLATES]\n`;
                 templates.forEach(t => {
                     richContext += `Template Name: "${t.name}" (${t.category})\nContent:\n${t.content}\n\n`;
                 });
            }
            if (privileges.allowLocalFileSystem && localSyncInfo) {
                richContext += `[LOCAL FILE SYSTEM]\nStatus: Synced\nFolder: ${localSyncInfo.folderName}\nFiles: ${localSyncInfo.fileCount}\n`;
            }

            const targetLangName = languageMap[lang] || 'English';

            // Loop to handle tool calls
            let currentResponse = await sendChatMessage(
                historyPayload, 
                userMsg.text, 
                apiKey, 
                domain, 
                profile,
                targetLangName,
                richContext,
                privileges,
                !!googleUser
            );

            // Handle Tools Loop (Max 3 turns)
            for (let i = 0; i < 3; i++) {
                if (currentResponse.toolCall) {
                    const toolName = currentResponse.toolCall.name;
                    const args = currentResponse.toolCall.args;
                    let toolResult = "";
                    let actionTaken = "";

                    // Execute Local Tools
                    if (toolName === 'write_draft') {
                        if (onUpdateDraft) {
                            onUpdateDraft(args.content);
                            toolResult = "Draft updated successfully.";
                            actionTaken = "Draft Updated";
                        }
                    } else if (toolName === 'write_to_editor') {
                        if (onUpdateEditor) {
                            onUpdateEditor(args.content);
                            toolResult = "Editor updated successfully.";
                            actionTaken = "Editor Updated";
                        }
                    } else if (toolName === 'mark_exhibit' && onUpdateCaseState) {
                        onUpdateCaseState(prev => {
                            // Find linked doc if exists
                            const linkedDoc = prev.documents.find(d => d.name === args.documentName);
                            const newExhibit = {
                                id: Date.now().toString(),
                                designation: args.designation,
                                description: args.description,
                                sourceDocumentId: linkedDoc?.id,
                                status: 'potential' as const,
                                markedDate: new Date().toISOString()
                            };
                            return { exhibits: [...prev.exhibits, newExhibit] };
                        });
                        toolResult = `Marked ${args.documentName} as ${args.designation}.`;
                        actionTaken = "Marked Exhibit";
                    } else if (toolName === 'tag_evidence' && onUpdateCaseState) {
                        onUpdateCaseState(prev => {
                            const newDocs = prev.documents.map(d => {
                                if (d.name === args.documentName) {
                                    const newTag = {
                                        id: Date.now().toString(),
                                        category: args.category,
                                        label: args.label,
                                        confidence: 0.95,
                                        description: args.explanation
                                    };
                                    return { ...d, tags: [...(d.tags || []), newTag] };
                                }
                                return d;
                            });
                            return { documents: newDocs };
                        });
                        toolResult = `Tagged ${args.documentName} with [${args.label}].`;
                        actionTaken = "Evidence Tagged";
                    } else if (toolName === 'list_drive_files' && googleUser) {
                        try {
                            const scopeName = privileges.driveScope ? ` in '${privileges.driveScope.name}'` : '';
                            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: `Searching Drive${scopeName} for "${args.query}"...`, timestamp: new Date() }]);
                            const files = await GoogleDriveService.listFiles(args.query, googleUser.accessToken, privileges.driveScope?.id);
                            toolResult = `Files found: ${files}`;
                        } catch (e: any) {
                            toolResult = `Error searching drive: ${e.message}`;
                        }
                    } else if (toolName === 'read_drive_file' && googleUser) {
                        try {
                            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: `Reading file ${args.fileId}...`, timestamp: new Date() }]);
                            const content = await GoogleDriveService.downloadFile(args.fileId, 'application/vnd.google-apps.document', googleUser.accessToken);
                            toolResult = `File Content: ${content.slice(0, 5000)}...`;
                        } catch (e: any) {
                            toolResult = `Error reading file: ${e.message}`;
                        }
                    }

                    // Feed result back
                    historyPayload.push({ role: 'model', text: "" }); 
                    const toolFeedback = `[System] Tool '${toolName}' executed. Result: ${toolResult}`;
                    
                    currentResponse = await sendChatMessage(
                        [...historyPayload, { role: 'user', text: toolFeedback }],
                        "Proceed.", 
                        apiKey, domain, profile, targetLangName, richContext, privileges, !!googleUser
                    );
                    
                    if (!currentResponse.toolCall) {
                        if (actionTaken) {
                             const botMsg: Message = {
                                id: (Date.now() + 1).toString(),
                                role: 'model',
                                text: currentResponse.text,
                                timestamp: new Date(),
                                action: actionTaken
                            };
                            setMessages(prev => [...prev, botMsg]);
                            setIsLoading(false);
                            return; 
                        }
                        break;
                    }
                } else {
                    break;
                }
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: currentResponse.text,
                timestamp: new Date()
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
                </Button>
            </div>

            {/* Chat Window */}
            {isOpen && (
                <Card className="fixed bottom-24 right-6 w-[90vw] md:w-[400px] h-[600px] max-h-[80vh] z-50 shadow-2xl flex flex-col border-primary/20 bg-background/95 backdrop-blur animate-in slide-in-from-bottom-10 fade-in zoom-in-95">
                    
                    {/* Header */}
                    <div className="p-4 border-b bg-muted/30 flex items-center justify-between shrink-0 rounded-t-lg">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center border shadow-sm",
                                domain === 'legal' ? "bg-indigo-900/20 border-indigo-500/30 text-indigo-500" : "bg-emerald-900/20 border-emerald-500/30 text-emerald-500"
                            )}>
                                {domain === 'legal' ? <Scale className="w-4 h-4" /> : <Library className="w-4 h-4" />}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    {domain === 'legal' ? "Legal Assistant" : "Linguist Assistant"}
                                    {isLive && <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-500 border-red-500/30 animate-pulse">LIVE</Badge>}
                                </h3>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setShowPrivileges(!showPrivileges)}>
                            <Settings className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* AI Privileges Menu */}
                    {showPrivileges && (
                        <div className="bg-muted/50 border-b p-4 space-y-3 animate-in slide-in-from-top-2">
                            <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                                <Lock className="w-3 h-3" /> AI Access Privileges
                            </h4>
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={privileges.allowFullCaseContext} onChange={(e) => setPrivileges({...privileges, allowFullCaseContext: e.target.checked})} className="rounded border-primary/20" />
                                    Read Full Case Context
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={privileges.allowTemplates} onChange={(e) => setPrivileges({...privileges, allowTemplates: e.target.checked})} className="rounded border-primary/20" />
                                    Access Templates
                                </label>
                                {localSyncInfo && (
                                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                                        <input type="checkbox" checked={privileges.allowLocalFileSystem} onChange={(e) => setPrivileges({...privileges, allowLocalFileSystem: e.target.checked})} className="rounded border-primary/20" />
                                        Access Local Folder ({localSyncInfo.fileCount} files)
                                    </label>
                                )}
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={privileges.allowWebSearch} onChange={(e) => setPrivileges({...privileges, allowWebSearch: e.target.checked})} className="rounded border-primary/20" />
                                    Web Search (Grounding)
                                </label>
                            </div>
                            
                            {/* Drive Scope */}
                            <div className="pt-2 border-t border-dashed">
                                <div className="flex justify-between items-center mb-1">
                                    <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Drive Scope (Intent Tunnel)</h4>
                                    {privileges.driveScope && (
                                        <Button size="icon" variant="ghost" className="h-4 w-4 text-destructive" onClick={clearScope}><X className="w-3 h-3"/></Button>
                                    )}
                                </div>
                                {privileges.driveScope ? (
                                    <div className="text-xs bg-blue-500/10 text-blue-600 px-2 py-1 rounded border border-blue-500/20 flex items-center gap-2">
                                        <FolderSearch className="w-3 h-3" />
                                        Limited to: {privileges.driveScope.name}
                                    </div>
                                ) : (
                                    <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={handleSetScope} disabled={!googleUser}>
                                        Set Folder Scope
                                    </Button>
                                )}
                            </div>

                            <Button size="sm" className="w-full" onClick={() => setShowPrivileges(false)}>Done</Button>
                        </div>
                    )}

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
                                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                                                        .replace(/\n/g, '<br />')
                                                        .replace(/- /g, '• ')
                                                }} 
                                            />
                                        ) : (
                                            msg.text
                                        )}
                                    </div>
                                    {msg.action && (
                                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-400 animate-in fade-in slide-in-from-left-2">
                                            {msg.action === 'Marked Exhibit' ? <Gavel className="w-3 h-3" /> : (msg.action === 'Evidence Tagged' ? <Tag className="w-3 h-3" /> : <FileEdit className="w-3 h-3" />)}
                                            <span>{msg.action}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {/* Live Transcriptions (Transient) */}
                        {isLive && (
                            <>
                                {currentInputTranscription && (
                                    <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse opacity-70">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 bg-primary text-primary-foreground">
                                            <User className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="rounded-lg p-3 text-sm leading-relaxed shadow-sm bg-primary/20 text-foreground rounded-tr-none italic">
                                            {currentInputTranscription}...
                                        </div>
                                    </div>
                                )}
                                {currentOutputTranscription && (
                                    <div className="flex gap-3 max-w-[85%] opacity-70">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1 bg-muted text-muted-foreground">
                                            <Bot className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="rounded-lg p-3 text-sm leading-relaxed shadow-sm bg-muted/30 border border-border/50 text-foreground rounded-tl-none italic">
                                            {currentOutputTranscription}...
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {isLoading && (
                            <div className="flex gap-3">
                                {/* Loading dots */}
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
                        {/* If Live, show simplified interface */}
                        {isLive ? (
                            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-md p-2">
                                <div className="flex items-center gap-3">
                                    <div className="relative flex h-3 w-3">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                    </div>
                                    <span className="text-sm font-medium text-red-500">Listening...</span>
                                </div>
                                <Button 
                                    size="sm" 
                                    variant="destructive" 
                                    className="h-8 gap-2"
                                    onClick={disconnectLiveSession}
                                >
                                    <StopCircle className="w-4 h-4" /> End Session
                                </Button>
                            </div>
                        ) : (
                            <div className="relative flex items-center gap-2">
                                <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className={cn("h-9 w-9 shrink-0", isConnecting && "animate-pulse")}
                                    onClick={toggleLive}
                                    disabled={isConnecting}
                                    title="Start Live Voice Session"
                                >
                                    <Mic className="w-4 h-4" />
                                </Button>
                                
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        className="w-full bg-muted/30 border border-input rounded-md pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-9"
                                        placeholder={domain === 'legal' ? "Tag evidence or mark exhibits..." : "Help me gloss this..."}
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
                    </div>
                </Card>
            )}
        </>
    );
};
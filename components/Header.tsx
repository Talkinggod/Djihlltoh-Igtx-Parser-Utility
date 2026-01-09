
import React, { useState, useEffect } from 'react';
import { Layers, Terminal, ShieldCheck, Globe, Key, Check, XCircle, Eye, EyeOff, Copy, X, Scale, Library, Save, HardDrive, RefreshCw, LogIn, Database, FolderOpen, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { translations } from '../services/translations';
import { UILanguage, ParserDomain, GoogleUser } from '../types';
import { GoogleDriveService } from '../services/googleDriveService';

interface HeaderProps {
    lang: UILanguage;
    setLang: (l: UILanguage) => void;
    apiKey: string;
    setApiKey: (key: string) => void;
    domain: ParserDomain;
    setDomain: (d: ParserDomain) => void;
    // Local Sync Props
    isLocalSyncEnabled?: boolean;
    onConnectLocalFolder?: () => void;
    onOpenLocalExplorer?: () => void;
    folderName?: string;
    isIframe?: boolean;
    // Google Drive Props
    googleUser?: GoogleUser;
    onGoogleSignIn?: (user: GoogleUser) => void;
    onGoogleSignOut?: () => void;
    onOpenGoogleExplorer?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    lang, setLang, apiKey, setApiKey, domain, setDomain,
    isLocalSyncEnabled, onConnectLocalFolder, onOpenLocalExplorer, folderName, isIframe,
    googleUser, onGoogleSignIn, onGoogleSignOut, onOpenGoogleExplorer
}) => {
  const [imageError, setImageError] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState(() => localStorage.getItem('google_client_id') || '');
  const logoSrc = "https://pub-7ec44766314c42b7b7a0c3e78330b4a5.r2.dev/logo2.jpg";
  const t = translations[lang];

  // Validation
  const isPotentiallyValid = apiKey.startsWith('AIza') && apiKey.length > 35;
  const isInvalid = apiKey.length > 0 && !isPotentiallyValid;

  useEffect(() => {
      localStorage.setItem('google_client_id', clientId);
  }, [clientId]);

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
    }
  };

  const handleClear = () => {
    setApiKey('');
  };

  const handleGoogleAuth = async () => {
      if (!clientId) {
          setShowConfig(true);
          return;
      }
      try {
          if (!GoogleDriveService.isLoaded()) await GoogleDriveService.init(clientId, apiKey);
          const user = await GoogleDriveService.signIn(clientId);
          if (onGoogleSignIn) onGoogleSignIn(user);
      } catch (e) {
          console.error(e);
          alert("Google Sign-In failed. Ensure your Client ID is correct and 'drive.readonly' scope is allowed.");
      }
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between relative">
        
        {/* Left Side - Logo, Title & Domain Toggle */}
        <div className="flex items-center gap-4 z-20 shrink-0">
          <div className="relative h-10 w-10 md:h-12 md:w-12 rounded-full border-2 border-primary/20 overflow-hidden shadow-sm hover:border-primary/40 transition-colors bg-muted group">
            {!imageError ? (
              <img 
                src={logoSrc} 
                alt="Dziłtǫ́ǫ́ Logo" 
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10">
                 <Layers className="w-5 h-5 text-primary" />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <h1 className="text-sm md:text-lg font-bold tracking-tight leading-tight flex items-center gap-2">
              {domain === 'legal' ? 'Dziłtǫ́ǫ́ Legal Studio' : t.title}
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono hidden md:block whitespace-nowrap">
              {t.subtitle}
            </p>
          </div>

          <div className="hidden lg:flex ml-6 bg-muted/30 p-1 rounded-lg border border-border">
                <button
                    onClick={() => setDomain('linguistic')}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                        domain === 'linguistic' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Library className="w-3.5 h-3.5" />
                    Linguistics
                </button>
                <button
                    onClick={() => setDomain('legal')}
                    className={cn(
                        "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                        domain === 'legal' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Scale className="w-3.5 h-3.5" />
                    Legal Pleading
                </button>
          </div>
        </div>

        {/* Right Side - Controls */}
        <div className="flex items-center gap-2 md:gap-4 z-20 shrink-0">
           
           {/* Config Popover for Client ID */}
           {showConfig && (
               <div className="absolute top-16 right-4 p-4 bg-popover border shadow-lg rounded-lg z-50 w-80 animate-in fade-in slide-in-from-top-2">
                   <div className="flex justify-between items-center mb-2">
                       <h3 className="text-sm font-bold">Google Cloud Config</h3>
                       <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowConfig(false)}><X className="w-4 h-4"/></Button>
                   </div>
                   <p className="text-xs text-muted-foreground mb-3">Required for Google Drive integration. Enter your OAuth Client ID.</p>
                   <input 
                        className="w-full bg-background border rounded px-2 py-1 text-xs mb-2"
                        placeholder="apps.googleusercontent.com Client ID"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                   />
                   <Button size="sm" className="w-full" onClick={() => setShowConfig(false)}>Save</Button>
               </div>
           )}

           {/* Google Drive Controls */}
           {onGoogleSignIn && (
               <div className="flex items-center gap-1 bg-blue-500/5 p-0.5 rounded-md border border-blue-500/20">
                 <Button
                    variant={googleUser ? "secondary" : "ghost"}
                    size="sm"
                    onClick={googleUser ? undefined : handleGoogleAuth}
                    className={cn("gap-2 h-7 text-xs px-2", googleUser ? "bg-blue-500/10 text-blue-600 pointer-events-none" : "hover:text-blue-600")}
                    title={googleUser ? `Connected as ${googleUser.name}` : "Connect Google Drive"}
                 >
                    {googleUser ? (
                        <>
                            <img src={googleUser.picture} className="w-4 h-4 rounded-full" alt="User" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            <span className="hidden sm:inline font-semibold">{googleUser.name.split(' ')[0]}</span>
                        </>
                    ) : (
                        <>
                            <Database className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Connect Drive</span>
                        </>
                    )}
                 </Button>
                 
                 {googleUser && onOpenGoogleExplorer && (
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-blue-600 hover:bg-blue-500/20 hover:text-blue-700" 
                        onClick={onOpenGoogleExplorer} 
                        title="Open Drive Finder"
                     >
                         <FolderOpen className="w-3.5 h-3.5" />
                     </Button>
                 )}

                 {googleUser && onGoogleSignOut && (
                     <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={onGoogleSignOut} title="Sign Out">
                         <LogOut className="w-3.5 h-3.5" />
                     </Button>
                 )}
               </div>
           )}

           {/* Local Folder Controls */}
           {onConnectLocalFolder && (
               <div className="flex items-center gap-1 bg-emerald-500/5 p-0.5 rounded-md border border-emerald-500/20">
                   <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={isIframe ? undefined : onConnectLocalFolder}
                    className={cn(
                        "gap-2 h-7 text-xs px-2",
                        isIframe 
                            ? "opacity-50 cursor-not-allowed text-muted-foreground" 
                            : isLocalSyncEnabled 
                                ? "text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800" 
                                : "text-muted-foreground hover:text-primary"
                    )}
                    title={isIframe ? "Local Sync unavailable in Preview Mode. Open in New Tab to use." : (isLocalSyncEnabled ? "Change Local Folder" : "Connect Local Folder")}
                   >
                       {isLocalSyncEnabled ? (
                           <>
                               <HardDrive className="w-3.5 h-3.5" />
                               <span className="hidden sm:inline font-semibold max-w-[80px] truncate">{folderName}</span>
                           </>
                       ) : (
                           <>
                               <HardDrive className="w-3.5 h-3.5" />
                               <span className="hidden sm:inline">Local Drive</span>
                           </>
                       )}
                   </Button>
                   
                   {isLocalSyncEnabled && onOpenLocalExplorer && !isIframe && (
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700" 
                        onClick={onOpenLocalExplorer} 
                        title="Open Local Finder"
                     >
                         <FolderOpen className="w-3.5 h-3.5" />
                     </Button>
                   )}
                   
                   {isLocalSyncEnabled && !isIframe && (
                     <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10" 
                        onClick={onConnectLocalFolder} 
                        title="Re-sync"
                     >
                         <RefreshCw className="w-3.5 h-3.5" />
                     </Button>
                   )}
               </div>
           )}

           <div className={cn(
             "flex items-center rounded-full border h-8 gap-1 pl-3 pr-1 transition-all duration-300 relative group",
             isPotentiallyValid 
               ? "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_10px_-3px_rgba(16,185,129,0.3)]" 
               : isInvalid 
                 ? "bg-destructive/10 border-destructive/50"
                 : "bg-muted/40 border-border hover:bg-muted/60"
           )}>
              {isPotentiallyValid ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : isInvalid ? (
                  <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
              ) : (
                  <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              
              <input 
                type={showKey ? "text" : "password"} 
                placeholder="Gemini API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={cn(
                    "bg-transparent border-none text-xs w-24 md:w-48 focus:outline-none focus:ring-0 transition-colors h-full",
                    isPotentiallyValid ? "text-emerald-700 dark:text-emerald-400 font-medium" : 
                    isInvalid ? "text-foreground placeholder:text-destructive/50" : "placeholder:text-muted-foreground/50"
                )}
                autoComplete="off"
                spellCheck={false}
              />

              <div className="flex items-center gap-0.5">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 rounded-full hover:bg-background/50 text-muted-foreground" 
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? "Hide" : "Show"}
                  >
                    {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>

                  {apiKey && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-background/50 text-muted-foreground" 
                        onClick={handleCopy}
                        title="Copy Key"
                    >
                        <Copy className="w-3 h-3" />
                    </Button>
                  )}

                  {apiKey && (
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full hover:bg-background/50 hover:text-destructive text-muted-foreground" 
                        onClick={handleClear}
                        title="Clear Key"
                    >
                        <X className="w-3 h-3" />
                    </Button>
                  )}
              </div>
           </div>
           
           <div className="w-px h-6 bg-border hidden sm:block"></div>
           
           <div className="flex items-center gap-1">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <select 
                    className="h-8 text-xs bg-transparent border-none text-muted-foreground hover:text-foreground focus:ring-0 cursor-pointer"
                    value={lang}
                    onChange={(e) => setLang(e.target.value as UILanguage)}
                >
                    <option value="en">English</option>
                    <option value="zh-CN">简体中文</option>
                    <option value="zh-TW">繁體中文</option>
                    <option value="ar">العربية</option>
                </select>
           </div>
        </div>
      </div>
    </header>
  );
};

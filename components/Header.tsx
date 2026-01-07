import React, { useState } from 'react';
import { Layers, Terminal, ShieldCheck, Globe, Key, Check, XCircle, Eye, EyeOff, Copy, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { translations } from '../services/translations';
import { UILanguage } from '../types';

interface HeaderProps {
    lang: UILanguage;
    setLang: (l: UILanguage) => void;
    apiKey: string;
    setApiKey: (key: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, setLang, apiKey, setApiKey }) => {
  const [imageError, setImageError] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const logoSrc = "https://pub-7ec44766314c42b7b7a0c3e78330b4a5.r2.dev/logo2.jpg";
  const t = translations[lang];

  // Validation: Starts with AIza and has sufficient length (Google keys are usually ~39 chars)
  const isPotentiallyValid = apiKey.startsWith('AIza') && apiKey.length > 35;
  const isInvalid = apiKey.length > 0 && !isPotentiallyValid;

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
    }
  };

  const handleClear = () => {
    setApiKey('');
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between relative">
        
        {/* Left Side - Logo & Title (Moved from Center) */}
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
            <h1 className="text-sm md:text-lg font-bold tracking-tight leading-tight">
              {t.title}
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono hidden md:block whitespace-nowrap">
              {t.subtitle}
            </p>
          </div>
        </div>

        {/* Right Side - Controls */}
        <div className="flex items-center gap-2 md:gap-4 z-20 shrink-0">
           
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
                  {/* Show/Hide */}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 rounded-full hover:bg-background/50 text-muted-foreground" 
                    onClick={() => setShowKey(!showKey)}
                    title={showKey ? "Hide" : "Show"}
                  >
                    {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </Button>

                  {/* Copy */}
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

                  {/* Clear */}
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
              
              {/* Tooltip on hover */}
              <div className="absolute right-0 top-full mt-3 w-64 p-3 bg-popover text-popover-foreground text-[10px] rounded-md border shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none group-hover:pointer-events-auto">
                  <div className="font-semibold mb-1">Gemini API Key Required</div>
                  <div className="text-muted-foreground leading-relaxed">
                    Used for URL scraping and AI enrichment. Stored temporarily in session.
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <span className="text-muted-foreground">Format: </span> 
                    <code className="bg-muted px-1 rounded">AIza...</code>
                  </div>
              </div>
           </div>

           <Badge variant="outline" className="hidden lg:flex gap-1.5 border-emerald-900/50 bg-emerald-950/20 text-emerald-500">
             <ShieldCheck className="w-3 h-3" />
             {t.deterministic}
           </Badge>
           
           <Badge variant="secondary" className="hidden md:flex gap-1.5 font-mono">
             <Terminal className="w-3 h-3" />
             v1.9
           </Badge>

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
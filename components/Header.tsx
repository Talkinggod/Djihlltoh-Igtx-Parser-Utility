import React, { useState } from 'react';
import { Layers, Terminal, ShieldCheck, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export const Header: React.FC = () => {
  const [imageError, setImageError] = useState(false);
  // Standard convention: public folder contents are served at root
  const [logoSrc, setLogoSrc] = useState("https://pub-7ec44766314c42b7b7a0c3e78330b4a5.r2.dev/logo2.jpg");

  const handleImageError = () => {
    // If /logo.jpeg fails, try /public/logo.jpeg (raw structure)
    if (logoSrc === "https://pub-7ec44766314c42b7b7a0c3e78330b4a5.r2.dev/logo2.jpg") {
      setLogoSrc("https://pub-7ec44766314c42b7b7a0c3e78330b4a5.r2.dev/logo2.jpg");
    } else {
      // If both fail, show the fallback icon
      setImageError(true);
    }
  };

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between relative">
        
        {/* Left Side - Logo */}
        <div className="flex items-center gap-4 z-20 shrink-0">
          <div className="relative h-10 w-10 md:h-12 md:w-12 rounded-full border-2 border-primary/20 overflow-hidden shadow-sm hover:border-primary/40 transition-colors bg-muted group">
            {!imageError ? (
              <img 
                src={logoSrc} 
                alt="Dziłtǫ́ǫ́ Logo" 
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10">
                 <Layers className="w-5 h-5 text-primary" />
              </div>
            )}
          </div>
        </div>

        {/* Center - Title & Subtitle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full max-w-[60%] md:max-w-none pointer-events-none z-10 flex flex-col items-center justify-center">
            <h1 className="text-sm md:text-lg font-bold tracking-tight pointer-events-auto truncate w-full px-2">
              Djihlltoh Igtx Parser Utility
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono hidden md:block pointer-events-auto whitespace-nowrap">
              by Talkinggod AI / Talkinggod Labs — Níímą́ą́ʼ Bee Naalkaah
            </p>
        </div>

        {/* Right Side - Controls */}
        <div className="flex items-center gap-4 z-20 shrink-0">
           <Badge variant="outline" className="hidden lg:flex gap-1.5 border-emerald-900/50 bg-emerald-950/20 text-emerald-500">
             <ShieldCheck className="w-3 h-3" />
             DETERMINISTIC
           </Badge>
           
           <Badge variant="secondary" className="hidden md:flex gap-1.5 font-mono">
             <Terminal className="w-3 h-3" />
             v1.0.2
           </Badge>

           <div className="w-px h-6 bg-border hidden sm:block"></div>

           <Button variant="ghost" size="icon" className="text-muted-foreground">
             <Moon className="w-5 h-5" />
           </Button>
        </div>
      </div>
    </header>
  );
};
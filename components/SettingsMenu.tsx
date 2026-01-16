
import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useApi } from '../contexts/ApiContext';
import { Button } from './ui/button';
import { RotateCcw, Type, Palette, Network, Server, Lock, ExternalLink, Globe } from 'lucide-react';
import { Card } from './ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { cn } from '../lib/utils';

interface SettingsMenuProps {
  onClose: () => void;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ onClose }) => {
  const { settings, updateSetting, resetTheme } = useTheme();
  const { apiSettings, updateApiSetting } = useApi();
  const [activeTab, setActiveTab] = useState("appearance");

  return (
    <Card className="absolute top-16 right-4 w-80 z-[100] shadow-2xl border-primary/20 bg-card animate-in fade-in slide-in-from-top-2 flex flex-col max-h-[80vh] overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-border bg-muted/10 shrink-0">
        <h3 className="font-bold text-sm flex items-center gap-2">
          Settings
        </h3>
        <button onClick={onClose} className="text-xs hover:underline text-muted-foreground">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 pt-3 pb-1 border-b border-border/50 sticky top-0 bg-card z-10">
                <TabsList className="w-full grid grid-cols-2 h-8">
                    <TabsTrigger value="appearance" className="text-xs">Appearance</TabsTrigger>
                    <TabsTrigger value="integrations" className="text-xs">Integrations</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="appearance" className="p-4 space-y-5 mt-0">
                {/* Background Color */}
                <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground flex justify-between">
                    App Background
                    <span className="font-mono text-[10px]">{settings.backgroundColor}</span>
                </label>
                <div className="flex items-center gap-3">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-border shadow-sm shrink-0">
                        <input 
                            type="color" 
                            value={settings.backgroundColor}
                            onChange={(e) => updateSetting('backgroundColor', e.target.value)}
                            className="absolute -top-2 -left-2 w-12 h-12 p-0 border-0 cursor-pointer"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground">Click circle to change</span>
                </div>
                </div>

                {/* Font Color */}
                <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground flex justify-between">
                    Text Color
                    <span className="font-mono text-[10px]">{settings.textColor}</span>
                </label>
                <div className="flex items-center gap-3">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-border shadow-sm shrink-0">
                        <input 
                            type="color" 
                            value={settings.textColor}
                            onChange={(e) => updateSetting('textColor', e.target.value)}
                            className="absolute -top-2 -left-2 w-12 h-12 p-0 border-0 cursor-pointer"
                        />
                    </div>
                    <span className="text-xs text-muted-foreground">Click circle to change</span>
                </div>
                </div>

                {/* Font Size */}
                <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground flex justify-between">
                    <span className="flex items-center gap-1"><Type className="w-3 h-3"/> Base Scale</span>
                    <span className="font-mono text-[10px]">{settings.fontSize}px</span>
                </label>
                <input 
                    type="range" 
                    min="12" 
                    max="24" 
                    step="1"
                    value={settings.fontSize}
                    onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Compact</span>
                    <span>Large</span>
                </div>
                </div>

                <div className="pt-2 border-t border-border">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full gap-2 text-xs"
                        onClick={resetTheme}
                    >
                        <RotateCcw className="w-3 h-3" /> Reset Appearance
                    </Button>
                </div>
            </TabsContent>

            <TabsContent value="integrations" className="p-4 space-y-6 mt-0">
                {/* Court Listener */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Globe className="w-3.5 h-3.5" /> Court Listener API
                        </h4>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={apiSettings.courtListener.enabled}
                                onChange={(e) => updateApiSetting('courtListener', 'enabled', e.target.checked)}
                            />
                            <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    <div className={cn("space-y-2 transition-opacity", !apiSettings.courtListener.enabled && "opacity-50 pointer-events-none")}>
                        <div className="relative">
                            <Lock className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
                            <input 
                                type="password"
                                className="w-full bg-muted/30 border rounded px-8 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Authentication Token"
                                value={apiSettings.courtListener.token}
                                onChange={(e) => updateApiSetting('courtListener', 'token', e.target.value)}
                            />
                        </div>
                        <a href="https://www.courtlistener.com/help/api/rest/v3/citation-lookup/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
                            API Documentation <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                    </div>
                </div>

                <div className="h-px bg-border/50" />

                {/* Doctor */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                            <Server className="w-3.5 h-3.5" /> Doctor (Free Law Project)
                        </h4>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer"
                                checked={apiSettings.doctor.enabled}
                                onChange={(e) => updateApiSetting('doctor', 'enabled', e.target.checked)}
                            />
                            <div className="w-8 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                    <div className={cn("space-y-2 transition-opacity", !apiSettings.doctor.enabled && "opacity-50 pointer-events-none")}>
                        <div className="relative">
                            <Network className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
                            <input 
                                className="w-full bg-muted/30 border rounded px-8 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                                placeholder="http://localhost:5050"
                                value={apiSettings.doctor.endpoint}
                                onChange={(e) => updateApiSetting('doctor', 'endpoint', e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-2.5 top-2.5 w-3 h-3 text-muted-foreground" />
                            <input 
                                type="password"
                                className="w-full bg-muted/30 border rounded px-8 py-2 text-xs focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Auth Token (if required)"
                                value={apiSettings.doctor.token}
                                onChange={(e) => updateApiSetting('doctor', 'token', e.target.value)}
                            />
                        </div>
                        <a href="https://github.com/freelawproject/doctor" target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1">
                            GitHub Repository <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                    </div>
                </div>
            </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};


import React, { createContext, useContext, useEffect, useState } from 'react';
import { hexToHSL } from '../lib/themeUtils';

interface ThemeSettings {
  backgroundColor: string; // HEX
  textColor: string;       // HEX
  fontSize: number;        // px
}

interface ThemeContextType {
  settings: ThemeSettings;
  updateSetting: (key: keyof ThemeSettings, value: string | number) => void;
  resetTheme: () => void;
}

const DEFAULT_THEME: ThemeSettings = {
  backgroundColor: '#0f0e0c', // Requested default
  textColor: '#e2e8f0',       // Light gray (slate-200) matches standard dark mode text
  fontSize: 16,
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<ThemeSettings>(() => {
    try {
      const saved = localStorage.getItem('app_theme_settings');
      return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  // Apply styles to document root whenever settings change
  useEffect(() => {
    const root = document.documentElement;

    // 1. Convert HEX to HSL for Tailwind variables
    const bgHSL = hexToHSL(settings.backgroundColor);
    const textHSL = hexToHSL(settings.textColor);

    // 2. Set CSS Variables
    // We update the core variables that Tailwind uses
    root.style.setProperty('--background', bgHSL);
    root.style.setProperty('--foreground', textHSL);
    
    // Also update card/popover backgrounds to blend slightly lighter/darker depending on theme
    // For simplicity in this requirement, we map card to background, but ideally, 
    // we'd calculate a slightly offset color. 
    root.style.setProperty('--card', bgHSL);
    root.style.setProperty('--card-foreground', textHSL);
    root.style.setProperty('--popover', bgHSL);
    root.style.setProperty('--popover-foreground', textHSL);

    // 3. Set Base Font Size (Responsive Scaling)
    // Tailwind uses rems. 1rem = root font-size.
    // Changing this scales the entire UI.
    root.style.fontSize = `${settings.fontSize}px`;

    // 4. Persist
    localStorage.setItem('app_theme_settings', JSON.stringify(settings));

  }, [settings]);

  const updateSetting = (key: keyof ThemeSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetTheme = () => {
    setSettings(DEFAULT_THEME);
  };

  return (
    <ThemeContext.Provider value={{ settings, updateSetting, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};

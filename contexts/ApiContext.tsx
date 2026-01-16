
import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ApiSettings {
  courtListener: {
    enabled: boolean;
    token: string;
  };
  doctor: {
    enabled: boolean;
    endpoint: string;
    token: string;
  };
}

const DEFAULT_API_SETTINGS: ApiSettings = {
  courtListener: { enabled: false, token: '' },
  doctor: { enabled: false, endpoint: 'http://localhost:5050', token: '' }
};

interface ApiContextType {
  apiSettings: ApiSettings;
  updateApiSetting: <K extends keyof ApiSettings>(section: K, key: keyof ApiSettings[K], value: any) => void;
}

const ApiContext = createContext<ApiContextType | undefined>(undefined);

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => {
    try {
      const saved = localStorage.getItem('app_api_settings');
      return saved ? { ...DEFAULT_API_SETTINGS, ...JSON.parse(saved) } : DEFAULT_API_SETTINGS;
    } catch {
      return DEFAULT_API_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem('app_api_settings', JSON.stringify(apiSettings));
  }, [apiSettings]);

  const updateApiSetting = <K extends keyof ApiSettings>(section: K, key: keyof ApiSettings[K], value: any) => {
    setApiSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };

  return (
    <ApiContext.Provider value={{ apiSettings, updateApiSetting }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) throw new Error("useApi must be used within a ApiProvider");
  return context;
};

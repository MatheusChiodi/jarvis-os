import { type ReactNode, createContext, useContext, useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';

interface ConfigContextValue {
  config: ReturnType<typeof useConfigStore>['config'];
  updateConfig: ReturnType<typeof useConfigStore>['updateConfig'];
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { config, loadConfig, updateConfig } = useConfigStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>{children}</ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig must be used within ConfigProvider');
  return context;
}

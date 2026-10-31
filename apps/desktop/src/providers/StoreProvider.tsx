import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useOverlayStore } from '../stores/overlayStore';
import { useTeamsStore } from '../stores/teamsStore';
import { useConfigStore } from '../stores/configStore';

interface StoreContextValue {
  initialized: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const initialize = useOverlayStore((s) => s.initialize);
  const loadTeams = useTeamsStore((s) => s.loadTeams);
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const [initialized, setInitialized] = React.useState(false);

  useEffect(() => {
    async function initAll() {
      await loadConfig();
      await loadTeams();
      await initialize();
      setInitialized(true);
    }
    initAll();
  }, [loadConfig, loadTeams, initialize]);

  return (
    <StoreContext.Provider value={{ initialized }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStores() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStores must be used within StoreProvider');
  return context;
}
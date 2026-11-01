import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import { FloatingButton } from './components/overlay/FloatingButton';
import { OverlayWindow } from './components/overlay/OverlayWindow';
import { useConfigStore } from './stores/configStore';
import { useOverlayStore } from './stores/overlayStore';
import { useTeamsStore } from './stores/teamsStore';

function App() {
  const { isOpen, initialize } = useOverlayStore();
  const { loadTeams } = useTeamsStore();
  const { loadConfig } = useConfigStore();

  useEffect(() => {
    async function init() {
      await loadConfig();
      await loadTeams();
      await initialize();
    }
    init();
  }, [loadConfig, loadTeams, initialize]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    invoke<() => void>('listen', { event: 'toggle-overlay' }).then((fn) => {
      unlistenFn = fn;
      fn();
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return (
    <>
      <FloatingButton />
      {isOpen && <OverlayWindow />}
    </>
  );
}

export default App;

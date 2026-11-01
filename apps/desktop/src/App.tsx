import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useOverlayStore } from './stores/overlayStore';
import { useTeamsStore } from './stores/teamsStore';
import { useConfigStore } from './stores/configStore';
import { FloatingButton } from './components/overlay/FloatingButton';
import { OverlayWindow } from './components/overlay/OverlayWindow';

function App() {
  const { isOpen, setOpen, initialize } = useOverlayStore();
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
    const unlisten = invoke('listen', { event: 'toggle-overlay' })
      .then((unlistenFn) => {
        unlistenFn(() => {
          useOverlayStore.getState().toggle();
        });
      });

    return () => {
      unlisten.then(fn => fn());
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
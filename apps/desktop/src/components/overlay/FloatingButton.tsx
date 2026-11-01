import { listen } from '@tauri-apps/api/event';
import { Brain } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useOverlayStore } from '../../stores/overlayStore';

export function FloatingButton() {
  const { isOpen, toggle } = useOverlayStore();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Listen for global hotkey from Tauri
    const unlisten = listen('toggle-overlay', () => {
      toggle();
    });

    // Keyboard shortcut as fallback (Cmd+Shift+J / Ctrl+Shift+J)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        toggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      unlisten.then((fn) => fn());
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggle]);

  if (isOpen) return null;

  return (
    <button
      ref={buttonRef}
      onClick={toggle}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-4 focus:ring-blue-500/50"
      aria-label="Open JARVIS-OS"
      title="JARVIS-OS (Win+Alt+J)"
    >
      <Brain className="w-7 h-7" />
    </button>
  );
}

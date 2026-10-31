import { useRef, useEffect, useState } from 'react';
import { Terminal, X, Maximize, Minimize, Copy, Trash2, Send } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useOverlayStore } from '../../stores/overlayStore';

export function TerminalView() {
  const { bounds } = useOverlayStore();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [terminals, setTerminals] = useState<Map<number, any>>(new Map());
  const [activeTab, setActiveTab] = useState(0);
  const [nextTabId, setNextTabId] = useState(1);

  useEffect(() => {
    if (!initialized && terminalRef.current) {
      initTerminal();
    }
  }, [initialized]);

  const initTerminal = async () => {
    // Initialize xterm.js
    const { Terminal: XTerm } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        selection: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#dcdcaa',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#9cdcfe',
        white: '#d4d4d4',
        brightBlack: '#858585',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#dcdcaa',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#9cdcfe',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    terminalRef.current?.appendChild(container);

    term.open(container);
    fitAddon.fit();

    // Connect to shell via Tauri
    const shell = await invoke('spawn_shell', { cols: term.cols, rows: term.rows });
    // TODO: Implement proper shell communication

    setTerminals(prev => new Map(prev).set(0, { term, fitAddon }));
    setInitialized(true);
  };

  const addTab = () => {
    const id = nextTabId;
    setNextTabId(n => n + 1);
    // TODO: Create new terminal
  };

  const closeTab = (id: number) => {
    if (terminals.size <= 1) return;
    const newTerminals = new Map(terminals);
    const tab = newTerminals.get(id);
    if (tab) {
      tab.term.dispose();
    }
    newTerminals.delete(id);
    setTerminals(newTerminals);
    if (activeTab === id) {
      setActiveTab(newTerminals.keys().next().value || 0);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-1">
          {Array.from(terminals.keys()).map(id => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-3 py-1.5 rounded-t-lg text-sm font-mono transition-colors ${
                activeTab === id
                  ? 'bg-gray-900 text-white border-b-2 border-transparent'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              Terminal {id + 1}
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(id); }}
                className="ml-2 p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </button>
          ))}
          <button onClick={addTab} className="p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white">
            <span className="text-lg">+</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Terminal className="w-4 h-4 text-gray-500" />
        </div>
      </div>
      <div className="flex-1 relative" ref={terminalRef}>
        {!initialized && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <Terminal className="w-12 h-12 animate-spin" />
            <span className="ml-3">Initializing terminal...</span>
          </div>
        )}
      </div>
    </div>
  );
}
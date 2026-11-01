import { Database, Kanban, MessageSquare, Settings, Terminal } from 'lucide-react';
import { useOverlayStore } from '../../stores/overlayStore';
import { ChatView } from './ChatView';
import { MemoryView } from './MemoryView';
import { PlanView } from './PlanView';
import { SettingsView } from './SettingsView';
import { TerminalView } from './TerminalView';

const views = [
  { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
  { id: 'terminal' as const, label: 'Terminal', icon: Terminal },
  { id: 'plan' as const, label: 'Plan', icon: Kanban },
  { id: 'memory' as const, label: 'Memory', icon: Database },
  { id: 'settings' as const, label: 'Settings', icon: Settings },
] as const;

export function MainView({ activeView }: { activeView: (typeof views)[number]['id'] }) {
  const { setActiveView } = useOverlayStore();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        {views.map((view) => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeView === view.id
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <view.icon className="w-4 h-4" />
            {view.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeView === 'chat' && <ChatView />}
        {activeView === 'terminal' && <TerminalView />}
        {activeView === 'plan' && <PlanView />}
        {activeView === 'memory' && <MemoryView />}
        {activeView === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}

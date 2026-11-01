import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useOverlayStore } from '../../stores/overlayStore';
import { useTeamsStore } from '../../stores/teamsStore';
import { MainView } from './MainView';
import { Statusline } from './Statusline';
import { TeamsSidebar } from './TeamsSidebar';

export function OverlayWindow() {
  const { isOpen, bounds, setBounds, setOpen, activeView, sidebarCollapsed, toggleSidebar } =
    useOverlayStore();
  const { teams, activeTeamId } = useTeamsStore();
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (windowRef.current) {
      windowRef.current.style.transform = `translate(${bounds.x}px, ${bounds.y}px)`;
      windowRef.current.style.width = `${bounds.width}px`;
      windowRef.current.style.height = `${bounds.height}px`;
    }
  }, [bounds]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-control')) return;
    dragRef.current = { x: e.clientX - bounds.x, y: e.clientY - bounds.y };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const newBounds = {
      x: e.clientX - dragRef.current.x,
      y: e.clientY - dragRef.current.y,
      width: bounds.width,
      height: bounds.height,
    };
    setBounds(newBounds);
  };

  const handleMouseUp = () => {
    dragRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const handleResize =
    (direction: 'se' | 'sw' | 'ne' | 'nw' | 'e' | 'w' | 's' | 'n') => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startBounds = { ...bounds };

      const doMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newBounds = { ...startBounds };

        if (direction.includes('e')) newBounds.width = Math.max(800, startBounds.width + dx);
        if (direction.includes('w')) {
          newBounds.width = Math.max(800, startBounds.width - dx);
          newBounds.x = startBounds.x + (startBounds.width - newBounds.width);
        }
        if (direction.includes('s')) newBounds.height = Math.max(600, startBounds.height + dy);
        if (direction.includes('n')) {
          newBounds.height = Math.max(600, startBounds.height - dy);
          newBounds.y = startBounds.y + (startBounds.height - newBounds.height);
        }

        setBounds(newBounds);
      };

      const doUp = () => {
        document.removeEventListener('mousemove', doMove);
        document.removeEventListener('mouseup', doUp);
      };

      document.addEventListener('mousemove', doMove);
      document.addEventListener('mouseup', doUp);
    };

  return (
    <div
      ref={windowRef}
      className="fixed top-0 left-0 z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
      style={{
        transform: `translate(${bounds.x}px, ${bounds.y}px)`,
        width: bounds.width,
        height: bounds.height,
      }}
      onMouseDown={handleMouseDown}
    >
      <TitleBar onClose={() => setOpen(false)} />
      <div className="flex-1 flex overflow-hidden">
        {!sidebarCollapsed && <TeamsSidebar teams={teams} activeTeamId={activeTeamId} />}
        <div
          className={`flex-1 flex flex-col transition-all duration-200 ${sidebarCollapsed ? 'ml-0' : 'ml-64'}`}
        >
          <MainView activeView={activeView} />
          <Statusline />
        </div>
      </div>

      {/* Resize handles */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize resize-handle"
        onMouseDown={handleResize('se')}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize resize-handle"
        onMouseDown={handleResize('sw')}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize resize-handle"
        onMouseDown={handleResize('ne')}
      />
      <div
        className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize resize-handle"
        onMouseDown={handleResize('nw')}
      />
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-8 cursor-e-resize resize-handle"
        onMouseDown={handleResize('e')}
      />
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 cursor-w-resize resize-handle"
        onMouseDown={handleResize('w')}
      />
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-2 cursor-s-resize resize-handle"
        onMouseDown={handleResize('s')}
      />
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-2 cursor-n-resize resize-handle"
        onMouseDown={handleResize('n')}
      />
    </div>
  );
}

function TitleBar({ onClose }: { onClose: () => void }) {
  const { sidebarCollapsed, toggleSidebar } = useOverlayStore();

  return (
    <div
      className="flex items-center justify-between h-10 px-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 -ml-1 -mr-1 -mt-1 select-none"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">J</span>
        </div>
        <span className="font-semibold text-gray-900 dark:text-white text-sm">JARVIS-OS</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' }}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' }}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

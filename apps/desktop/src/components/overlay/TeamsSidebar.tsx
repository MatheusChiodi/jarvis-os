import { FolderOpen, Plus, Settings, Bot, Users, Database, Video, Mic, TrendingUp, Grid } from 'lucide-react';
import { useTeamsStore } from '../../stores/teamsStore';
import { useOverlayStore } from '../../stores/overlayStore';
import { TeamEditor } from './TeamEditor';

const teamIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Backend: Database,
  Frontend: Globe,
  DevOps: Settings,
  Research: Bot,
  Video: Video,
  Voice: Mic,
  Trading: TrendingUp,
  General: Grid,
};

import { Globe } from 'lucide-react';

interface TeamsSidebarProps {
  teams: Array<{ id: string; name: string; description?: string }>;
  activeTeamId: string | undefined;
}

export function TeamsSidebar({ teams, activeTeamId }: TeamsSidebarProps) {
  const { setActiveTeam, createTeam, deleteTeam, updateTeam } = useTeamsStore();
  const { sidebarCollapsed, setSidebarCollapsed } = useOverlayStore();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);

  if (sidebarCollapsed) return null;

  return (
    <div className="w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Teams</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {teams.length} team{teams.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {teams.map((team) => (
          <TeamItem
            key={team.id}
            team={team}
            isActive={activeTeamId === team.id}
            onSelect={() => setActiveTeam(team.id)}
            onEdit={() => { setEditingTeam(team.id); setShowEditor(true); }}
            onDelete={() => deleteTeam(team.id)}
          />
        ))}
      </div>

      <div className="p-2 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => { setEditingTeam(null); setShowEditor(true); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      {showEditor && (
        <TeamEditor
          team={editingTeam ? teams.find(t => t.id === editingTeam) : null}
          onClose={() => { setShowEditor(false); setEditingTeam(null); }}
          onSave={(team) => {
            if (editingTeam) updateTeam(editingTeam, team);
            else createTeam(team);
            setShowEditor(false);
            setEditingTeam(null);
          }}
        />
      )}
    </div>
  );
}

function TeamItem({
  team,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  team: { id: string; name: string; description?: string };
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = teamIcons[team.name] || FolderOpen;

  return (
    <div className="relative group">
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${
          isActive
            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500'}`} />
        <span className="font-medium text-sm truncate">{team.name}</span>
      </button>

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
          aria-label="Edit team"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
          aria-label="Delete team"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
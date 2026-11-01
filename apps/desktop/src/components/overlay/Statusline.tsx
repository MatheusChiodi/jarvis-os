import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Brain, CheckCircle, Database, DollarSign, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfigStore } from '../../stores/configStore';
import { useTeamsStore } from '../../stores/teamsStore';

interface StatuslineData {
  planUsage: { fiveHour: number; sevenDay: number };
  contextWindow: number;
  cost: number;
  model: string;
  memory: { project: string; enabled: boolean; noteCount: number };
}

export function Statusline() {
  const { config } = useConfigStore();
  const { activeTeamId } = useTeamsStore();
  const [data, setData] = useState<StatuslineData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const updateStatusline = async () => {
      try {
        const result = await invoke('get_statusline_data', { projectId: activeTeamId });
        setData(result);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    updateStatusline();
    const interval = setInterval(updateStatusline, 5000);
    return () => clearInterval(interval);
  }, [activeTeamId]);

  if (!data) return null;

  const planColor =
    data.planUsage.fiveHour > 80
      ? 'text-red-500'
      : data.planUsage.fiveHour > 60
        ? 'text-yellow-500'
        : 'text-green-500';
  const ctxColor =
    data.contextWindow > 80
      ? 'text-red-500'
      : data.contextWindow > 60
        ? 'text-yellow-500'
        : 'text-green-500';

  return (
    <div className="h-8 px-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs font-mono bg-gray-50 dark:bg-gray-800">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-gray-400" />
          <span className={planColor}>
            Plan: {data.planUsage.fiveHour}% / {data.planUsage.sevenDay}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Brain className="w-3 h-3 text-gray-400" />
          <span className={ctxColor}>Ctx: {data.contextWindow}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3 h-3 text-gray-400" />
          <span>${data.cost.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500">
          <span>{data.model}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className={`flex items-center gap-1.5 ${data.memory.enabled ? 'text-green-500' : 'text-gray-400'}`}
        >
          <Database className="w-3 h-3" />
          <span>Mem: {data.memory.noteCount} notes</span>
        </div>
        <div
          className={`flex items-center gap-1.5 ${connected ? 'text-green-500' : 'text-red-500'}`}
        >
          {connected ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </div>
  );
}

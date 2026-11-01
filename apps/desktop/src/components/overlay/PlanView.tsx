import type { Plan, Task } from '@jarvis-os/core';
import { AlertTriangle, CheckSquare, Clock, Flag, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { useTeamsStore } from '../../stores/teamsStore';

export function PlanView() {
  const { activeTeamId } = useTeamsStore();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [filter, setFilter] = useState<
    'all' | 'pending' | 'in_progress' | 'review' | 'done' | 'blocked'
  >('all');

  // Mock plan data
  useEffect(() => {
    if (activeTeamId) {
      setPlan({
        id: 'plan-1',
        teamId: activeTeamId,
        goal: 'Implement user authentication with OAuth2',
        phases: [
          {
            id: 'phase-1',
            name: 'Design',
            tasks: [
              {
                id: 'task-1',
                teamId: activeTeamId,
                title: 'Create auth spec',
                description: 'Write detailed specification',
                status: 'done',
                assigneeRole: 'planner',
                dependencies: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
              {
                id: 'task-2',
                teamId: activeTeamId,
                title: 'Design database schema',
                description: 'Users, sessions, tokens tables',
                status: 'done',
                assigneeRole: 'architect',
                dependencies: ['task-1'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
          },
          {
            id: 'phase-2',
            name: 'Implementation',
            tasks: [
              {
                id: 'task-3',
                teamId: activeTeamId,
                title: 'Implement OAuth2 flow',
                description: 'Google, GitHub providers',
                status: 'in_progress',
                assigneeRole: 'coder',
                dependencies: ['task-2'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'task-4',
                teamId: activeTeamId,
                title: 'Create session management',
                description: 'JWT tokens, refresh logic',
                status: 'pending',
                assigneeRole: 'coder',
                dependencies: ['task-3'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'task-5',
                teamId: activeTeamId,
                title: 'Add protected routes',
                description: 'Middleware for auth',
                status: 'pending',
                assigneeRole: 'coder',
                dependencies: ['task-4'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          {
            id: 'phase-3',
            name: 'Testing',
            tasks: [
              {
                id: 'task-6',
                teamId: activeTeamId,
                title: 'Write unit tests',
                description: 'Auth service, middleware',
                status: 'pending',
                assigneeRole: 'tester',
                dependencies: ['task-5'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'task-7',
                teamId: activeTeamId,
                title: 'E2E auth flow tests',
                description: 'Login, logout, refresh',
                status: 'pending',
                assigneeRole: 'tester',
                dependencies: ['task-6'],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          },
        ],
        status: 'executing',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [activeTeamId]);

  if (!plan) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <Flag className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No active plan</p>
          <p className="text-sm mt-2">Select a team to view their plan</p>
        </div>
      </div>
    );
  }

  const allTasks = plan.phases.flatMap((p) => p.tasks);
  const filteredTasks = filter === 'all' ? allTasks : allTasks.filter((t) => t.status === filter);
  const stats = {
    total: allTasks.length,
    done: allTasks.filter((t) => t.status === 'done').length,
    inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
    pending: allTasks.filter((t) => t.status === 'pending').length,
    blocked: allTasks.filter((t) => t.status === 'blocked').length,
  };

  const statusColumns = [
    { id: 'pending', label: 'Pending', icon: Clock },
    { id: 'in_progress', label: 'In Progress', icon: GitBranch },
    { id: 'review', label: 'Review', icon: AlertTriangle },
    { id: 'done', label: 'Done', icon: CheckSquare },
    { id: 'blocked', label: 'Blocked', icon: Flag },
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{plan.goal}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {plan.phases.length} phases · {stats.total} tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'kanban' | 'list')}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="kanban">Kanban</option>
              <option value="list">List</option>
            </select>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              <option value="all">All ({stats.total})</option>
              <option value="pending">Pending ({stats.pending})</option>
              <option value="in_progress">In Progress ({stats.inProgress})</option>
              <option value="review">Review</option>
              <option value="done">Done ({stats.done})</option>
              <option value="blocked">Blocked ({stats.blocked})</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          {Object.entries(stats).map(([key, value]) => (
            <span key={key} className="flex items-center gap-1">
              {key === 'done' && <CheckSquare className="w-3.5 h-3.5 text-green-500" />}
              {key === 'inProgress' && <GitBranch className="w-3.5 h-3.5 text-blue-500" />}
              {key === 'pending' && <Clock className="w-3.5 h-3.5 text-yellow-500" />}
              {key === 'blocked' && <Flag className="w-3.5 h-3.5 text-red-500" />}
              <span>{value}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' ? (
          <div className="flex gap-4 p-4 overflow-x-auto h-full pb-20">
            {statusColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                label={col.label}
                Icon={col.icon}
                tasks={allTasks.filter((t) => t.status === col.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-4 overflow-y-auto">
            <div className="space-y-2">
              {filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  label,
  Icon,
  tasks,
}: { label: string; Icon: React.ComponentType<{ className?: string }>; tasks: Task[] }) {
  return (
    <div className="flex-shrink-0 w-72 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">{label}</span>
          <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded-full">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">Drop tasks here</div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    review: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    done: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    blocked: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate">
            {task.title}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {task.description}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors[task.status]}`}>
              {task.status.replace('_', ' ')}
            </span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
              {task.assigneeRole}
            </span>
          </div>
        </div>
      </div>
      {task.dependencies.length > 0 && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Depends on: {task.dependencies.join(', ')}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const statusColors: Record<string, string> = {
    pending: 'text-yellow-600 dark:text-yellow-400',
    in_progress: 'text-blue-600 dark:text-blue-400',
    review: 'text-purple-600 dark:text-purple-400',
    done: 'text-green-600 dark:text-green-400',
    blocked: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="flex items-center gap-4 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg">
      <span className={`w-5 h-5 flex-shrink-0 ${statusColors[task.status]}`}>
        {task.status === 'done' ? '✓' : task.status === 'in_progress' ? '◐' : '○'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{task.title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{task.description}</p>
      </div>
      <span
        className={`px-2 py-0.5 text-xs rounded-full ${(statusColors[task.status] || '').replace('text-', 'bg-').replace('dark:text-', 'dark:bg-').replace('600', '100').replace('400', '900/30')}`}
      >
        {task.status.replace('_', ' ')}
      </span>
      <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
        {task.assigneeRole}
      </span>
    </div>
  );
}

import { useEffect } from 'react';

import type { Team } from '@jarvis-os/core';
import { generateId, nowISO } from '@jarvis-os/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface TeamsStore {
  teams: Team[];
  activeTeamId: string | undefined;
  loadTeams: () => Promise<void>;
  createTeam: (team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Team>;
  updateTeam: (id: string, patch: Partial<Team>) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  setActiveTeam: (id: string | undefined) => void;
  getTeam: (id: string) => Team | undefined;
}

const defaultTeam: Team = {
  id: 'default',
  name: 'Default Team',
  description: 'Default team for general tasks',
  workingDir: process.cwd(),
  roles: [
    {
      id: 'planner',
      name: 'Planner',
      type: 'planner',
      skills: ['super:brainstorming', 'super:writing-plans'],
    },
    { id: 'coder', name: 'Coder', type: 'coder', skills: ['ecc:tdd-workflow', 'matt:tdd'] },
    {
      id: 'reviewer',
      name: 'Reviewer',
      type: 'reviewer',
      skills: ['ecc:code-review', 'matt:code-review'],
    },
    { id: 'tester', name: 'Tester', type: 'tester', skills: ['ecc:e2e-testing'] },
  ],
  enabledSkills: [
    'super:brainstorming',
    'super:writing-plans',
    'super:test-driven-development',
    'super:subagent-driven-development',
    'ecc:tdd-workflow',
    'ecc:code-review',
    'matt:grill-me',
    'matt:tdd',
    'matt:diagnosing-bugs',
  ],
  createdAt: nowISO(),
  updatedAt: nowISO(),
};

export const useTeamsStore = create<TeamsStore>()(
  persist(
    immer((set, get) => ({
      teams: [],
      activeTeamId: undefined,

      loadTeams: async () => {
        try {
          const { Store } = await import('@tauri-apps/plugin-store');
          const store = await Store.load('teams.json');
          const savedTeams = (await store.get('teams')) as Team[] | null;
          if (savedTeams && savedTeams.length > 0) {
            set((state) => {
              state.teams = savedTeams;
              state.activeTeamId = savedTeams[0].id;
            });
          } else {
            // Initialize with default team
            set((state) => {
              state.teams = [defaultTeam];
              state.activeTeamId = defaultTeam.id;
            });
            await get().saveTeams();
          }
        } catch {
          // Fallback to default
          set((state) => {
            state.teams = [defaultTeam];
            state.activeTeamId = defaultTeam.id;
          });
        }
      },

      saveTeams: async () => {
        try {
          const { Store } = await import('@tauri-apps/plugin-store');
          const store = await Store.load('teams.json');
          await store.set('teams', get().teams);
          await store.save();
        } catch (error) {
          console.error('Failed to save teams:', error);
        }
      },

      createTeam: async (teamData) => {
        const newTeam: Team = {
          ...teamData,
          id: generateId(),
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        set((state) => {
          state.teams.push(newTeam);
          if (state.teams.length === 1) state.activeTeamId = newTeam.id;
        });
        await get().saveTeams();
        return newTeam;
      },

      updateTeam: async (id, patch) => {
        set((state) => {
          const index = state.teams.findIndex((t) => t.id === id);
          if (index !== -1) {
            state.teams[index] = { ...state.teams[index], ...patch, updatedAt: nowISO() };
          }
        });
        await get().saveTeams();
      },

      deleteTeam: async (id) => {
        set((state) => {
          state.teams = state.teams.filter((t) => t.id !== id);
          if (state.activeTeamId === id) {
            state.activeTeamId = state.teams[0]?.id;
          }
        });
        await get().saveTeams();
      },

      setActiveTeam: (id) =>
        set((state) => {
          state.activeTeamId = id;
        }),

      getTeam: (id) => get().teams.find((t) => t.id === id),
    })),
    {
      name: 'teams-storage',
      partialize: (state) => ({ teams: state.teams, activeTeamId: state.activeTeamId }),
    }
  )
);

import { generateId, nowISO } from '@jarvis-os/core';
import type { Team, AgentRole, AgentRoleType } from '@jarvis-os/core';

interface TeamManagerOptions {
  teamsPath: string;
}

export class TeamManager {
  private teams: Map<string, Team> = new Map();
  private teamsPath: string;

  constructor(options: TeamManagerOptions) {
    this.teamsPath = options.teamsPath;
  }

  async loadTeams(): Promise<Team[]> {
    // In Tauri, load from store
    // For now, return default team if empty
    if (this.teams.size === 0) {
      this.createDefaultTeam();
    }
    return Array.from(this.teams.values());
  }

  private createDefaultTeam(): Team {
    const defaultTeam: Team = {
      id: 'default',
      name: 'Default Team',
      description: 'Default team for general tasks',
      workingDir: process.cwd(),
      roles: [
        { id: 'planner', name: 'Planner', type: 'planner', skills: ['super:brainstorming', 'super:writing-plans'] },
        { id: 'coder', name: 'Coder', type: 'coder', skills: ['ecc:tdd-workflow', 'matt:tdd'] },
        { id: 'reviewer', name: 'Reviewer', type: 'reviewer', skills: ['ecc:code-review', 'matt:code-review'] },
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
    this.teams.set(defaultTeam.id, defaultTeam);
    return defaultTeam;
  }

  async createTeam(teamData: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team> {
    const team: Team = {
      ...teamData,
      id: generateId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    // Validate roles
    this.validateRoles(team.roles);

    this.teams.set(team.id, team);
    await this.saveTeams();

    return team;
  }

  async getTeam(id: string): Promise<Team | null> {
    return this.teams.get(id) || null;
  }

  async listTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async updateTeam(id: string, patch: Partial<Team>): Promise<Team> {
    const team = this.teams.get(id);
    if (!team) throw new Error(`Team not found: ${id}`);

    const updated: Team = {
      ...team,
      ...patch,
      id: team.id, // Prevent ID change
      createdAt: team.createdAt, // Prevent createdAt change
      updatedAt: nowISO(),
    };

    if (patch.roles) {
      this.validateRoles(updated.roles);
    }

    this.teams.set(id, updated);
    await this.saveTeams();

    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    if (!this.teams.has(id)) throw new Error(`Team not found: ${id}`);
    this.teams.delete(id);
    await this.saveTeams();
  }

  private validateRoles(roles: AgentRole[]): void {
    const validTypes: AgentRoleType[] = ['planner', 'architect', 'coder', 'reviewer', 'tester', 'researcher', 'docs', 'custom'];
    const seenIds = new Set<string>();

    for (const role of roles) {
      if (!validTypes.includes(role.type)) {
        throw new Error(`Invalid role type: ${role.type}`);
      }
      if (seenIds.has(role.id)) {
        throw new Error(`Duplicate role ID: ${role.id}`);
      }
      seenIds.add(role.id);
    }
  }

  private async saveTeams(): Promise<void> {
    // In Tauri, save to store
    // For now, just keep in memory
  }
}

export function createTeamManager(options: TeamManagerOptions): TeamManager {
  return new TeamManager(options);
}
import { describe, expect, it } from 'vitest';
import { TeamManager, createTeamManager } from './teams/TeamManager';
import { WorktreeManager, createWorktreeManager } from './git/WorktreeManager';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

describe('runtime', () => {
  describe('TeamManager', () => {
    it('creates team manager instance', () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams' });
      expect(manager).toBeInstanceOf(TeamManager);
    });

    it('loadTeams returns default team when empty', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-1' });
      const teams = await manager.loadTeams();
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe('default');
      expect(teams[0].name).toBe('Default Team');
      expect(teams[0].roles).toHaveLength(4);
    });

    it('createTeam creates new team', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-2' });
      const team = await manager.createTeam({
        name: 'Test Team',
        description: 'A test team',
        workingDir: '/home/user',
        roles: [
          { id: 'dev', name: 'Developer', type: 'coder', skills: [] },
        ],
        enabledSkills: [],
      });
      expect(team.id).toBeDefined();
      expect(team.name).toBe('Test Team');
      expect(team.roles).toHaveLength(1);
    });

    it('getTeam returns team by id', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-3' });
      await manager.loadTeams();
      const team = await manager.getTeam('default');
      expect(team).not.toBeNull();
      expect(team?.id).toBe('default');
    });

    it('getTeam returns null for unknown id', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-4' });
      await manager.loadTeams();
      const team = await manager.getTeam('unknown');
      expect(team).toBeNull();
    });

    it('listTeams returns all teams', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-5' });
      await manager.loadTeams();
      const teams = await manager.listTeams();
      expect(teams).toHaveLength(1);
    });

    it('updateTeam updates team properties', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-6' });
      await manager.loadTeams();
      const updated = await manager.updateTeam('default', { name: 'Updated Team' });
      expect(updated.name).toBe('Updated Team');
      expect(updated.id).toBe('default');
    });

    it('deleteTeam removes team', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-7' });
      const team = await manager.createTeam({
        name: 'To Delete',
        description: 'Will be deleted',
        workingDir: '/home',
        roles: [],
        enabledSkills: [],
      });
      await manager.deleteTeam(team.id);
      const deleted = await manager.getTeam(team.id);
      expect(deleted).toBeNull();
    });

    it('validateRoles rejects invalid role type', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-8' });
      await expect(
        manager.createTeam({
          name: 'Invalid',
          description: 'Test',
          workingDir: '/home',
          roles: [{ id: 'r1', name: 'R1', type: 'invalid-type', skills: [] }],
          enabledSkills: [],
        })
      ).rejects.toThrow('Invalid role type');
    });

    it('validateRoles rejects duplicate role ids', async () => {
      const manager = createTeamManager({ teamsPath: '/tmp/teams-test-9' });
      await expect(
        manager.createTeam({
          name: 'Invalid',
          description: 'Test',
          workingDir: '/home',
          roles: [
            { id: 'r1', name: 'R1', type: 'coder', skills: [] },
            { id: 'r1', name: 'R2', type: 'reviewer', skills: [] },
          ],
          enabledSkills: [],
        })
      ).rejects.toThrow('Duplicate role ID');
    });
  });

  describe('WorktreeManager', () => {
    // Use current working directory which is a valid git repo
    const testRepo = process.cwd();

    it('creates worktree manager instance', () => {
      const manager = createWorktreeManager(testRepo);
      expect(manager).toBeInstanceOf(WorktreeManager);
    });

    it('hashPath produces consistent hash', () => {
      const manager = createWorktreeManager(testRepo);
      const hash1 = (manager as any).hashPath('/home/user/project');
      const hash2 = (manager as any).hashPath('/home/user/project');
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it('hashPath produces different hashes for different paths', () => {
      const manager = createWorktreeManager(testRepo);
      const hash1 = (manager as any).hashPath('/home/user/project1');
      const hash2 = (manager as any).hashPath('/home/user/project2');
      expect(hash1).not.toBe(hash2);
    });

    it('parseWorktreeList parses porcelain output', () => {
      const manager = createWorktreeManager(testRepo);
      const output = `worktree /path/to/wt1
HEAD abc123
branch refs/heads/feature1

worktree /path/to/wt2
HEAD def456
branch refs/heads/feature2
locked
prunable
`;
      const worktrees = (manager as any).parseWorktreeList(output);
      expect(worktrees).toHaveLength(2);
      expect(worktrees[0].path).toBe('/path/to/wt1');
      expect(worktrees[0].branch).toBe('feature1');
      expect(worktrees[0].commit).toBe('abc123');
      expect(worktrees[0].locked).toBeUndefined();
      expect(worktrees[0].prunable).toBeUndefined();

      expect(worktrees[1].path).toBe('/path/to/wt2');
      expect(worktrees[1].branch).toBe('feature2');
      expect(worktrees[1].commit).toBe('def456');
      expect(worktrees[1].locked).toBe(true);
      expect(worktrees[1].prunable).toBe(true);
    });

    it('init validates git repo', async () => {
      const manager = createWorktreeManager(testRepo);
      await expect(manager.init()).resolves.not.toThrow();
    });
  });
});
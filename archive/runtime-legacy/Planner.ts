import { generateId, nowISO } from '@jarvis-os/core';
import type { Plan, PlanPhase, Team } from '@jarvis-os/core';
import type { SkillRegistry } from '@jarvis-os/skills';

interface PlannerOptions {
  skillRegistry: SkillRegistry;
}

interface Spec {
  goal: string;
  requirements: string[];
  constraints: string[];
  acceptanceCriteria: string[];
}

export class Planner {
  private skillRegistry: SkillRegistry;

  constructor(options: PlannerOptions) {
    this.skillRegistry = options.skillRegistry;
  }

  async createPlan(team: Team, goal: string): Promise<Plan> {
    // Phase 1: Brainstorming (using grill-me skill)
    const spec = await this.brainstorm(team, goal);

    // Phase 2: Writing plan (using writing-plans skill)
    const plan = await this.writePlan(team, spec);

    return plan;
  }

  private async brainstorm(_team: Team, goal: string): Promise<Spec> {
    const brainstormingSkill = await this.skillRegistry.getSkill('super:brainstorming');
    if (!brainstormingSkill) {
      throw new Error('Brainstorming skill not available');
    }

    // In practice, this would invoke the skill with the team context
    // For now, return a structured spec based on the goal
    return this.generateSpec(goal);
  }

  private generateSpec(goal: string): Spec {
    // Simple spec generation based on goal keywords
    const lowerGoal = goal.toLowerCase();

    let requirements: string[] = [];
    let constraints: string[] = [];
    let acceptanceCriteria: string[] = [];

    if (lowerGoal.includes('auth') || lowerGoal.includes('login') || lowerGoal.includes('oauth')) {
      requirements = [
        'User registration with email/password',
        'OAuth2 integration (Google, GitHub)',
        'JWT token management',
        'Session handling with refresh tokens',
        'Protected routes middleware',
        'Password reset flow',
      ];
      constraints = [
        'Use bcrypt for password hashing',
        'JWT tokens must expire in 15min',
        'Refresh tokens must expire in 7 days',
        'Rate limit auth endpoints (5 req/min)',
      ];
      acceptanceCriteria = [
        'User can register with email/password',
        'User can login with Google OAuth',
        'User can login with GitHub OAuth',
        'Access token expires and refreshes automatically',
        'Protected routes return 401 without valid token',
        'Password reset email is sent',
      ];
    } else if (lowerGoal.includes('api') || lowerGoal.includes('rest')) {
      requirements = [
        'RESTful API design',
        'Input validation',
        'Error handling with proper HTTP codes',
        'API documentation (OpenAPI)',
        'Rate limiting',
      ];
      constraints = [
        'Follow REST conventions',
        'Use consistent error format',
        'Version API in URL (/api/v1/)',
      ];
      acceptanceCriteria = [
        'All endpoints return proper status codes',
        'Validation errors return 400 with details',
        'OpenAPI spec is generated',
        'Rate limiting works correctly',
      ];
    } else if (
      lowerGoal.includes('database') ||
      lowerGoal.includes('schema') ||
      lowerGoal.includes('migration')
    ) {
      requirements = [
        'Database schema design',
        'Migration scripts',
        'Seed data for development',
        'Connection pooling',
      ];
      constraints = [
        'Use migrations for all schema changes',
        'Foreign keys for relationships',
        'Indexes on frequently queried columns',
      ];
      acceptanceCriteria = [
        'Migrations run without errors',
        'Schema matches requirements',
        'Seed data loads correctly',
      ];
    } else {
      requirements = ['Implement core functionality', 'Add tests', 'Document usage'];
      constraints = ['Follow existing code patterns', 'Maintain test coverage > 80%'];
      acceptanceCriteria = ['All tests pass', 'Feature works as described'];
    }

    return { goal, requirements, constraints, acceptanceCriteria };
  }

  private async writePlan(team: Team, spec: Spec): Promise<Plan> {
    const writingPlansSkill = await this.skillRegistry.getSkill('super:writing-plans');
    if (!writingPlansSkill) {
      throw new Error('Writing plans skill not available');
    }

    // Generate plan phases and tasks based on spec
    const phases = this.generatePhases(team, spec);

    const plan: Plan = {
      id: generateId(),
      teamId: team.id,
      goal: spec.goal,
      phases,
      status: 'draft',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };

    return plan;
  }

  private generatePhases(team: Team, spec: Spec): PlanPhase[] {
    const phases: PlanPhase[] = [];

    // Phase 1: Design
    if (spec.requirements.length > 0) {
      phases.push({
        id: generateId(),
        name: 'Design',
        tasks: spec.requirements.slice(0, 3).map((req, i) => ({
          id: generateId(),
          teamId: team.id,
          title: req,
          description: `Design: ${req}`,
          status: 'pending' as const,
          assigneeRole: this.findBestRole(team, 'architect'),
          dependencies: i > 0 ? [phases[0]?.tasks[i - 1]?.id || ''] : [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        })),
      });
    }

    // Phase 2: Implementation
    const implTasks = spec.requirements.slice(3).map((req, _i) => ({
      id: generateId(),
      teamId: team.id,
      title: req,
      description: `Implement: ${req}`,
      status: 'pending' as const,
      assigneeRole: this.findBestRole(team, 'coder'),
      dependencies: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }));

    if (implTasks.length > 0) {
      // Chain implementation tasks
      for (let i = 1; i < implTasks.length; i++) {
        implTasks[i].dependencies = [implTasks[i - 1].id];
      }
      // First impl task depends on last design task
      const lastDesignTask = phases[0]?.tasks[phases[0].tasks.length - 1];
      if (lastDesignTask) {
        implTasks[0].dependencies = [lastDesignTask.id];
      }

      phases.push({
        id: generateId(),
        name: 'Implementation',
        tasks: implTasks,
      });
    }

    // Phase 3: Testing
    if (spec.acceptanceCriteria.length > 0) {
      phases.push({
        id: generateId(),
        name: 'Testing',
        tasks: spec.acceptanceCriteria.slice(0, 3).map((criteria, i) => ({
          id: generateId(),
          teamId: team.id,
          title: `Test: ${criteria}`,
          description: `Write tests for: ${criteria}`,
          status: 'pending' as const,
          assigneeRole: this.findBestRole(team, 'tester'),
          dependencies:
            i > 0
              ? [phases[2]?.tasks[i - 1]?.id || '']
              : phases[1]?.tasks[phases[1].tasks.length - 1]
                ? [phases[1].tasks[phases[1].tasks.length - 1].id]
                : [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        })),
      });
    }

    // Phase 4: Review & Documentation
    phases.push({
      id: generateId(),
      name: 'Review & Docs',
      tasks: [
        {
          id: generateId(),
          teamId: team.id,
          title: 'Code review',
          description: 'Review all changes for quality and security',
          status: 'pending' as const,
          assigneeRole: this.findBestRole(team, 'reviewer'),
          dependencies: phases[1]?.tasks[phases[1].tasks.length - 1]
            ? [phases[1].tasks[phases[1].tasks.length - 1].id]
            : [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        },
        {
          id: generateId(),
          teamId: team.id,
          title: 'Update documentation',
          description: 'Update API docs, README, and changelog',
          status: 'pending' as const,
          assigneeRole: this.findBestRole(team, 'docs'),
          dependencies: [],
          createdAt: nowISO(),
          updatedAt: nowISO(),
        },
      ],
    });

    return phases;
  }

  private findBestRole(team: Team, preferredType: string): string {
    const role = team.roles.find((r) => r.type === preferredType);
    if (role) return role.id;

    // Fallback to any role
    return team.roles[0]?.id || 'coder';
  }
}

export function createPlanner(options: PlannerOptions): Planner {
  return new Planner(options);
}

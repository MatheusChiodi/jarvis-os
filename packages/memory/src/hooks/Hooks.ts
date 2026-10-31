import type { Note } from '@jarvis-os/core';
import { generateId, nowISO } from '@jarvis-os/core';

export interface HookContext {
  vault: any; // Vault instance
  projectId: string;
  agentId: string;
  taskId?: string;
}

export interface TaskCompletedHookConfig {
  enabled: boolean;
  requiredNoteTypes: ('memory' | 'decision' | 'learning' | 'communication' | 'state')[];
}

export interface TeammateIdleHookConfig {
  enabled: boolean;
  idleThresholdMinutes: number;
  requiredNoteTypes: ('memory' | 'decision' | 'learning' | 'communication' | 'state')[];
}

const DEFAULT_TASK_COMPLETED_CONFIG: TaskCompletedHookConfig = {
  enabled: true,
  requiredNoteTypes: ['learning', 'decision'],
};

const DEFAULT_TEAMMATE_IDLE_CONFIG: TeammateIdleHookConfig = {
  enabled: true,
  idleThresholdMinutes: 10,
  requiredNoteTypes: ['state'],
};

// Task Completed Hook
// Runs when an agent marks a task as complete
export async function onTaskCompleted(context: HookContext): Promise<Note | null> {
  const config = DEFAULT_TASK_COMPLETED_CONFIG;
  if (!config.enabled) return null;

  const { vault, projectId, agentId, taskId } = context;
  if (!taskId) return null;

  // Check if a note for this task already exists
  const existingNotes = vault.listNotes({ projectId, taskId, type: 'learning', limit: 1 });
  if (existingNotes.length > 0) return null; // Already has a learning note

  // Create a prompt for the agent to write a learning note
  // In practice, this would block the task completion until the agent writes a note
  // For now, we'll create a template note that the agent should update

  const templateNote: Omit<Note, 'path'> = {
    frontmatter: {
      id: generateId(),
      type: 'learning',
      title: `Task completed: ${taskId}`,
      summary: 'Learning captured after task completion',
      tags: ['auto-generated', 'task-completion', taskId],
      agent: agentId,
      taskId,
      project: projectId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      wikilinks: [],
      pinned: false,
      archived: false,
    },
    content: `# Task Completion Learning

## Task
${taskId}

## What was done


## What worked well


## What could be improved


## Key learnings


## Related decisions

[[Decision: related-decision-id]]

## Next steps

- [ ] Follow up on...
`,
  };

  return vault.saveNote(templateNote);
}

// Teammate Idle Hook
// Runs when an agent has been idle for a configured threshold
export async function onTeammateIdle(context: HookContext): Promise<Note | null> {
  const config = DEFAULT_TEAMMATE_IDLE_CONFIG;
  if (!config.enabled) return null;

  const { vault, projectId, agentId } = context;

  // Check if agent already has a recent state note
  const recentStateNotes = vault.listNotes({
    projectId,
    agent: agentId,
    type: 'state',
    since: new Date(Date.now() - config.idleThresholdMinutes * 60 * 1000).toISOString(),
    limit: 1,
  });

  if (recentStateNotes.length > 0) return null;

  // Create a state note template for the agent to update
  const stateNote: Omit<Note, 'path'> = {
    frontmatter: {
      id: generateId(),
      type: 'state',
      title: `Agent state: ${agentId}`,
      summary: `Agent ${agentId} idle checkpoint`,
      tags: ['auto-generated', 'idle-checkpoint', agentId],
      agent: agentId,
      project: projectId,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      wikilinks: [],
      pinned: true,
      archived: false,
    },
    content: `# Agent State Checkpoint

## Agent
${agentId}

## Current Status
<!-- What were you working on when you went idle? -->

## Blockers
<!-- Any blockers that need help? -->

## Next Actions
<!-- What will you do next? -->

## Context for Next Session
<!-- Any important context to remember? -->

## Related Tasks
- [[Task: task-id]]
`,
  };

  return vault.saveNote(stateNote);
}

// Hook Registry
export class HookRegistry {
  private hooks: Map<string, (context: HookContext) => Promise<Note | null>> = new Map();

  register(name: string, hook: (context: HookContext) => Promise<Note | null>): void {
    this.hooks.set(name, hook);
  }

  unregister(name: string): void {
    this.hooks.delete(name);
  }

  async execute(name: string, context: HookContext): Promise<Note | null> {
    const hook = this.hooks.get(name);
    if (!hook) return null;
    try {
      return await hook(context);
    } catch (error) {
      console.error(`Hook ${name} failed:`, error);
      return null;
    }
  }

  getRegisteredHooks(): string[] {
    return Array.from(this.hooks.keys());
  }
}

// Default registry with built-in hooks
export const defaultHookRegistry = new HookRegistry();
defaultHookRegistry.register('taskCompleted', onTaskCompleted);
defaultHookRegistry.register('teammateIdle', onTeammateIdle);
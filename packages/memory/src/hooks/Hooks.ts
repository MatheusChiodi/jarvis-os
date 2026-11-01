import type { Note, NoteType } from '@jarvis-os/core';
import { generateId, nowISO } from '@jarvis-os/core';
import type { Vault } from '../vault/Vault.js';
import { listNotes, saveNote } from '../vault/Vault.js';

export interface HookContext {
  vault: Vault;
  projectId: string;
  agentId: string;
  taskId?: string;
}

export interface TaskCompletedHookConfig {
  enabled: boolean;
  requiredNoteTypes: NoteType[];
}

export interface TeammateIdleHookConfig {
  enabled: boolean;
  idleThresholdMinutes: number;
  requiredNoteTypes: NoteType[];
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

export interface HookResult {
  success: boolean;
  note?: Note;
  error?: string;
}

export async function onTaskCompleted(context: HookContext): Promise<HookResult> {
  const config = DEFAULT_TASK_COMPLETED_CONFIG;
  if (!config.enabled) return { success: true };

  const { vault, projectId, agentId, taskId } = context;
  if (!taskId) return { success: true, error: 'No taskId provided' };

  try {
    const existingNotes = await listNotes(vault, { taskId, type: 'learning', limit: 1 });
    if (existingNotes.length > 0) {
      return { success: true };
    }

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

    const savedNote = await saveNote(vault, templateNote);
    return { success: true, note: savedNote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function onTeammateIdle(context: HookContext): Promise<HookResult> {
  const config = DEFAULT_TEAMMATE_IDLE_CONFIG;
  if (!config.enabled) return { success: true };

  const { vault, projectId, agentId } = context;

  try {
    const recentStateNotes = await listNotes(vault, {
      agent: agentId,
      type: 'state',
      since: new Date(Date.now() - config.idleThresholdMinutes * 60 * 1000).toISOString(),
      limit: 1,
    });

    if (recentStateNotes.length > 0) {
      return { success: true };
    }

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

    const savedNote = await saveNote(vault, stateNote);
    return { success: true, note: savedNote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function onTaskStarted(context: HookContext): Promise<HookResult> {
  const { vault, projectId, agentId, taskId } = context;
  if (!taskId) return { success: true, error: 'No taskId provided' };

  try {
    const templateNote: Omit<Note, 'path'> = {
      frontmatter: {
        id: generateId(),
        type: 'state',
        title: `Task started: ${taskId}`,
        summary: `Agent ${agentId} started working on task`,
        tags: ['auto-generated', 'task-start', taskId],
        agent: agentId,
        taskId,
        project: projectId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: `# Task Started

## Task
${taskId}

## Agent
${agentId}

## Initial Plan

## Context

## Related Notes
`,
    };

    const savedNote = await saveNote(vault, templateNote);
    return { success: true, note: savedNote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function onDecisionMade(
  context: HookContext,
  decision: string,
  rationale: string
): Promise<HookResult> {
  const { vault, projectId, agentId, taskId } = context;

  try {
    const templateNote: Omit<Note, 'path'> = {
      frontmatter: {
        id: generateId(),
        type: 'decision',
        title: `Decision: ${decision.slice(0, 50)}`,
        summary: rationale.slice(0, 200),
        tags: ['auto-generated', 'decision', taskId].filter(Boolean) as string[],
        agent: agentId,
        taskId,
        project: projectId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        wikilinks: [],
        pinned: true,
        archived: false,
      },
      content: `# Decision: ${decision}

## Rationale
${rationale}

## Agent
${agentId}

## Task
${taskId || 'N/A'}

## Status
**Accepted**

## Alternatives Considered

## Consequences
`,
    };

    const savedNote = await saveNote(vault, templateNote);
    return { success: true, note: savedNote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function onCommunicationSent(
  context: HookContext,
  recipient: string,
  subject: string,
  body: string
): Promise<HookResult> {
  const { vault, projectId, agentId, taskId } = context;

  try {
    const templateNote: Omit<Note, 'path'> = {
      frontmatter: {
        id: generateId(),
        type: 'communication',
        title: `Communication: ${subject}`,
        summary: body.slice(0, 200),
        tags: ['auto-generated', 'communication', recipient, taskId].filter(Boolean) as string[],
        agent: agentId,
        taskId,
        project: projectId,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        wikilinks: [],
        pinned: false,
        archived: false,
      },
      content: `# Communication: ${subject}

## From
${agentId}

## To
${recipient}

## Task
${taskId || 'N/A'}

## Message
${body}

---
*Auto-generated from agent communication*
`,
    };

    const savedNote = await saveNote(vault, templateNote);
    return { success: true, note: savedNote };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type HookFunction = (context: HookContext, ...args: any[]) => Promise<HookResult>;

export interface HookDefinition {
  name: string;
  description: string;
  execute: HookFunction;
  config?: Record<string, unknown>;
}

export const builtInHooks: HookDefinition[] = [
  {
    name: 'taskCompleted',
    description: 'Creates a learning note when a task is completed',
    execute: onTaskCompleted,
  },
  {
    name: 'teammateIdle',
    description: 'Creates a state note when an agent goes idle',
    execute: onTeammateIdle,
  },
  {
    name: 'taskStarted',
    description: 'Creates a state note when a task is started',
    execute: onTaskStarted,
  },
  {
    name: 'decisionMade',
    description: 'Creates a decision note when a decision is made',
    execute: onDecisionMade,
  },
  {
    name: 'communicationSent',
    description: 'Creates a communication note when a message is sent',
    execute: onCommunicationSent,
  },
];

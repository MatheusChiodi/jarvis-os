// Core types for JARVIS-OS

// ============================================================================
// TEAMS
// ============================================================================

export type AgentRoleType =
  | 'planner'
  | 'architect'
  | 'coder'
  | 'reviewer'
  | 'tester'
  | 'researcher'
  | 'docs'
  | 'custom';

export interface AgentRole {
  id: string;
  name: string;
  type: AgentRoleType;
  skills: string[];
  model?: string;
  systemPrompt?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  workingDir: string;
  roles: AgentRole[];
  enabledSkills: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// MEMORY
// ============================================================================

export type NoteType = 'memory' | 'decision' | 'learning' | 'communication' | 'state';

export interface NoteFrontmatter {
  id: string;
  type: NoteType;
  title: string;
  summary: string;
  tags: string[];
  agent: string;
  taskId?: string;
  project: string;
  createdAt: string;
  updatedAt: string;
  wikilinks: string[];
  pinned: boolean;
  archived: boolean;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  content: string;
  path: string;
}

export interface NoteFilters {
  type?: NoteType;
  agent?: string;
  tag?: string;
  taskId?: string;
  since?: string;
  limit?: number;
  archived?: boolean;
}

export interface SearchResult {
  note: Note;
  score: number;
  matches: { field: string; snippet: string }[];
}

export interface SearchIndexItem {
  id: string;
  title: string;
  summary: string;
  type: NoteType;
  agent: string;
  tags: string[];
  createdAt: string;
  score: number;
}

export interface TimelineEvent {
  timestamp: string;
  notes: SearchIndexItem[];
}

export interface ObservationDetail extends Note {
  relatedNotes: SearchIndexItem[];
}

// ============================================================================
// AGENT RUNTIME
// ============================================================================

export interface Task {
  id: string;
  teamId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'review' | 'done' | 'blocked';
  assigneeRole: string;
  dependencies: string[];
  worktreePath?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PlanPhase {
  id: string;
  name: string;
  tasks: Task[];
}

export interface Plan {
  id: string;
  teamId: string;
  goal: string;
  phases: PlanPhase[];
  status: 'draft' | 'approved' | 'executing' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionResult {
  planId: string;
  results: TaskResult[];
  success: boolean;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}

// ============================================================================
// SKILLS
// ============================================================================

export type SkillInvocation = 'user' | 'model' | 'both';

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  namespace: 'ecc' | 'matt' | 'super' | 'custom';
  version: string;
  invocation: SkillInvocation;
  triggers?: string[];
  entryPoint: string;
  config?: Record<string, unknown>;
  dependencies?: string[];
  minAppVersion?: string;
  maxAppVersion?: string;
  author?: string;
  license?: string;
}

export interface SkillModule {
  default: SkillEntryPoint;
  config?: any;
}

export type SkillEntryPoint = (context: SkillContext) => Promise<SkillResult>;

export interface SkillContext {
  team: Team;
  projectRoot: string;
  memory: MemoryAPI;
  runtime: RuntimeAPI;
  ui: UIAPI;
  skillConfig: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output?: any;
  error?: string;
  artifacts?: SkillArtifact[];
}

export interface SkillArtifact {
  type: 'file' | 'note' | 'command' | 'diff';
  path?: string;
  content?: string;
  description?: string;
}

// ============================================================================
// OVERLAY STATE
// ============================================================================

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OverlayView = 'chat' | 'terminal' | 'plan' | 'memory' | 'settings';

export interface OverlayState {
  isOpen: boolean;
  bounds: OverlayBounds;
  activeTeamId?: string;
  activeView: OverlayView;
  sidebarCollapsed: boolean;
}

// ============================================================================
// INTERNAL APIs
// ============================================================================

export interface MemoryAPI {
  getVault(projectId: string): Promise<Vault>;
  createVault(projectId: string, path: string): Promise<Vault>;
  saveNote(note: Omit<Note, 'path'>): Promise<Note>;
  getNote(projectId: string, ref: string): Promise<Note | null>;
  listNotes(projectId: string, filters?: NoteFilters): Promise<Note[]>;
  archiveNote(projectId: string, ref: string): Promise<void>;
  deleteNote(projectId: string, ref: string): Promise<void>;
  searchIndex(projectId: string, query: string, limit?: number): Promise<SearchIndexItem[]>;
  getTimeline(projectId: string, around?: string, windowDays?: number): Promise<TimelineEvent[]>;
  getObservations(projectId: string, ids: string[]): Promise<ObservationDetail[]>;
  getBacklinks(projectId: string, ref: string): Promise<Note[]>;
  getGraph(projectId: string): Promise<MermaidGraph>;
  onTaskCompleted(taskId: string, agentId: string): Promise<void>;
  onTeammateIdle(agentId: string): Promise<void>;
  getStatuslineData(projectId: string): Promise<StatuslineData>;
}

export interface RuntimeAPI {
  createTeam(team: Omit<Team, 'id' | 'createdAt' | 'updatedAt'>): Promise<Team>;
  getTeam(id: string): Promise<Team | null>;
  listTeams(): Promise<Team[]>;
  updateTeam(id: string, patch: Partial<Team>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;
  createPlan(plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan>;
  executePlan(planId: string, options?: ExecuteOptions): Promise<ExecutionResult>;
  getPlanStatus(planId: string): Promise<PlanStatus>;
  createWorktree(teamId: string, branchName: string): Promise<string>;
  removeWorktree(path: string): Promise<void>;
  dispatchSubagents(tasks: Task[]): Promise<SubagentResult[]>;
  requestCodeReview(planId: string, targetBranch: string): Promise<ReviewResult>;
  verifyCompletion(planId: string): Promise<VerificationResult>;
}

export interface UIAPI {
  openOverlay(): Promise<void>;
  closeOverlay(): Promise<void>;
  toggleOverlay(): Promise<void>;
  setOverlayBounds(bounds: OverlayBounds): Promise<void>;
  setActiveView(view: OverlayView): Promise<void>;
  setActiveTeam(teamId: string): Promise<void>;
  notify(title: string, body: string, level?: 'info' | 'warning' | 'error'): Promise<void>;
  showToast(message: string, duration?: number): Promise<void>;
  updateStatusline(data: StatuslineData): Promise<void>;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

export interface Vault {
  projectId: string;
  path: string;
}

export interface MermaidGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: NoteType;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface StatuslineData {
  planUsage: { fiveHour: number; sevenDay: number };
  contextWindow: number;
  cost: number;
  model: string;
  memory: { project: string; enabled: boolean; noteCount: number };
}

export interface ExecuteOptions {
  parallel?: boolean;
  maxConcurrency?: number;
  checkpoint?: boolean;
}

export interface PlanStatus {
  planId: string;
  status: Plan['status'];
  progress: { completed: number; total: number };
  currentTask?: string;
}

export interface SubagentResult {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
}

export interface ReviewIssue {
  severity: 'critical' | 'major' | 'minor' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface VerificationResult {
  passed: boolean;
  tests: { passed: number; failed: number; skipped: number };
  lint: { passed: boolean; errors: string[] };
  typecheck: { passed: boolean; errors: string[] };
}
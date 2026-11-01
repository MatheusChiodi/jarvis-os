export {
  createVault,
  openVault,
  saveNote,
  getNote,
  listNotes,
  archiveNote,
  deleteNote,
  searchIndex,
  getTimeline,
  getObservations,
  getBacklinks,
  getGraph,
  saveEmbedding,
  getEmbedding,
  getHookState,
  setHookState,
  exportToJson,
  exportToBinary,
  closeVault,
  type Vault,
  type VaultConfig,
  type SearchOptions,
  type VaultError,
} from './vault/Vault.js';

export {
  MIGRATIONS,
  SCHEMA_VERSION,
  NOTE_TYPE_VALUES,
  type ProjectRow,
  type NoteRow,
  type NoteFtsRow,
  type NoteEmbeddingRow,
  type HookStateRow,
} from './vault/Schema.js';

export {
  createVectorIndex,
  openVectorIndex,
  embedText,
  embedTexts,
  addNote,
  addNotesBatch,
  updateNote,
  removeNote,
  search,
  hybridSearch,
  getCollectionStats,
  persistIndex,
  closeIndex,
  type VectorIndex,
  type VectorIndexConfig,
  type SearchResult,
  type VectorIndexError,
} from './search/VectorIndex.js';

export {
  createProgressiveDisclosure,
  type ProgressiveDisclosure,
  type ProgressiveDisclosureConfig,
} from './search/ProgressiveDisclosure.js';

export {
  onTaskCompleted,
  onTeammateIdle,
  onTaskStarted,
  onDecisionMade,
  onCommunicationSent,
  builtInHooks,
  type HookContext,
  type TaskCompletedHookConfig,
  type TeammateIdleHookConfig,
  type HookResult,
  type HookFunction,
  type HookDefinition,
} from './hooks/Hooks.js';

export {
  HookRegistry,
  createHookRegistry,
  registerBuiltInHooks,
  type Hook,
  type HookRegistryConfig,
} from './hooks/HookRegistry.js';

export {
  StatuslineCollector,
  createStatuslineCollector,
  type StatuslineCollectorConfig,
} from './statusline/StatuslineCollector.js';
# Fase 0 + Fase 1 (Fundação e jarvisd) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o monorepo saudável e seguro (Fase 0) e entregar o daemon `jarvisd` com um agente real, multi-provedor, com ferramentas sob permissão, falando com o overlay em streaming (Fase 1).

**Architecture:** O `jarvisd` (Node, `apps/daemon`) é a fonte de verdade: guarda sessões em `node:sqlite`, roda o `AgentLoop` (`packages/runtime`), roteia modelos por `packages/providers` (SDK `openai` com `baseURL` do 9Router/Ollama) e executa ferramentas de `packages/tools` passando por um classificador de risco e um broker de aprovações. O desktop Tauri vira cliente WebSocket autenticado por token.

**Tech Stack:** Node ≥ 22.13 (ESM), TypeScript 5.9, pnpm 9.15, Turbo 2, Vitest 2, zod 3, `openai`, `ws`, `pino`, `node:sqlite`, Tauri 2 + React.

**Spec:** `docs/superpowers/specs/2026-10-31-fase-0-1-fundacao-e-jarvisd-design.md`

## Global Constraints

- Node `>=22.13.0`; pacotes `"type": "module"`; imports relativos com sufixo `.js`; build `module`/`moduleResolution` = `NodeNext`.
- Daemon escuta só em `127.0.0.1:47800`; token em `~/.jarvis-os/daemon.token` (32 bytes hex); WS sem auth em 5 s → close `4401`.
- Diretório de dados `~/.jarvis-os/` (testes usam um `home` temporário injetado — nunca o real).
- Referência de modelo `providerId:model`, split no **primeiro** `:`.
- Fallback só em erro de rede, HTTP 429 ou 5xx, e só antes do primeiro chunk emitido.
- `agent.maxIterations = 25`, `maxToolOutputChars = 20000`, `approvalTimeoutMs = 600000`, timeout de shell 120 s.
- Sufixo de truncamento: `\n…[truncado N caracteres]`.
- Agent id da Fase 1: `"jarvis"`. Estados: `idle | thinking | typing | reading | running-tool | waiting-approval | error`.
- Códigos de erro: `UNAUTHORIZED | BAD_REQUEST | BUSY | MAX_ITERATIONS | PROVIDER_UNAVAILABLE | INTERNAL`.
- Chaves nunca em arquivos versionados nem em logs (pino `redact`). Em testes, montar strings que parecem segredo por concatenação (`'sk-' + 'a'.repeat(24)`) para não disparar o próprio scanner.
- Commits: Conventional Commits em inglês (padrão já usado no repo).
- **Outro agente já trabalha no repo** (alterações não commitadas em `packages/core` e `packages/memory`). Antes de cada tarefa: `git status`; não sobrescreva mudanças alheias — se a Task 3 já tiver sido resolvida por ele, apenas rode a verificação e marque como feita.

## Review Focus

1. **Caminhos no Windows** (`D:\VibeCode` vs `d:/vibecode`, barras mistas, `..`, symlink/junction): a sandbox compara caminhos normalizados e case-insensitive no win32, sem falso "dentro do workspace". → teste na Task 10.
2. **Palavras da denylist dentro de aspas** (`git commit -m "fix rm -rf bug"`) e encadeamentos (`ls && git push`): aceitar falso positivo (`dangerous`), nunca falso negativo. → teste na Task 10.
3. **Modelo devolve `arguments` com JSON inválido** ou ferramenta inexistente: o loop devolve erro ao modelo e continua, sem derrubar o turno. → teste na Task 14.
4. **Cliente cai no meio de um turno/aprovação pendente:** o turno segue; ao reconectar, o cliente recebe `agent.state` atual e as aprovações pendentes. → teste na Task 16.
5. **`fs_read` de arquivo binário ou gigante:** erro `arquivo binário` (byte `\0` nos primeiros 8 KB) e truncamento do texto longo. → teste na Task 11.

---

## File Structure

```
.gitignore / .gitattributes / .env.example           (feitos)
commitlint.config.mjs                                 Task 2
turbo.json, package.json                              Task 2
tools/build-scripts/check-secrets.mjs (+ .test.mjs)   Task 1
packages/core/tsconfig.build.json, src/**             Task 3
archive/runtime-legacy/                               Task 4
apps/desktop/src-tauri/{Cargo.toml,build.rs,capabilities/default.json,src/main.rs}  Tasks 5, 17
.github/workflows/ci.yml                              Task 6
packages/protocol/src/{commands,events,index}.ts      Task 7
apps/daemon/src/config.ts                             Task 8
packages/providers/src/{modelRef,router,types,index}.ts  Task 9
packages/tools/src/risk/{shell,paths}.ts              Task 10
packages/tools/src/{registry,audit,truncate}.ts, src/builtin/{fs,shell}.ts  Task 11
apps/daemon/src/store/{db,sessions}.ts                Task 12
apps/daemon/src/approvals.ts                          Task 13
packages/runtime/src/agent/{AgentLoop,systemPrompt}.ts   Task 14
packages/tools/src/builtin/memory.ts                  Task 15
apps/daemon/src/{server,dispatch,main,logger}.ts      Task 16
apps/desktop/src/lib/daemonClient.ts + views          Task 17
docs/superpowers/checklists/fase-1-aceite.md          Task 18
```

---

# FASE 0

### Task 1: Scanner de segredos no pre-commit

**Files:**
- Create: `tools/build-scripts/check-secrets.mjs`
- Test: `tools/build-scripts/check-secrets.test.mjs`

**Interfaces:**
- Produces: `export function scanText(file: string, text: string): Finding[]`, `export function isForbiddenFilename(file: string): boolean`, `type Finding = { file: string; line: number; rule: string }`. Como CLI: sem flag varre `git diff --cached --name-only --diff-filter=ACM`; com `--all` varre `git ls-files`. Ignora binários e arquivos > 1 MB.

- [ ] **Step 1: Testes que falham**

```js
const PK_HEADER = '-----BEGIN ' + 'RSA PRIVATE KEY-----';
test('detecta chave privada', () => {
  expect(scanText('a.txt', 'x\n' + PK_HEADER)).toEqual([{ file: 'a.txt', line: 2, rule: 'private-key' }]);
});
test.each([
  ['sk-' + 'a'.repeat(24), 'openai-style-key'],
  ['ghp_' + 'A'.repeat(36), 'github-token'],
  ['github_pat_' + 'A'.repeat(22), 'github-pat'],
  ['AKIA' + 'A'.repeat(16), 'aws-access-key'],
  ['xoxb-' + '1'.repeat(10), 'slack-token'],
])('detecta %s', (s, rule) => expect(scanText('f', s)[0]?.rule).toBe(rule));
test('texto limpo', () => expect(scanText('f', 'const a = 1')).toEqual([]));
test('nomes proibidos', () => {
  expect(isForbiddenFilename('.env')).toBe(true);
  expect(isForbiddenFilename('apps/x/.env.local')).toBe(true);
  expect(isForbiddenFilename('.env.example')).toBe(false);
});
```

- [ ] **Step 2:** `pnpm vitest run tools/build-scripts` → FAIL (módulo inexistente)
- [ ] **Step 3:** Implementar as regras do spec F0-1; o CLI imprime `check-secrets: possível segredo em <arquivo>:<linha> (<regra>)` e sai com 1.
- [ ] **Step 4:** Testes PASS. Manual: criar `leak.txt` com `sk-` + 24 letras, `git add leak.txt`, `node tools/build-scripts/check-secrets.mjs` → exit 1; depois `git rm --cached leak.txt` e apagar.
- [ ] **Step 5:** `git commit -m "chore(security): add staged secret scanner"`

### Task 2: Toolchain (Turbo 2, engines, hooks)

**Files:** Modify `turbo.json`, `package.json`; Create `commitlint.config.mjs`.

- [ ] **Step 1:** `turbo.json`: renomear `pipeline` → `tasks` (conteúdo igual).
- [ ] **Step 2:** `package.json`: um único `engines` `{ "node": ">=22.13.0", "pnpm": ">=9.0.0" }`; `pre-commit` = `node tools/build-scripts/check-secrets.mjs && pnpm exec lint-staged`; script `"jarvisd": "pnpm --filter @jarvis-os/daemon start"`.
- [ ] **Step 3:** `pnpm add -Dw lint-staged @commitlint/cli @commitlint/config-conventional`; `commitlint.config.mjs` = `export default { extends: ['@commitlint/config-conventional'] };`; `pnpm exec simple-git-hooks`.
- [ ] **Step 4: Verificar:** `pnpm turbo run build --dry=json` sai 0; `echo "bad message" | pnpm exec commitlint` sai ≠ 0; `echo "chore: ok" | pnpm exec commitlint` sai 0.
- [ ] **Step 5:** `git commit -m "build: migrate turbo config to v2 and install commit hooks"`

### Task 3: `core` emitindo ESM válido + `memory` verde

**Files:** Modify `packages/core/tsconfig.build.json`, `packages/core/package.json` (`build`), imports em `packages/core/src/**`.
(Coordenar: o outro agente já mexe aqui — ver `git diff packages/core` primeiro.)

- [ ] **Step 1:** Reproduzir: `pnpm --filter @jarvis-os/core build && pnpm --filter @jarvis-os/memory test` → FAIL `exports is not defined in ES module scope`.
- [ ] **Step 2:** `tsconfig.build.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"noEmit": false`; script `build` = `tsc -p tsconfig.build.json` (remover o `tsc &&` inicial); imports relativos com `.js`; apagar `packages/core/dist` antes de rebuildar.
- [ ] **Step 3:** Verificar: o mesmo comando do Step 1 → todas as suítes PASS; `packages/core/dist/index.js` sem `exports.`.
- [ ] **Step 4:** `git commit -m "fix(core): emit valid ESM so memory tests run"`

### Task 4: Cortar escopo morto

**Files:** Delete `packages/trading`, `packages/video`, `packages/voice`; Modify `tsconfig.base.json` (remover os 3 `paths`); Move `packages/runtime/src/{planner,review,tdd,executor}` → `archive/runtime-legacy/`; ajustar `exports` de `packages/runtime/package.json` (manter `.` e `./teams`; `./agent` entra na Task 14) e `src/index.ts`.

- [ ] **Step 1:** `grep -rln "@jarvis-os/\(trading\|video\|voice\)\|Planner\|CodeReviewer\|TddEnforcer\|PlanExecutor" apps packages --include=*.ts --include=*.tsx --include=*.json` — remover as referências encontradas.
- [ ] **Step 2:** Remoções/movimentos com `git rm`/`git mv`.
- [ ] **Step 3:** Verificar: `pnpm install && pnpm typecheck` sai 0.
- [ ] **Step 4:** `git commit -m "refactor: drop empty packages and archive fake runtime heuristics"`

### Task 5: Desktop compila em Tauri 2

**Files:** Modify `apps/desktop/src-tauri/Cargo.toml`, `src/main.rs`; Create `build.rs`, `capabilities/default.json`.

- [ ] **Step 1:** `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` → anotar erros (esperado: features inexistentes).
- [ ] **Step 2:** Cargo conforme spec F0-4 (`tauri` só com `tray-icon`; plugins `global-shortcut`, `store`, `log`, `opener`, `shell`, `process`; remover deps listadas). `build.rs` = `fn main() { tauri_build::build() }`. Capability `default` com `core:default`, `global-shortcut:default`, `store:default`, `opener:default`.
- [ ] **Step 3:** `main.rs`: trocar `tauri_plugin_global_hotkey` por `tauri_plugin_global_shortcut` (`Super+Alt+J` no Windows, `CmdOrCtrl+Shift+J` no macOS); **remover** `get_statusline_data`, `send_chat_message`, `memory_*`, `spawn_shell` e seus registros; manter teams/config.
- [ ] **Step 4:** Remover do frontend os `invoke` dos comandos removidos (substituídos na Task 17; até lá, as views mostram "daemon offline").
- [ ] **Step 5:** Verificar: `cargo check` sai 0; `pnpm --filter @jarvis-os/desktop typecheck` sai 0.
- [ ] **Step 6:** `git commit -m "fix(desktop): make tauri 2 build compile and drop mocked commands"`

### Task 6: CI

**Files:** Create `.github/workflows/ci.yml`.

- [ ] **Step 1:** Job `node` (ubuntu-latest): `pnpm/action-setup@v4` (9.15.0), `actions/setup-node@v4` (22.13, cache pnpm), `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `node tools/build-scripts/check-secrets.mjs --all`.
- [ ] **Step 2:** Job `tauri` (windows-latest): `dtolnay/rust-toolchain@stable`, `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- [ ] **Step 3:** Verificar localmente os mesmos comandos; YAML válido (`npx --yes yaml-lint .github/workflows/ci.yml`).
- [ ] **Step 4:** `git commit -m "ci: add lint, typecheck, test and tauri check workflow"`

**Gate da Fase 0:** `pnpm install && pnpm build && pnpm test` verdes + `cargo check` verde.

---

# FASE 1

> Pacotes novos seguem o molde de `packages/core`: `package.json` (`type: module`, `exports` → `dist`, scripts `build`/`test`/`typecheck`/`lint`), `tsconfig.json` (estende a base), `tsconfig.build.json` (NodeNext), `vitest.config.ts`. Esse scaffolding faz parte do Step 1 de cada task que cria pacote.

### Task 7: `packages/protocol`

**Files:** Create `packages/protocol/src/{commands.ts,events.ts,index.ts}`, `packages/protocol/src/protocol.test.ts`.

**Interfaces:**
- Produces: `AgentStateSchema` / `type AgentState`; `ErrorCodeSchema` / `type ErrorCode`; `RiskSchema` (`'safe' | 'write' | 'dangerous'`); `ClientCommandSchema` (union discriminada por `type`: `auth`, `session.create`, `session.list`, `session.history`, `chat.send`, `chat.cancel`, `approval.respond`) / `type ClientCommand`; `DaemonEventSchema` / `type DaemonEvent` (todos os eventos do spec 4.7, com `ts: string`); `type ToolCall = { id: string; name: string; arguments: string }`; `type ChatMessage = { id: string; sessionId: string; role: 'system'|'user'|'assistant'|'tool'; content: string; toolCalls?: ToolCall[]; toolCallId?: string; model?: string; createdAt: string }`; `parseClientCommand(raw: string): { ok: true; cmd: ClientCommand } | { ok: false; error: string }`.

- [ ] **Step 1: Testes**

```ts
test('aceita chat.send válido', () => {
  const r = parseClientCommand(JSON.stringify({ type: 'chat.send', sessionId: 's1', text: 'oi' }));
  expect(r).toEqual({ ok: true, cmd: { type: 'chat.send', sessionId: 's1', text: 'oi' } });
});
test('rejeita JSON inválido e tipo desconhecido', () => {
  expect(parseClientCommand('{').ok).toBe(false);
  expect(parseClientCommand('{"type":"rm"}').ok).toBe(false);
});
test('approval.respond só aceita approve|deny', () => {
  expect(parseClientCommand('{"type":"approval.respond","approvalId":"a","decision":"maybe"}').ok).toBe(false);
});
test('estados do agente', () => {
  expect(AgentStateSchema.options).toEqual(['idle','thinking','typing','reading','running-tool','waiting-approval','error']);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** implementar com zod → **Step 4:** PASS (`pnpm --filter @jarvis-os/protocol test`)
- [ ] **Step 5:** `git commit -m "feat(protocol): add daemon command and event schemas"`

### Task 8: Config do daemon

**Files:** Create `apps/daemon/src/config.ts`, `apps/daemon/src/config.test.ts` (+ scaffolding de `apps/daemon`, nome `@jarvis-os/daemon`).

**Interfaces:**
- Produces: `JarvisConfigSchema` / `type JarvisConfig` (formato do spec 4.3, com `daemon.host` = `z.literal('127.0.0.1')`); `loadConfig(home: string): Promise<JarvisConfig>` — cria `home`, escreve `config.json` padrão se faltar, valida; `ensureToken(home: string): Promise<string>` — lê ou gera `daemon.token` com `crypto.randomBytes(32).toString('hex')`.

- [ ] **Step 1: Testes** (em `fs.mkdtemp`):
  - `loadConfig(tmp)` sem arquivo → cria `config.json` e retorna `daemon.port === 47800`, `routes.default.length === 2`.
  - `config.json` com `daemon.host: "0.0.0.0"` → rejeita com mensagem contendo `daemon.host`.
  - `ensureToken` duas vezes → mesmo valor, casa `/^[0-9a-f]{64}$/`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(daemon): load and validate config and auth token"`

### Task 9: `packages/providers`

**Files:** Create `packages/providers/src/{types.ts,modelRef.ts,router.ts,index.ts}`, testes `modelRef.test.ts`, `router.test.ts`.

**Interfaces:**
- Consumes: `ToolCall`, `ChatMessage` de `@jarvis-os/protocol`.
- Produces:
  - `parseModelRef(ref: string): { providerId: string; model: string }`
  - `type ProviderConfig = { id: string; baseUrl: string; apiKeyEnv?: string }`
  - `type ToolSpec = { name: string; description: string; parameters: object }`; `type ChatRequest = { messages: ChatMessage[]; tools: ToolSpec[] }`
  - `type ChatChunk = { type: 'text'; text: string } | { type: 'tool_calls'; calls: ToolCall[] } | { type: 'done'; model: string; usage?: { promptTokens: number; completionTokens: number } }`
  - `interface ChatProvider { streamChat(route: string[], req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> }`
  - `class ProviderRouter implements ChatProvider` — `constructor(providers: ProviderConfig[], env: NodeJS.ProcessEnv, fetchImpl?: typeof fetch)`
  - `isRetryable(err: unknown): boolean`
  - `class ProviderUnavailableError extends Error { attempts: { ref: string; reason: string }[] }`

- [ ] **Step 1: Testes**

```ts
test('split no primeiro ":"', () => {
  expect(parseModelRef('ollama:qwen2.5-coder:7b')).toEqual({ providerId: 'ollama', model: 'qwen2.5-coder:7b' });
  expect(() => parseModelRef('semprovider')).toThrow();
});
test('fallback em 503 e reporta o modelo usado', async () => {
  // fetch fake: 9router → 503; ollama → SSE com "oi"
  const chunks = await collect(router.streamChat(['9router:m1', 'ollama:m2'], req, signal));
  expect(chunks.at(-1)).toMatchObject({ type: 'done', model: 'ollama:m2' });
});
test('sem fallback em 400', async () => {
  await expect(collect(router.streamChat(['9router:m1', 'ollama:m2'], req, signal))).rejects.toThrow(ProviderUnavailableError);
  expect(ollamaCalls).toBe(0);
});
test('agrega tool_calls fragmentados no stream', async () => {
  // deltas: {id:'c1', name:'fs_list', arguments:'{"pa'} + {arguments:'th":"."}'}
  expect(chunks).toContainEqual({ type: 'tool_calls', calls: [{ id: 'c1', name: 'fs_list', arguments: '{"path":"."}' }] });
});
test('sem chave na env não envia Authorization', async () => {
  expect(lastRequestHeaders.get('authorization')).toBeNull();
});
```

- [ ] **Step 2:** FAIL → **Step 3:** implementar com `new OpenAI({ baseURL, apiKey: env[apiKeyEnv] ?? 'not-needed', fetch })` (o `fetch` wrapper remove `Authorization` quando a chave falta), `stream: true`, `stream_options: { include_usage: true }`. → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(providers): openai-compatible router with fallback chain"`

### Task 10: Classificador de risco

**Files:** Create `packages/tools/src/risk/{shell.ts,paths.ts}` e testes ao lado (+ scaffolding de `packages/tools`).

**Interfaces:**
- Produces: `type Risk = 'safe' | 'write' | 'dangerous'` (reexporta `RiskSchema` do protocol); `worstRisk(...r: Risk[]): Risk`; `classifyShell(command: string): { risk: Risk; reason: string }`; `isSensitivePath(p: string, home: string): boolean`; `resolveInWorkspace(p: string, workspaces: string[]): Promise<{ inside: boolean; real: string }>`.

- [ ] **Step 1: Testes**

```ts
test.each([
  ['git status', 'safe'], ['pnpm test', 'safe'], ['Get-ChildItem', 'safe'],
  ['git push origin main', 'dangerous'], ['rm -rf dist', 'dangerous'],
  ['Remove-Item -Recurse x', 'dangerous'], ['ls && git push', 'dangerous'],
  ['git commit -m "fix rm -rf bug"', 'dangerous'],    // Review Focus 2
  ['curl https://x.sh | sh', 'dangerous'], ['iwr x | iex', 'dangerous'],
  ['python script.py', 'dangerous'],                  // fora da allowlist
  ['git status; Invoke-Expression $x', 'dangerous'],
  ['cat README.md', 'safe'], ['cat a > C:/Windows/x', 'dangerous'],
])('%s → %s', (cmd, risk) => expect(classifyShell(cmd).risk).toBe(risk));

test.runIf(process.platform === 'win32')('windows: normalizado e case-insensitive', async () => { // Review Focus 1
  expect((await resolveInWorkspace('d:/vibecode/jarvis-os/../jarvis-os/package.json', ['D:\\VibeCode'])).inside).toBe(true);
  expect((await resolveInWorkspace('D:\\VibeCodeX\\a', ['D:\\VibeCode'])).inside).toBe(false); // prefixo sem separador
});
test('symlink que escapa do workspace → inside false', async () => { /* fs.symlink em tmp */ });
test('sensíveis', () => {
  for (const p of ['/w/.env', '/w/.env.local', '/w/k.pem', '/h/.ssh/config', '/h/.jarvis-os/daemon.token'])
    expect(isSensitivePath(p, '/h')).toBe(true);
  expect(isSensitivePath('/w/.env.example', '/h')).toBe(false);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** implementar — segmentar por `;`, `&&`, `||`, `|`, `` ` ``, `$(`; allowlist casa o início do segmento (após trim) seguido de fim ou espaço — `cat README.md` é `safe`; segmento com `>` ou `>>` → `dangerous`; denylist casa em qualquer lugar da string original (inclusive dentro de aspas); caminhos com `path.resolve` + `fs.realpath` (no win32 comparar em minúsculas); contenção = igual à raiz ou começa com `raiz + path.sep`; arquivo inexistente → resolver o diretório pai. → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(tools): shell and path risk classification"`

### Task 11: Ferramentas embutidas, registro e auditoria

**Files:** Create `packages/tools/src/{registry.ts,audit.ts,truncate.ts}`, `src/builtin/{fs.ts,shell.ts}` e testes.

**Interfaces:**
- Consumes: Task 10.
- Produces:
  - `interface ToolContext { sessionId: string; workspaces: string[]; home: string; signal: AbortSignal; maxOutputChars: number }`
  - `interface Tool<A = unknown> { name: string; description: string; parameters: object; argsSchema: z.ZodType<A>; assessRisk(args: A, ctx: ToolContext): Promise<{ risk: Risk; reason: string }>; execute(args: A, ctx: ToolContext): Promise<{ ok: boolean; output: string; exitCode?: number }> }`
  - `class ToolRegistry { register(t: Tool): void; get(name: string): Tool | undefined; specs(): ToolSpec[] }`
  - `truncate(text: string, max: number): string`
  - `type AuditEntry = { ts: string; sessionId: string; tool: string; args: unknown; risk: Risk; decision: 'auto'|'approve'|'deny'; durationMs: number; exitCode?: number }`; `class AuditLog { constructor(file: string); append(e: AuditEntry): Promise<void> }`
  - `fsReadTool` (`{ path }`), `fsListTool` (`{ path }`), `fsWriteTool` (`{ path, content }`), `shellRunTool` (`{ command, cwd, timeoutMs? }`), `createBuiltinRegistry(): ToolRegistry`

- [ ] **Step 1: Testes**
  - `truncate('a'.repeat(25), 20)` → `'a'.repeat(20) + '\n…[truncado 5 caracteres]'`.
  - `fsReadTool.execute` em arquivo com `\0` → `{ ok: false, output: 'arquivo binário' }`; arquivo de 50 000 caracteres → saída truncada (Review Focus 5).
  - `fsWriteTool.assessRisk` dentro do workspace → `write`; em `.env` → `dangerous`; `fsReadTool.assessRisk` fora do workspace → `dangerous`.
  - `shellRunTool.assessRisk`: risco = `worstRisk(classifyShell(command), risco do cwd)`; `cwd` fora do workspace → `dangerous`.
  - `shellRunTool.execute({ command: 'node -v', cwd: tmp })` → `ok: true`, saída começa com `v`.
  - `timeoutMs: 100` em `node -e "setTimeout(()=>{},5000)"` → `ok: false`, output contém `timeout`.
  - `AuditLog.append` duas vezes → arquivo com 2 linhas JSON parseáveis.
- [ ] **Step 2:** FAIL → **Step 3:** implementar (`shell_run`: `powershell.exe -NoProfile -NonInteractive -Command` no win32, `bash -lc` nos demais; `child_process.spawn` com `signal`; no timeout matar a árvore — `taskkill /T /F /PID` no win32). → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(tools): builtin fs and shell tools with audit log"`

### Task 12: Persistência

**Files:** Create `apps/daemon/src/store/{db.ts,sessions.ts}`, `sessions.test.ts`.

**Interfaces:**
- Consumes: `ChatMessage` (Task 7).
- Produces: `openDb(file: string): DatabaseSync` (migrações via `PRAGMA user_version`; v1 = tabelas do spec 4.8); `type Session = { id: string; title: string; createdAt: string; updatedAt: string }`; `type ApprovalRecord = { id; sessionId; tool; args: unknown; reason; decision: 'pending'|'approve'|'deny'; createdAt; resolvedAt?: string }`; `class SessionStore { constructor(db: DatabaseSync); create(title?: string): Session; list(): Session[]; history(sessionId: string): ChatMessage[]; append(msg: ChatMessage & { promptTokens?: number; completionTokens?: number }): void; saveApproval(a: ApprovalRecord): void; resolveApproval(id: string, decision: 'approve'|'deny'): void; denyPendingApprovals(): number }`.

- [ ] **Step 1: Testes** (arquivo em tmp): sessão + 3 mensagens → fechar e reabrir → `history` traz as 3 em ordem e `toolCalls` volta como array; `openDb` duas vezes → `user_version === 1` sem erro; 2 aprovações pendentes → `denyPendingApprovals()` retorna 2.
- [ ] **Step 2:** FAIL → **Step 3:** implementar com `node:sqlite` (`DatabaseSync`), `toolCalls`/`args` em JSON → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(daemon): sqlite session and approval store"`

### Task 13: Broker de aprovações

**Files:** Create `apps/daemon/src/approvals.ts`, `approvals.test.ts`.

**Interfaces:**
- Produces: `type PendingApproval = { approvalId: string; sessionId: string; tool: string; args: unknown; reason: string; createdAt: string }`; `class ApprovalBroker { constructor(opts: { timeoutMs: number; onRequested(a: PendingApproval): void; onResolved(id: string, d: 'approve'|'deny'): void }); request(input: { sessionId: string; tool: string; args: unknown; reason: string }): Promise<'approve'|'deny'>; resolve(id: string, d: 'approve'|'deny'): boolean; pending(): PendingApproval[]; denyAll(): void }`.

- [ ] **Step 1: Testes** (fake timers): `resolve` approve → promessa resolve `approve`; timeout → `deny` e `onResolved(id, 'deny')`; `resolve` de id inexistente ou já resolvido → `false`; `pending()` lista só as abertas; `denyAll()` resolve todas como `deny`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(daemon): approval broker with timeout"`

### Task 14: AgentLoop

**Files:** Create `packages/runtime/src/agent/{AgentLoop.ts,systemPrompt.ts,index.ts}`, `AgentLoop.test.ts`; Modify `packages/runtime/package.json` (export `./agent`).

**Interfaces:**
- Consumes: `ChatProvider`, `ProviderUnavailableError` (Task 9); `ToolRegistry`, `ToolContext`, `AuditEntry` (Task 11); `DaemonEvent`, `ChatMessage` (Task 7).
- Produces:
  - `buildSystemPrompt(opts: { workspaces: string[]; now: Date }): string` — persona Jarvis, pt-BR, workspaces e regras de permissão.
  - `runTurn(input: { sessionId: string; history: ChatMessage[]; userText: string; route: string[]; provider: ChatProvider; tools: ToolRegistry; toolCtx: Omit<ToolContext, 'signal'>; maxIterations: number; signal: AbortSignal; approve(req: { sessionId: string; tool: string; args: unknown; reason: string }): Promise<'approve'|'deny'>; emit(e: DaemonEvent): void; audit(e: AuditEntry): Promise<void> }): Promise<{ status: 'completed'|'cancelled'|'max_iterations'|'failed'; newMessages: ChatMessage[] }>`

- [ ] **Step 1: Testes** (provider fake roteirizado):
  - Roteiro `[tool_calls fs_list] → [text "pronto"]` → `completed`; `newMessages` = user, assistant(toolCalls), tool, assistant("pronto"); eventos em ordem: `agent.state thinking`, `tool.started`, `tool.finished`, `message.delta`, `message.completed`, `agent.state idle`.
  - Ferramenta `dangerous` com `approve` → `deny`: resultado da tool = `"negado pelo usuário"`, `execute` não é chamado, `waiting-approval` emitido, audit com `decision: 'deny'`.
  - `arguments: '{quebrado'` e ferramenta `nao_existe` → mensagens `tool` com erro e o turno termina `completed` (Review Focus 3).
  - Provider que sempre pede tool → `max_iterations` após 25 chamadas + `error MAX_ITERATIONS`.
  - `abort()` durante o stream → `cancelled`.
  - `ProviderUnavailableError` → `failed`, `error PROVIDER_UNAVAILABLE`, `agent.state error`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar. Estados: `thinking` antes de chamar o modelo, `typing` no primeiro `text`, `reading` em `fs_read`/`fs_list`/`memory_search`, `running-tool` nas demais, `waiting-approval` aguardando, `idle` ao fim. Risco `safe`/`write` → executa com `decision: 'auto'`. → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(runtime): agent loop with streaming, tools and approvals"`

### Task 15: Ferramentas de memória

**Files:** Create `packages/tools/src/builtin/memory.ts`, `memory.test.ts`. Depende da Task 3.

**Interfaces:**
- Consumes: API pública de `@jarvis-os/memory` (ler `packages/memory/src/index.ts` e usar os métodos existentes de busca e criação de nota do `Vault`; não criar API nova).
- Produces: `type VaultLike` (subconjunto mínimo usado); `createMemoryTools(vault: VaultLike): Tool[]` → `memory_search { query: string; limit?: number }` (`safe`) e `memory_save { type: NoteType; title: string; summary: string; body: string; tags?: string[] }` (`write`).

- [ ] **Step 1: Testes** com vault real em tmp: `memory_save` e depois `memory_search` pelo título → output contém o título; `type` inválido → `ok: false`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS
- [ ] **Step 5:** `git commit -m "feat(tools): memory search and save tools"`

### Task 16: Servidor do daemon

**Files:** Create `apps/daemon/src/{server.ts,dispatch.ts,main.ts,logger.ts}`, `server.test.ts`; Modify `apps/daemon/package.json` (`start`: `node dist/main.js`, `dev`: `tsx watch src/main.ts`).

**Interfaces:**
- Consumes: Tasks 7, 8, 9, 11, 12, 13, 14, 15.
- Produces: `startDaemon(opts: { home: string; provider?: ChatProvider; port?: number; authTimeoutMs?: number }): Promise<{ port: number; close(): Promise<void> }>` (porta `0` = aleatória; `authTimeoutMs` padrão 5000); `createLogger(home: string): pino.Logger` em `home/logs/jarvisd.log` com `redact: ['*.apiKey', '*.token', 'headers.authorization']`.

- [ ] **Step 1: Testes de integração** (cliente `ws`, provider fake, home tmp):
  - `GET /health` → `{ status: 'ok', version: '0.1.0' }`.
  - Sem `auth` (`authTimeoutMs: 50`) → close `4401`; token errado → `4401`.
  - Handshake com `Origin: http://evil.com` → recusado.
  - `session.create` → `chat.send` → recebe `message.delta` e `message.completed`; `session.history` traz user + assistant.
  - `chat.send` durante turno ativo → `error BUSY`.
  - Frame `"{"` → `error BAD_REQUEST` e a conexão segue aberta.
  - Tool `dangerous` pendente → cliente desconecta → novo cliente autentica → recebe `agent.state waiting-approval` e `approval.requested` com o mesmo `approvalId`; `approval.respond deny` → turno conclui (Review Focus 4).
  - `close()` + `startDaemon` no mesmo home → `session.list` mantém a sessão; aprovações pendentes viraram `deny`.
  - O conteúdo de `daemon.token` não aparece em `jarvisd.log`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar — `http.createServer` + `new WebSocketServer({ server, verifyClient })` (origens do spec 4.4); um `AbortController` e flag de turno por sessão; broadcast a todos os clientes autenticados; `main.ts`: `home = os.homedir()/.jarvis-os`, `process.loadEnvFile(home/.env)` se existir, `loadConfig`, `ensureToken`, `SIGINT/SIGTERM` → `denyAll` + `close`; log `jarvisd ouvindo em 127.0.0.1:47800`. → **Step 4:** PASS
- [ ] **Step 5:** Manual: `pnpm jarvisd` sobe e `curl http://127.0.0.1:47800/health` responde ok.
- [ ] **Step 6:** `git commit -m "feat(daemon): websocket server wiring agent loop, store and approvals"`

### Task 17: Desktop como cliente do daemon

**Files:** Create `apps/desktop/src/lib/daemonClient.ts`, `daemonClient.test.ts`, `src/components/overlay/ApprovalModal.tsx`, `src/stores/daemonStore.ts`; Modify `ChatView.tsx`, `TerminalView.tsx`, `OverlayWindow.tsx`, `src-tauri/src/main.rs` (comando `get_daemon_token`).

**Interfaces:**
- Consumes: `@jarvis-os/protocol`.
- Produces: `createDaemonClient(opts: { url: string; getToken(): Promise<string>; WebSocketImpl?: typeof WebSocket }): DaemonClient`; `interface DaemonClient { connect(): void; close(): void; send(cmd: ClientCommand): void; on<T extends DaemonEvent['type']>(type: T, h: (e: Extract<DaemonEvent, { type: T }>) => void): () => void; onStatus(h: (s: 'connecting'|'online'|'offline') => void): () => void }`. Rust: `#[tauri::command] fn get_daemon_token() -> Result<String, String>` lendo `dirs::home_dir()/.jarvis-os/daemon.token`.

- [ ] **Step 1: Testes** (`daemonClient.test.ts` com WebSocket fake): o primeiro frame após abrir é `auth`; evento inválido é ignorado sem lançar; após queda reconecta em 1 s, 2 s, 4 s… teto 30 s (fake timers); status `connecting → online → offline`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar client + `daemonStore` (zustand: status, sessões, mensagens em streaming, aprovações pendentes) → **Step 4:** PASS
- [ ] **Step 5:** Ligar views: `ChatView` (streaming de `message.delta`), `TerminalView` (lista `tool.started/finished` de `shell_run` com comando, exit code e preview), `ApprovalModal` (aprovar/negar; mostra `tool`, `args`, `reason`), banner "daemon offline — rode `pnpm jarvisd`".
- [ ] **Step 6:** Verificar: `pnpm --filter @jarvis-os/desktop test` e `typecheck` verdes; `cargo check` verde.
- [ ] **Step 7:** `git commit -m "feat(desktop): connect overlay to jarvisd over websocket"`

### Task 18: Checklist de aceite da Fase 1

**Files:** Create `docs/superpowers/checklists/fase-1-aceite.md`.

- [ ] **Step 1:** Transcrever os 7 critérios do spec 4.10 como checklist, com o comando/prompt exato de cada um.
- [ ] **Step 2:** Executar com 9Router e Ollama reais; registrar OK/falha + observação no próprio arquivo.
- [ ] **Step 3:** `git commit -m "docs: record phase 1 acceptance run"`

---

## Depois deste plano (planos separados)

| Fase | Plano futuro |
|---|---|
| 2 | Fila de tarefas + 3–5 agentes + worktree por agente + travas de arquivo |
| 3 | `packages/pixel`: escritório PixiJS consumindo `agent.state` |
| 4 | Serviço do Windows, cron, watchdog, orçamento diário por provedor |
| 5 | Autoaperfeiçoamento: notas → skills/prompts; PRs do próprio código com gate de testes + aprovação |
| 6 | Escala para até 20 agentes (mix Ollama local/9Router), voz |

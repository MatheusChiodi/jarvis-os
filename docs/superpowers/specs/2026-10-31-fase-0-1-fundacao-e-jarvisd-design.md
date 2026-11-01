---
title: "Spec — Fase 0 (Fundação) e Fase 1 (jarvisd + primeiro agente real)"
status: draft
author: Matheus Chiodi
created: 2026-10-31
supersedes_parts_of: docs/TECHNICAL_SPEC.md (seções 2.4, 2.6–2.8 ficam adiadas)
---

# Spec — Fase 0 e Fase 1

## 1. Contexto e objetivo

O JARVIS-OS deve virar um assistente pessoal que roda 24h, substitui o terminal no dia a dia,
usa provedores locais/roteados (9Router, Ollama) e, nas fases seguintes, coordena até 20 agentes
visualizados como uma "empresa" em pixel art.

Diagnóstico do estado em 2026-10-31:
- A UI (Tauri + React) existe, mas o backend Rust devolve **mocks** (`send_chat_message` ecoa, statusline fixo, busca falsa, `spawn_shell` não faz nada).
- `packages/runtime` não chama nenhum LLM: `Planner` gera spec por `if (goal.includes('auth'))`.
- `skills`, `voice`, `video`, `trading`, `pixel`, `ui-kit` têm 0 linhas.
- `packages/memory` é o único código real, mas 5/6 suítes falham (`exports is not defined in ES module scope` — `dist` do `core` incompatível com ESM).
- `turbo.json` usa a chave `pipeline` (Turbo 1.x), mas o Turbo instalado é **2.11** (exige `tasks`).
- Hooks git chamam `lint-staged` e `commitlint`, que **não estão instalados**.
- `src-tauri/Cargo.toml` usa features de Tauri 1 (`global-hotkey`, `fs`, `shell`…) que não existem no Tauri 2, falta `build.rs`, e o código usa `tauri_plugin_global_hotkey` (o plugin oficial é `tauri-plugin-global-shortcut`). O desktop **não compila**.

**Objetivo da Fase 0:** base que instala, compila, testa e protege segredos.
**Objetivo da Fase 1:** um daemon `jarvisd` sempre ativo, com **um agente real** que conversa por
9Router/Ollama, executa shell e arquivos com permissões, persiste sessões e transmite eventos ao
overlay — o suficiente para substituir parte do terminal.

## 2. Fora de escopo (adiado)

Múltiplos agentes e fila de tarefas (Fase 2) · escritório pixel (Fase 3) · serviço do Windows,
cron, watchdog e orçamento (Fase 4) · autoaperfeiçoamento (Fase 5) · voz, vídeo, trading (Fase 6+).
O protocolo de eventos da Fase 1 **já é desenhado** para servir essas fases (campo `agentId`, estados visuais).

---

## 3. Fase 0 — Fundação

### F0-1 Higiene e segredos
- `.gitignore`, `.gitattributes`, `.env.example` na raiz (já criados em 2026-10-31).
- Segredos **nunca** no repositório: chaves só em variáveis de ambiente / `~/.jarvis-os/.env`.
- Hook `pre-commit` roda `tools/build-scripts/check-secrets.mjs` sobre os arquivos *staged* e
  bloqueia o commit se encontrar: `-----BEGIN .*PRIVATE KEY-----`, `sk-[A-Za-z0-9_-]{20,}`,
  `ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{22,}`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-[A-Za-z0-9-]{10,}`,
  ou arquivos cujo nome case com `.env` (exceto `*.example`).
- Saída do bloqueio: `check-secrets: possível segredo em <arquivo>:<linha> (<regra>)`; exit code 1.

### F0-2 Toolchain consistente
- `turbo.json`: `pipeline` → `tasks` (Turbo 2).
- `package.json` raiz: remover o bloco `engines` duplicado; ficar com `"node": ">=22.13.0"` (necessário para `node:sqlite` sem flag), `"pnpm": ">=9.0.0"`.
- Hooks: instalar `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`; criar `commitlint.config.mjs`. `pre-commit` = `node tools/build-scripts/check-secrets.mjs && pnpm exec lint-staged`.
- `core` emite ESM válido: `tsconfig.build.json` com `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`; imports relativos com extensão `.js`. Critério: `pnpm --filter @jarvis-os/memory test` passa 100%.

### F0-3 Cortar escopo morto
- Remover do workspace `packages/trading`, `packages/video`, `packages/voice` (só têm `package.json`) e seus `paths` em `tsconfig.base.json`. `pixel` e `ui-kit` permanecem (Fase 3).
- Mover `Planner.ts`, `CodeReviewer.ts`, `TddEnforcer.ts`, `PlanExecutor.ts` (heurísticas falsas) para `archive/runtime-legacy/` fora do workspace. `TeamManager` e `WorktreeManager` ficam.

### F0-4 Desktop compila
- `Cargo.toml`: `tauri = { version = "2", features = ["tray-icon"] }`; plugins via crates
  (`tauri-plugin-global-shortcut`, `-store`, `-log`, `-opener`, `-shell`, `-process`);
  remover deps não usadas (`sqlx`, `sqlx-core`, `r2d2`, `r2d2_sqlite`, `notify`, `glob`, `walkdir`, `ignore`, `clap`).
- Adicionar `src-tauri/build.rs` (`tauri_build::build()`) e `src-tauri/capabilities/default.json`.
- Comandos Rust mockados de chat/memória/shell/statusline são **removidos** — passam a vir do daemon (Fase 1).
- Critério: `cargo check` em `apps/desktop/src-tauri` sem erros.

### F0-5 CI
- `.github/workflows/ci.yml`: Node 22.13, pnpm 9.15; `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`; job separado `cargo check` em `windows-latest`.

**Definição de pronto da Fase 0:** `pnpm install && pnpm build && pnpm test` verdes; `cargo check` verde; commit com uma chave falsa `sk-test...` é bloqueado.

---

## 4. Fase 1 — jarvisd + primeiro agente real

### 4.1 Arquitetura

```
apps/desktop (Tauri/React)  ──WebSocket+token──►  apps/daemon (jarvisd, Node)
                                                    ├─ packages/protocol  (schemas zod)
                                                    ├─ packages/providers (router OpenAI-compatível)
                                                    ├─ packages/tools     (shell/fs + permissões)
                                                    ├─ packages/runtime   (AgentLoop)
                                                    └─ packages/memory    (vault existente)
```

- O daemon é a fonte de verdade; a UI é um cliente descartável. Fechar a janela não interrompe o agente.
- Na Fase 1 o daemon é iniciado manualmente (`pnpm jarvisd`); o desktop mostra "daemon offline" se `/health` falhar.

### 4.2 Pacotes novos

| Pacote | Responsabilidade |
|---|---|
| `packages/protocol` | Schemas zod de comandos e eventos; tipos compartilhados UI↔daemon |
| `packages/providers` | Registro de provedores, resolução `providerId:model`, fallback, streaming com tool calls |
| `packages/tools` | Ferramentas do agente, classificador de risco, sandbox de caminhos |
| `apps/daemon` | Servidor HTTP+WS, sessões, aprovações, persistência, logs |

Dependências novas: `openai` (SDK, usado com `baseURL` do 9Router/Ollama), `ws`, `pino`. Persistência com `node:sqlite` (sem build nativo).

### 4.3 Configuração — `~/.jarvis-os/config.json`

```json
{
  "daemon": { "host": "127.0.0.1", "port": 47800 },
  "providers": [
    { "id": "9router", "baseUrl": "http://localhost:20128/v1", "apiKeyEnv": "NINEROUTER_API_KEY" },
    { "id": "ollama",  "baseUrl": "http://localhost:11434/v1", "apiKeyEnv": "OLLAMA_API_KEY" }
  ],
  "routes": {
    "default": ["9router:<modelo>", "ollama:qwen2.5-coder:7b"]
  },
  "workspaces": ["D:/VibeCode"],
  "agent": { "maxIterations": 25, "maxToolOutputChars": 20000, "approvalTimeoutMs": 600000 }
}
```

- Validado por zod na inicialização; erro de config = daemon não sobe e loga o campo inválido.
- Referência de modelo `providerId:model` é dividida **no primeiro `:`** (modelos Ollama têm `:` no nome).
- `routes.default` é uma cadeia de fallback: tenta o próximo em erro de rede, HTTP 429 ou 5xx. HTTP 4xx (exceto 429) não faz fallback.
- Chave ausente na env → envia sem `Authorization` (Ollama/9Router locais). Chaves nunca aparecem em logs (pino `redact`: `*.apiKey`, `headers.authorization`).
- Arquivos padrão se não existirem: o daemon cria `config.json` com o exemplo acima e `daemon.token`.

### 4.4 Segurança do daemon
- Escuta **apenas** em `127.0.0.1`. Bind em outro host é recusado.
- Token aleatório de 32 bytes (hex) em `~/.jarvis-os/daemon.token`, gerado na primeira execução.
- WS: o token vai no primeiro frame `{ "type": "auth", "token": "..." }`; sem auth válida em 5 s → fecha com código 4401. HTTP `/health` é público e não retorna dados sensíveis.
- Header `Origin` aceito apenas: ausente, `tauri://localhost`, `http://tauri.localhost`, `http://localhost:1420` (dev).

### 4.5 Ferramentas e permissões

Ferramentas da Fase 1: `fs_read`, `fs_list`, `fs_write`, `shell_run`, `memory_search`, `memory_save`.

Níveis de risco:
| Nível | Comportamento |
|---|---|
| `safe` | executa direto |
| `write` | executa direto, registra no log de auditoria |
| `dangerous` | emite `approval.requested`, aguarda decisão; timeout (10 min) = negado |

Regras:
- **Sandbox de caminho:** todo caminho é resolvido com `realpath`; precisa estar dentro de um dos `workspaces`. Fora disso → `dangerous`. Symlink que escapa do workspace → `dangerous`.
- **Arquivos sensíveis** (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `~/.jarvis-os/daemon.token`, `~/.ssh/**`): leitura e escrita sempre `dangerous`.
- `fs_read`/`fs_list` dentro do workspace → `safe`. `fs_write` dentro do workspace → `write`.
- `shell_run`:
  - `safe` se o comando inteiro casa com a allowlist de leitura: `git status|log|diff|show|branch`, `ls`, `dir`, `pwd`, `cat`, `type`, `Get-Content`, `Get-ChildItem`, `rg`, `grep`, `node -v`, `pnpm -v`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.
  - `dangerous` se contém qualquer padrão da denylist: `rm -rf`, `rm -r`, `Remove-Item`, `del /`, `rd /s`, `format`, `shutdown`, `reg `, `git push`, `git reset --hard`, `git clean`, `curl … | sh`, `iwr … | iex`, `Invoke-Expression`, `npm publish`, `pnpm publish`, qualquer redirecionamento `>`/`>>`.
  - A allowlist casa o início do segmento seguido de fim ou espaço (`cat README.md` é `safe`).
  - Comandos com `;`, `&&`, `||`, `|` ou subshell são avaliados por segmento; o nível final é o **pior** segmento.
  - Qualquer outro comando → `dangerous` (padrão negar até aprovar).
  - Shell: `powershell.exe -NoProfile -NonInteractive -Command` no Windows, `bash -lc` nos demais; `cwd` obrigatório dentro do workspace; timeout padrão 120 s; saída truncada em `maxToolOutputChars` com sufixo `\n…[truncado N caracteres]`.
- Toda execução (qualquer nível) gera linha no log de auditoria `~/.jarvis-os/logs/audit.jsonl`: `{ts, sessionId, tool, args, risk, decision, durationMs, exitCode}`.

### 4.6 AgentLoop
- Turno: mensagem do usuário → chamada ao modelo com histórico + ferramentas → se houver tool calls, executa (respeitando permissões), anexa resultados, repete → termina quando o modelo responde sem tool calls ou ao atingir `maxIterations` (25), emitindo `error` com `code: "MAX_ITERATIONS"`.
- Streaming: deltas de texto viram `message.delta`.
- Cancelamento: `chat.cancel` aborta a requisição em curso (AbortController) e marca o turno como `cancelled`.
- Prompt de sistema define a persona Jarvis, em pt-BR, lista os workspaces e as regras de permissão.
- Uma sessão processa um turno por vez; `chat.send` durante um turno ativo → `error` `code: "BUSY"`.

### 4.7 Protocolo (WS, JSON)

Cliente → daemon:
- `auth {token}`
- `session.create {title?}` → responde `session.created {session}`
- `session.list {}` → `session.list.result {sessions}`
- `session.history {sessionId}` → `session.history.result {messages}`
- `chat.send {sessionId, text}`
- `chat.cancel {sessionId}`
- `approval.respond {approvalId, decision: "approve" | "deny"}`

Daemon → cliente (todos com `ts` ISO e `sessionId` quando aplicável):
- `agent.state {agentId, state}` — `state ∈ idle | thinking | typing | reading | running-tool | waiting-approval | error`
- `message.delta {messageId, text}`
- `message.completed {message, usage?: {promptTokens, completionTokens}, model}`
- `tool.started {callId, tool, args, risk}` / `tool.finished {callId, ok, outputPreview, durationMs}`
- `approval.requested {approvalId, tool, args, reason}` / `approval.resolved {approvalId, decision}`
- `error {code, message}` — códigos: `UNAUTHORIZED`, `BAD_REQUEST`, `BUSY`, `MAX_ITERATIONS`, `PROVIDER_UNAVAILABLE`, `INTERNAL`

Mensagem inválida (falha no zod) → `error BAD_REQUEST` sem derrubar a conexão.
Desconexão do cliente **não** interrompe o turno. Após cada `auth` bem-sucedido, o daemon reenvia o
`agent.state` atual e um `approval.requested` para cada aprovação ainda pendente.
O `agentId` na Fase 1 é sempre `"jarvis"`; os estados são exatamente os que o escritório pixel vai animar.

### 4.8 Persistência — `~/.jarvis-os/jarvis.db` (`node:sqlite`)
- `sessions(id TEXT PK, title TEXT, created_at TEXT, updated_at TEXT)`
- `messages(id TEXT PK, session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, tool_call_id TEXT, model TEXT, prompt_tokens INT, completion_tokens INT, created_at TEXT)`
- `approvals(id TEXT PK, session_id TEXT, tool TEXT, args TEXT, reason TEXT, decision TEXT, created_at TEXT, resolved_at TEXT)`
- Migrações versionadas por `PRAGMA user_version`. Reiniciar o daemon preserva sessões e histórico; aprovações pendentes no shutdown viram `denied`.

### 4.9 Desktop
- `apps/desktop/src/lib/daemonClient.ts`: conecta, autentica, reconecta com backoff (1 s, 2 s, 4 s… máx. 30 s), expõe `send(cmd)` e `on(eventType, handler)`.
- O token é lido por um comando Tauri `get_daemon_token` (Rust lê `~/.jarvis-os/daemon.token`).
- `ChatView` usa o streaming real; `TerminalView` mostra `tool.started/finished` de `shell_run`; um modal de aprovação responde a `approval.requested`; o indicador "daemon offline" aparece quando o WS cai.

### 4.10 Critérios de aceitação da Fase 1
1. `pnpm jarvisd` sobe, cria `config.json`/`daemon.token` se faltarem e responde `GET /health` → `{"status":"ok","version":"0.1.0"}`.
2. Pelo overlay, "liste os arquivos de D:/VibeCode/jarvis-os" executa `fs_list` (sem aprovação) e responde em streaming.
3. "rode git push" gera um modal de aprovação; negar → o agente informa que não executou.
4. Com o 9Router desligado, a resposta vem do Ollama (fallback) e `message.completed.model` indica `ollama:…`.
5. Fechar e reabrir o overlay mostra o histórico; reiniciar o daemon também.
6. Ler `.env` sempre pede aprovação; nenhuma chave aparece em `jarvisd.log`.
7. Cliente sem token é desconectado com 4401.

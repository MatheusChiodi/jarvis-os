# ADR-002: Monorepo with pnpm Workspaces + Turborepo

**Date:** 2026-10-31
**Status:** Accepted
**Author:** Matheus Chiodi

## Context

JARVIS-OS consiste de múltiplos packages interdependentes:
- `core` - Types, constants, utilities
- `memory` - Vault, search, hooks, statusline
- `runtime` - Teams, plans, tasks, git worktrees, TDD, review
- `skills` - Registry, loader, built-in skills (ECC, mattpocock, superpowers)
- `voice` - Wake word, STT, TTS, teleprompter
- `video` - HyperFrames, Remotion, Frame.md
- `pixel` - Pixel Agents visualizer client
- `trading` - TradingAgents integration
- `ui-kit` - Shared React components (shadcn-based)
- `apps/desktop` - Tauri app
- `apps/cli` - CLI headless (opcional)

Precisamos de: instalação rápida, dedup de deps, build incremental, versionamento independente, shared tooling.

## Decision

Usar **pnpm workspaces** + **Turborepo** para gerenciar o monorepo.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **npm workspaces** | Built-in, no extra tool | Slow, no dedup, no build caching |
| **yarn workspaces** | Mature, plug'n'play | Slower than pnpm, PnP issues |
| **pnpm workspaces** | **Fast, strict, excellent dedup, disk efficient** | **Slightly different CLI** |
| **Turborepo** | **Smart build caching, task pipeline, remote caching** | **Extra config** |
| **Nx** | Powerful, great Angular/React support | Heavy, opinionated, steep learning curve |
| **Rush** | Microsoft-backed, strict | Complex config, slower |

## Consequences

### Positive
- **pnpm**: Instalação 2-3x mais rápida que npm/yarn, dedup automático, `node_modules` flat, strict peer deps
- **Turborepo**: Build/test incremental inteligente, pipeline de tasks, remote caching (Vercel), parallel execution
- **Versionamento independente**: Cada package com seu `package.json` e version
- **Shared tooling**: `tsconfig.base.json`, `biome.json`, `vitest.config.ts` no root
- **Publishing**: `pnpm publish` por package ou `changesets` para versionamento coordenado

### Negative
- **pnpm quirks**: `peerDependencies` mais estritos, `hoist` patterns diferentes
- **Turborepo config**: `turbo.json` pipeline definition requer entendimento de deps
- **IDE support**: VS Code precisa `pnpm` configurado como package manager

## Implementation

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
  - "tools/*"
```

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "build/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {},
    "format": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  },
  "globalEnv": ["NODE_ENV", "JARVIS_LOG_LEVEL"]
}
```

```json
// package.json (root)
{
  "name": "jarvis-os",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "turbo run format",
    "typecheck": "turbo run typecheck",
    "dev": "turbo run dev --filter=@jarvis-os/desktop",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "changeset publish"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "latest",
    "biome": "latest",
    "@changesets/cli": "latest",
    "vitest": "latest"
  },
  "packageManager": "pnpm@9.0.0"
}
```

## References

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo Docs](https://turbo.build/repo/docs)
- [Changesets](https://github.com/changesets/changesets)
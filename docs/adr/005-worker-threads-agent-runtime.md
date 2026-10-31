# ADR-005: Worker Threads for Agent Runtime

**Date:** 2026-10-31
**Status:** Accepted
**Author:** Matheus Chiodi

## Context

Agent runtime executa código não-confiável (LLM output, tool calls):
- Múltiplos agents rodando em paralelo
- Isolamento de memória/CPU entre agents
- Crash de um agent não deve derrubar o overlay
- Comunicação eficiente com main thread
- Acesso a filesystem, git, shell commands

## Decision

Usar **Node.js Worker Threads** (`worker_threads`) para agents + **child_process** para CLI tools externos (git, claude, npx).

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Worker Threads** | **Shared memory (SharedArrayBuffer), fast IPC, mesmo processo, TypeScript nativo** | **Single-threaded event loop por worker, SharedArrayBuffer requer COOP/COEP** |
| **child_process (fork)** | Isolamento total de processo, crash isolation | IPC mais lento (JSON/stdio), overhead de processo |
| **Electron UtilityProcess** | Sandbox, crash isolation, Chromium integration | Electron-specific, mais pesado |
| **Tauri Sidecar** | Rust performance, true isolation | Complex build, cross-compile, IPC custom |
| **Web Workers (Renderer)** | Browser API, familiar | Sem Node.js APIs (fs, net, child_process) |
| **VM2 / isolated-vm** | Sandbox JS execution | Deprecated/unmaintained, performance |

## Consequences

### Positive
- **Isolamento**: Cada agent em seu Worker, crash não afeta overlay
- **Paralelismo real**: Multi-core utilization (workers = CPU cores)
- **Shared Memory**: `SharedArrayBuffer` para passage de dados grandes (zero-copy)
- **TypeScript**: Workers em TS, compilados com esbuild/swc
- **Node.js APIs**: Acesso completo a `fs`, `child_process`, `crypto`, etc.
- **Lifecycle**: `worker.terminate()` para kill forçado, `exit` event para cleanup

### Negative
- **COOP/COEP headers**: Necessários para `SharedArrayBuffer` (Tauri config)
- **Single-threaded por worker**: Event loop bloqueia com CPU-intensive tasks
- **Memory overhead**: ~10-20MB base por worker
- **Serialization**: `postMessage` usa structured clone (não functions, não classes)
- **Debugging**: DevTools precisa `--inspect` por worker

## Implementation

```typescript
// packages/runtime/src/executor/WorkerPool.ts
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

interface AgentTask {
  id: string;
  type: 'plan' | 'implement' | 'test' | 'review' | 'refactor';
  payload: any;
  context: AgentContext;
}

interface AgentResult {
  taskId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}

interface AgentContext {
  projectRoot: string;
  worktreePath: string;
  teamId: string;
  agentRole: string;
  memoryApi: MemoryApiProxy; // Proxy para IPC
  config: AgentConfig;
}

class WorkerPool extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private queue: Array<{ task: AgentTask; resolve: Function; reject: Function }> = [];
  private maxWorkers: number;

  constructor(maxWorkers = navigator.hardwareConcurrency || 4) {
    super();
    this.maxWorkers = maxWorkers;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const worker = await this.getAvailableWorker();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.releaseWorker(worker.threadId);
        reject(new Error(`Task ${task.id} timeout`));
      }, 5 * 60 * 1000); // 5 min timeout

      worker.once('message', (result: AgentResult) => {
        clearTimeout(timeout);
        this.releaseWorker(worker.threadId);
        resolve(result);
      });

      worker.once('error', (err) => {
        clearTimeout(timeout);
        this.releaseWorker(worker.threadId);
        reject(err);
      });

      worker.postMessage({ type: 'execute', task });
    });
  }

  private async getAvailableWorker(): Promise<Worker> {
    // Reuse idle worker
    for (const [id, worker] of this.workers) {
      if (!worker.busy) {
        worker.busy = true;
        return worker;
      }
    }

    // Create new if under limit
    if (this.workers.size < this.maxWorkers) {
      return this.createWorker();
    }

    // Wait for available
    return new Promise((resolve) => {
      this.once('worker-free', resolve);
    });
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./AgentWorker.ts', import.meta.url), {
      type: 'module',
      workerData: {
        // Pass config, not functions
        projectRoot: process.cwd(),
        maxMemory: 512 * 1024 * 1024, // 512MB
      },
    });

    const threadId = `worker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (worker as any).threadId = threadId;
    (worker as any).busy = false;

    worker.on('message', (msg) => {
      if (msg.type === 'ready') {
        (worker as any).busy = false;
        this.emit('worker-free', worker);
      }
    });

    worker.on('exit', (code) => {
      this.workers.delete(threadId);
      if (code !== 0) {
        this.emit('worker-crash', { threadId, code });
      }
    });

    this.workers.set(threadId, worker as any);
    return worker;
  }

  private releaseWorker(threadId: string) {
    const worker = this.workers.get(threadId);
    if (worker) {
      (worker as any).busy = false;
      this.emit('worker-free', worker);
    }
  }

  async terminateAll(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map(w => w.terminate())
    );
    this.workers.clear();
  }
}

// AgentWorker.ts (entry point for worker)
if (!isMainThread) {
  const { parentPort, workerData } = require('worker_threads');
  
  const agent = new AgentExecutor(workerData);
  
  parentPort!.postMessage({ type: 'ready' });
  
  parentPort!.on('message', async (msg) => {
    if (msg.type === 'execute') {
      try {
        const result = await agent.execute(msg.task);
        parentPort!.postMessage({ type: 'result', ...result });
      } catch (error) {
        parentPort!.postMessage({ 
          type: 'result', 
          taskId: msg.task.id, 
          success: false, 
          error: error.message 
        });
      }
    }
  });
}
```

```typescript
// packages/runtime/src/executor/AgentExecutor.ts
export class AgentExecutor {
  private context: AgentContext;
  private memoryProxy: MemoryApiProxy;
  private git: GitWrapper;

  constructor(workerData: any) {
    this.context = workerData;
    this.memoryProxy = new MemoryApiProxy(workerData.projectRoot);
    this.git = new GitWrapper(workerData.worktreePath);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const start = Date.now();
    
    try {
      switch (task.type) {
        case 'plan':
          return await this.executePlan(task);
        case 'implement':
          return await this.executeImplement(task);
        case 'test':
          return await this.executeTest(task);
        case 'review':
          return await this.executeReview(task);
        case 'refactor':
          return await this.executeRefactor(task);
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }
    } catch (error) {
      return {
        taskId: task.id,
        success: false,
        error: error.message,
        duration: Date.now() - start,
      };
    }
  }

  private async executeImplement(task: AgentTask): Promise<AgentResult> {
    // TDD Loop: Red -> Green -> Refactor
    const tdd = new TddEnforcer(this.context, this.memoryProxy);
    
    // Phase 1: Red - Write failing test
    const testResult = await tdd.writeFailingTest(task.payload);
    if (!testResult.success) {
      return { taskId: task.id, success: false, error: testResult.error, duration: Date.now() - start };
    }

    // Phase 2: Green - Make test pass
    const implResult = await tdd.makeTestPass(task.payload);
    if (!implResult.success) {
      return { taskId: task.id, success: false, error: implResult.error, duration: Date.now() - start };
    }

    // Phase 3: Refactor
    const refactorResult = await tdd.refactor(task.payload);
    
    // Save learning to memory
    await this.memoryProxy.saveLearning({
      taskId: task.id,
      agent: this.context.agentRole,
      summary: `Implemented ${task.payload.description}`,
      tags: ['implementation', 'tdd'],
    });

    return {
      taskId: task.id,
      success: true,
      output: { test: testResult, implementation: implResult, refactor: refactorResult },
      duration: Date.now() - start,
    };
  }
}
```

```json
// tauri.conf.json - COOP/COEP for SharedArrayBuffer
{
  "build": {
    "beforeBuildCommand": "",
    "beforeDevCommand": "",
    "devPath": "http://localhost:1420",
    "distDir": "../dist"
  },
  "app": {
    "security": {
      "csp": "default-src 'self' data: blob:; script-src 'self' 'unsafe-eval'; worker-src blob:; connect-src 'self' http://localhost:* ws://localhost:*;",
      "headers": {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp"
      }
    }
  }
}
```

## Communication Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Request-Response** | Task execution | `postMessage` + Promise wrapper |
| **Streaming** | Long-running output (logs) | `TransformStream` over `MessagePort` |
| **Shared Memory** | Large data (file contents, diffs) | `SharedArrayBuffer` + `Atomics` |
| **Broadcast** | Config updates to all workers | `BroadcastChannel` API |
| **RPC** | Memory API calls | Proxy object com `postMessage` |

## Memory API Proxy (IPC Bridge)

```typescript
// packages/runtime/src/executor/MemoryApiProxy.ts
export class MemoryApiProxy {
  private port: MessagePort;
  private pending = new Map<number, { resolve: Function; reject: Function }>();
  private requestId = 0;

  constructor(projectRoot: string) {
    // Connect to main thread via MessageChannel
    const channel = new MessageChannel();
    this.port = channel.port1;
    
    parentPort!.postMessage({ 
      type: 'init-memory-proxy', 
      port: channel.port2 
    }, [channel.port2]);

    this.port.onmessage = (e) => {
      const { id, result, error } = e.data;
      const pending = this.pending.get(id);
      if (pending) {
        if (error) pending.reject(new Error(error));
        else pending.resolve(result);
        this.pending.delete(id);
      }
    };
  }

  async saveNote(note: Note): Promise<Note> {
    return this.rpc('memory:saveNote', note);
  }

  async searchNotes(query: string, limit: number): Promise<SearchResult[]> {
    return this.rpc('memory:searchNotes', { query, limit });
  }

  private rpc(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ id, method, params });
    });
  }
}
```

## References

- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [COOP/COEP](https://web.dev/coop-coep/)
- [Tauri Sidecar](https://tauri.app/v1/guides/features/sidecar/)
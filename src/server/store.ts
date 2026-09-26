import { RunRecordSchema, type RunRecord, type SimulationRun } from '../core/domain';

/**
 * Run persistence.
 *
 * MemoryRunStore is the DEFAULT and always works — that is what satisfies the
 * "database unavailable" requirement. FileRunStore exists so local development
 * and tests have real persistence, and it REFUSES to run on Vercel because the
 * serverless filesystem is read-only apart from /tmp and is not durable.
 *
 * Consequence, stated plainly: there is no durable run history on the free
 * tier, so a mid-run page refresh restarts that run. Runs are short and
 * re-runnable by design, which is the mitigation.
 */
export interface RunStore {
  save(record: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  list(limit: number): Promise<SimulationRun[]>;
}

class MemoryRunStore implements RunStore {
  private readonly records = new Map<string, RunRecord>();

  async save(record: RunRecord): Promise<void> {
    this.records.set(record.run.id, record);
  }

  async get(id: string): Promise<RunRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(limit: number): Promise<SimulationRun[]> {
    return [...this.records.values()].slice(-limit).map((r) => r.run);
  }
}

class FileRunStore implements RunStore {
  private readonly dir: string;
  private readonly fallback = new MemoryRunStore();

  constructor(dir: string) {
    this.dir = dir;
  }

  private async fs() {
    return import('node:fs/promises');
  }

  private pathFor(id: string): string {
    return `${this.dir}/${id}.json`;
  }

  async save(record: RunRecord): Promise<void> {
    try {
      const fs = await this.fs();
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(this.pathFor(record.run.id), JSON.stringify(record, null, 2), 'utf8');
    } catch {
      await this.fallback.save(record);
    }
  }

  async get(id: string): Promise<RunRecord | null> {
    try {
      const fs = await this.fs();
      const raw = await fs.readFile(this.pathFor(id), 'utf8');
      // Re-validate on read. A hand-edited or corrupt file must never be cast
      // into a domain object.
      return RunRecordSchema.parse(JSON.parse(raw));
    } catch {
      return this.fallback.get(id);
    }
  }

  async list(limit: number): Promise<SimulationRun[]> {
    return this.fallback.list(limit);
  }
}

let store: RunStore | null = null;

export function getRunStore(): RunStore {
  if (store) return store;

  const requested = process.env.CONTENT_ROOM_RUN_STORE ?? 'memory';
  const onVercel = Boolean(process.env.VERCEL);

  if (requested === 'file' && !onVercel) {
    store = new FileRunStore(process.env.CONTENT_ROOM_DATA_DIR ?? '.data/runs');
    return store;
  }

  store = new MemoryRunStore();
  return store;
}

import type { EngineId } from '../core/domain';
import type { SimulationEngine } from './types';
import { deterministicEngine } from './deterministic/engine';

/**
 * Engine registry.
 *
 * Only the deterministic engine is registered today. `OasisSimulationEngine` is
 * a DEFERRED post-MVP adapter (docs/architecture.md §9) — it would need Python
 * 3.10/3.11 out of process, since camel-oasis declares `<3.12` and requires an
 * LLM key for every agent action, which is incompatible with the zero-key
 * requirement. When it exists it registers here and nothing downstream changes.
 */
const engines = new Map<EngineId, SimulationEngine>([[deterministicEngine.id, deterministicEngine]]);

export function getEngine(id: EngineId): SimulationEngine {
  const engine = engines.get(id);
  if (!engine) {
    return deterministicEngine;
  }
  return engine;
}

export function listEngines(): SimulationEngine[] {
  return [...engines.values()];
}

export function defaultEngine(): SimulationEngine {
  return deterministicEngine;
}

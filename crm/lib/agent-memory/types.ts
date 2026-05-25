/**
 * Shared types for the TS-side AgentMemory module.
 *
 * The Python runtime (`agent/memory/store.py`) and this module both read/write
 * the SAME `AgentMemory` rows. Column shape is fixed by that table:
 *   - entityType: 'contact' | 'deal' | 'space' (nullable in DB but always set
 *     by Python; keep that convention)
 *   - memoryType: 'fact' | 'observation' | 'preference' | 'reminder'
 *   - importance: 0.0-1.0 float
 *
 * `MemoryEntry` is the TS view returned to callers — flatter than the raw row.
 */

export type MemoryEntityType = 'contact' | 'deal' | 'space';
export type MemoryKind = 'fact' | 'observation' | 'preference' | 'reminder';

export interface MemoryEntry {
  id: string;
  content: string;
  /** Mapped from the DB column "memoryType". Fact/observation/preference/reminder. */
  kind: MemoryKind;
  /** ISO timestamp of when the memory was stored. */
  createdAt: string;
  /** Cosine similarity 0–1 (1 = identical). Only present for semantic recall. */
  similarity?: number;
  /** Importance score 0–1 carried over from the source row. */
  importance: number;
  entityType: MemoryEntityType | null;
  entityId: string | null;
}

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Teste de integra\u00e7\u00e3o do pipeline de agrega\u00e7\u00e3o mensal:
 * simula a sequ\u00eancia real do upload (p\u00f3s-bulkCreate):
 *  1) agrupa transa\u00e7\u00f5es persistidas por (ano, m\u00eas, igreja)
 *  2) chama applyIncrement apenas com transa\u00e7\u00f5es n\u00e3o duplicadas
 *  3) reimporta\u00e7\u00e3o do mesmo conte\u00fado (dedupe por hash) resulta em 0 incrementos
 */

const state = {
  monthly_stats: [] as any[],
  upserts: [] as any[],
};

const resetState = () => {
  state.monthly_stats = [];
  state.upserts = [];
};

const makeChain = (table: string) => {
  const s: { table: string; filters: Record<string, any> } = { table, filters: {} };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: any) => {
      s.filters[col] = val;
      return chain;
    }),
    maybeSingle: vi.fn(async () => {
      if (s.table === 'monthly_stats') {
        const row = state.monthly_stats.find(
          (r) =>
            r.year === s.filters.year &&
            r.month === s.filters.month &&
            r.church_id === s.filters.church_id,
        );
        return { data: row ?? null, error: null };
      }
      return { data: null, error: null };
    }),
    upsert: vi.fn(async (rows: any[]) => {
      state.upserts.push(...rows);
      for (const r of rows) {
        const idx = state.monthly_stats.findIndex(
          (x) => x.year === r.year && x.month === r.month && x.church_id === r.church_id,
        );
        if (idx >= 0) state.monthly_stats[idx] = { ...state.monthly_stats[idx], ...r };
        else state.monthly_stats.push({ ...r });
      }
      return { data: rows, error: null };
    }),
    then: (resolve: any) => Promise.resolve({ data: state.monthly_stats, error: null }).then(resolve),
  };
  return chain;
};

vi.mock('../supabase', () => ({
  USE_MOCK: false,
  supabase: { from: (t: string) => makeChain(t), auth: { getSession: async () => ({ data: { session: null } }) } },
}));

vi.mock('../database', () => ({
  getChurchIdMap: vi.fn(async () => new Map<number, number>()),
  initializeDatabase: vi.fn(async () => true),
}));

import { groupTransactionsByMonth, monthlyStatsService } from '../api';

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

/**
 * Helper que replica o comportamento do bloco p\u00f3s-bulkCreate em
 * fileParserService.processFile. Recebe a lista que seria passada ao
 * bulkCreate (j\u00e1 filtrada de duplicatas) e dispara o incremento.
 */
const simulateUploadPipeline = async (
  newlyInserted: { date: string; amount: number; church_id: number }[],
) => {
  const increments = groupTransactionsByMonth(newlyInserted);
  if (increments.length > 0) {
    await monthlyStatsService.applyIncrement(increments);
  }
  return increments;
};

describe('Pipeline de upload \u2192 monthly_stats', () => {
  it('alimenta monthly_stats com os agregados esperados para transa\u00e7\u00f5es novas', async () => {
    const novas = [
      { date: '2025-11-05T10:00:00Z', amount: 100.15, church_id: 15 },
      { date: '2025-11-12T14:30:00Z', amount: 50.15, church_id: 15 },
      { date: '2025-12-03T09:00:00Z', amount: 200.42, church_id: 42 },
    ];

    const increments = await simulateUploadPipeline(novas);

    // Agregados corretos
    expect(increments).toHaveLength(2);
    const nov15 = increments.find((i) => i.month === 11 && i.churchId === 15)!;
    expect(nov15.amount).toBeCloseTo(150.3, 2);
    expect(nov15.count).toBe(2);

    // Persistiu dois registros
    expect(state.upserts).toHaveLength(2);
    expect(state.monthly_stats).toHaveLength(2);
  });

  it('reimporta\u00e7\u00e3o com lista vazia (tudo duplicado) n\u00e3o gera upsert', async () => {
    // 1\u00ba upload
    await simulateUploadPipeline([
      { date: '2025-11-05T10:00:00Z', amount: 100.15, church_id: 15 },
    ]);
    expect(state.upserts).toHaveLength(1);

    // 2\u00ba upload \u2014 todas duplicadas \u2192 lista vazia chega aqui
    const chamadasAntes = state.upserts.length;
    const increments = await simulateUploadPipeline([]);
    expect(increments).toEqual([]);
    expect(state.upserts.length).toBe(chamadasAntes);
  });

  it('uploads sucessivos somam corretamente os valores do mesmo m\u00eas', async () => {
    await simulateUploadPipeline([
      { date: '2025-11-05T10:00:00Z', amount: 100, church_id: 15 },
    ]);
    await simulateUploadPipeline([
      { date: '2025-11-20T10:00:00Z', amount: 50, church_id: 15 },
    ]);

    const row = state.monthly_stats.find(
      (r) => r.year === 2025 && r.month === 11 && r.church_id === 15,
    )!;
    expect(row.total_amount).toBe(150);
    expect(row.transaction_count).toBe(2);
  });
});

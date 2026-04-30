import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Mocks antes de importar o m\u00f3dulo testado ----
type ChainState = {
  table: string;
  filters: Record<string, any>;
  lastSelect?: string;
  inValues?: { col: string; values: any[] };
};

const state = {
  // Linhas simuladas na tabela monthly_stats
  monthly_stats: [] as any[],
  // Linhas simuladas na tabela churches
  churches: [] as any[],
  // Linhas simuladas na tabela transactions (fonte primária do getEvolution/getChurchesWithData)
  transactions: [] as any[],
  // Registra upserts feitos
  upserts: [] as any[],
};

const resetState = () => {
  state.monthly_stats = [];
  state.churches = [];
  state.transactions = [];
  state.upserts = [];
};

const makeChain = (table: string) => {
  const s: ChainState = { table, filters: {} };
  const chain: any = {
    select: vi.fn((cols?: string) => {
      s.lastSelect = cols;
      return chain;
    }),
    eq: vi.fn((col: string, val: any) => {
      s.filters[col] = val;
      return chain;
    }),
    in: vi.fn((col: string, values: any[]) => {
      s.inValues = { col, values };
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
      // Aplica no "banco" em mem\u00f3ria para queries subsequentes
      for (const r of rows) {
        const idx = state.monthly_stats.findIndex(
          (x) => x.year === r.year && x.month === r.month && x.church_id === r.church_id,
        );
        if (idx >= 0) state.monthly_stats[idx] = { ...state.monthly_stats[idx], ...r };
        else state.monthly_stats.push({ ...r });
      }
      return { data: rows, error: null };
    }),
    // Resolu\u00e7\u00e3o final de um SELECT sem maybeSingle (ex.: getEvolution, getChurchesWithData)
    then: (resolve: any) => {
      if (s.table === 'monthly_stats') {
        let rows = state.monthly_stats.slice();
        if (typeof s.filters.church_id === 'number') {
          rows = rows.filter((r) => r.church_id === s.filters.church_id);
        }
        if (s.inValues && s.inValues.col === 'church_id') {
          rows = rows.filter((r) => s.inValues!.values.includes(r.church_id));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      if (s.table === 'transactions') {
        let rows = state.transactions.slice();
        if (typeof s.filters.church_id === 'number') {
          rows = rows.filter((r) => r.church_id === s.filters.church_id);
        }
        if (s.inValues && s.inValues.col === 'church_id') {
          rows = rows.filter((r) => s.inValues!.values.includes(r.church_id));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      if (s.table === 'churches') {
        let rows = state.churches.slice();
        if (s.inValues && s.inValues.col === 'id') {
          rows = rows.filter((c) => s.inValues!.values.includes(c.id));
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  return chain;
};

vi.mock('../supabase', () => ({
  USE_MOCK: false,
  supabase: {
    from: (table: string) => makeChain(table),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));

vi.mock('../database', () => ({
  getChurchIdMap: vi.fn(async () => new Map<number, number>()),
  initializeDatabase: vi.fn(async () => true),
}));

// Importar ap\u00f3s mocks
import { groupTransactionsByMonth, monthlyStatsService } from '../api';

beforeEach(() => {
  resetState();
  vi.clearAllMocks();
});

// ==================== groupTransactionsByMonth ====================

describe('groupTransactionsByMonth', () => {
  it('agrupa m\u00faltiplas transa\u00e7\u00f5es do mesmo m\u00eas/igreja somando amount e count', () => {
    const items = [
      { date: '2025-11-05T12:00:00Z', amount: 100.15, church_id: 10 },
      { date: '2025-11-20T09:30:00Z', amount: 50.15, church_id: 10 },
      { date: '2025-11-25T18:00:00Z', amount: 25, church_id: 10 },
    ];
    const result = groupTransactionsByMonth(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      year: 2025,
      month: 11,
      churchId: 10,
      amount: 175.3,
      count: 3,
    });
  });

  it('separa meses diferentes', () => {
    const items = [
      { date: '2025-11-15T00:00:00Z', amount: 100, church_id: 5 },
      { date: '2025-12-01T00:00:00Z', amount: 200, church_id: 5 },
    ];
    const result = groupTransactionsByMonth(items);
    expect(result).toHaveLength(2);
    const nov = result.find((r) => r.month === 11)!;
    const dez = result.find((r) => r.month === 12)!;
    expect(nov.amount).toBe(100);
    expect(dez.amount).toBe(200);
  });

  it('separa igrejas diferentes dentro do mesmo m\u00eas', () => {
    const items = [
      { date: '2025-11-10T00:00:00Z', amount: 50, church_id: 1 },
      { date: '2025-11-12T00:00:00Z', amount: 70, church_id: 2 },
      { date: '2025-11-15T00:00:00Z', amount: 30, church_id: 1 },
    ];
    const result = groupTransactionsByMonth(items);
    expect(result).toHaveLength(2);
    const igreja1 = result.find((r) => r.churchId === 1)!;
    const igreja2 = result.find((r) => r.churchId === 2)!;
    expect(igreja1.amount).toBe(80);
    expect(igreja1.count).toBe(2);
    expect(igreja2.amount).toBe(70);
    expect(igreja2.count).toBe(1);
  });

  it('retorna [] para lista vazia', () => {
    expect(groupTransactionsByMonth([])).toEqual([]);
  });

  it('descarta itens com data inv\u00e1lida sem quebrar', () => {
    const items = [
      { date: 'nao-eh-data', amount: 10, church_id: 1 },
      { date: '2025-11-10T00:00:00Z', amount: 20, church_id: 1 },
    ];
    const result = groupTransactionsByMonth(items);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(20);
  });

  it('descarta itens com amount n\u00e3o num\u00e9rico', () => {
    const items: any[] = [
      { date: '2025-11-10T00:00:00Z', amount: 'abc', church_id: 1 },
      { date: '2025-11-11T00:00:00Z', amount: 30, church_id: 1 },
    ];
    const result = groupTransactionsByMonth(items);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(30);
  });
});

// ==================== monthlyStatsService.applyIncrement ====================

describe('monthlyStatsService.applyIncrement', () => {
  it('faz upsert com valores informados quando n\u00e3o existe linha pr\u00e9via', async () => {
    await monthlyStatsService.applyIncrement([
      { year: 2025, month: 11, churchId: 10, amount: 500, count: 3 },
    ]);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      year: 2025,
      month: 11,
      church_id: 10,
      total_amount: 500,
      transaction_count: 3,
    });
  });

  it('soma total_amount e transaction_count quando existe linha pr\u00e9via', async () => {
    state.monthly_stats.push({
      year: 2025,
      month: 11,
      church_id: 10,
      total_amount: 100,
      transaction_count: 2,
    });

    await monthlyStatsService.applyIncrement([
      { year: 2025, month: 11, churchId: 10, amount: 50, count: 1 },
    ]);

    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({
      total_amount: 150,
      transaction_count: 3,
    });
  });

  it('agrupa duplicatas na entrada antes de persistir (1 upsert por chave)', async () => {
    await monthlyStatsService.applyIncrement([
      { year: 2025, month: 11, churchId: 10, amount: 10, count: 1 },
      { year: 2025, month: 11, churchId: 10, amount: 20, count: 1 },
      { year: 2025, month: 11, churchId: 20, amount: 5, count: 1 },
    ]);
    expect(state.upserts).toHaveLength(2);
    const ten = state.upserts.find((u) => u.church_id === 10)!;
    const twenty = state.upserts.find((u) => u.church_id === 20)!;
    expect(ten.total_amount).toBe(30);
    expect(ten.transaction_count).toBe(2);
    expect(twenty.total_amount).toBe(5);
  });

  it('n\u00e3o faz nada se items estiver vazio', async () => {
    await monthlyStatsService.applyIncrement([]);
    expect(state.upserts).toHaveLength(0);
  });
});

// ==================== monthlyStatsService.getEvolution ====================

describe('monthlyStatsService.getEvolution', () => {
  beforeEach(() => {
    state.monthly_stats = [
      { year: 2025, month: 10, church_id: 1, total_amount: 100, transaction_count: 2 },
      { year: 2025, month: 10, church_id: 2, total_amount: 200, transaction_count: 3 },
      { year: 2025, month: 11, church_id: 1, total_amount: 50, transaction_count: 1 },
      { year: 2025, month: 12, church_id: 2, total_amount: 300, transaction_count: 4 },
    ];
  });

  it('sem churchId agrega por (year, month) somando todas as igrejas', async () => {
    const res = await monthlyStatsService.getEvolution();
    expect(res).toHaveLength(3);
    const out = res.find((p) => p.key === '2025-10')!;
    expect(out.amount).toBe(300); // 100 + 200
    expect(out.count).toBe(5);
    expect(out.label).toBe('10/2025');
  });

  it('com churchId filtra pela igreja', async () => {
    const res = await monthlyStatsService.getEvolution(1);
    expect(res).toHaveLength(2);
    const out = res.find((p) => p.key === '2025-10')!;
    expect(out.amount).toBe(100);
    expect(out.count).toBe(2);
  });

  it('retorna ordenado cronologicamente (ascendente)', async () => {
    const res = await monthlyStatsService.getEvolution();
    const keys = res.map((p) => p.key);
    expect(keys).toEqual(['2025-10', '2025-11', '2025-12']);
  });

  it('retorna [] quando n\u00e3o h\u00e1 dados', async () => {
    state.monthly_stats = [];
    const res = await monthlyStatsService.getEvolution();
    expect(res).toEqual([]);
  });
});

// ==================== monthlyStatsService.getChurchesWithData ====================

describe('monthlyStatsService.getChurchesWithData', () => {
  it('deduplica igrejas e retorna ordenado por name', async () => {
    state.monthly_stats = [
      { year: 2025, month: 10, church_id: 10, total_amount: 1, transaction_count: 1 },
      { year: 2025, month: 11, church_id: 10, total_amount: 1, transaction_count: 1 },
      { year: 2025, month: 11, church_id: 20, total_amount: 1, transaction_count: 1 },
    ];
    state.churches = [
      { id: 10, name: 'Zona Sul' },
      { id: 20, name: 'Centro' },
    ];

    const res = await monthlyStatsService.getChurchesWithData();
    expect(res).toHaveLength(2);
    expect(res[0].name).toBe('Centro');
    expect(res[1].name).toBe('Zona Sul');
  });

  it('retorna [] quando n\u00e3o h\u00e1 snapshot', async () => {
    state.monthly_stats = [];
    const res = await monthlyStatsService.getChurchesWithData();
    expect(res).toEqual([]);
  });
});

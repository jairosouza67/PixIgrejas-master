import { supabase, USE_MOCK } from './supabase';
import { api as mockApi } from './mockService';
import { CHURCH_MAPPING } from '../constants';
import { User, UserRole, DashboardStats, Transaction as AppTransaction, MonthlyEvolutionPoint, ChurchWithData } from '../types';
import * as XLSX from 'xlsx';
import { getChurchIdMap } from './database';

// Local interface for transaction inserts
interface TransactionInsert {
  id?: string;
  date: string;
  amount: number;
  description: string;
  church_id: number;
  hash: string;
  status?: 'PENDING' | 'SYNCED' | 'ERROR';
}

// ==================== AUTH ====================

export const authService = {
  async login(email: string, password: string): Promise<User> {
    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) throw authError;

    // Get user profile from our users table
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError) {
      // If no profile exists, create one (first login scenario)
      const newProfile = {
        id: authData.user.id,
        email: authData.user.email!,
        name: authData.user.email!.split('@')[0],
        role: 'ADMIN' as const, // Default to admin for first user
        church_id: null,
      };

      const { data: created, error: createError } = await supabase
        .from('users')
        .insert(newProfile)
        .select()
        .single();

      if (createError) throw createError;
      if (!created) throw new Error('Failed to create user profile');

      return {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role as UserRole,
        churchId: created.church_id ?? undefined,
      };
    }

    if (!userProfile) throw new Error('User profile not found');

    return {
      id: userProfile.id,
      name: userProfile.name,
      email: userProfile.email,
      role: userProfile.role as UserRole,
      churchId: userProfile.church_id ?? undefined,
    };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) return null;

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role as UserRole,
      churchId: profile.church_id ?? undefined,
    };
  },

  async signUp(email: string, password: string, name: string, role: UserRole, churchId?: number): Promise<User> {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        name,
        role,
        church_id: churchId ?? null,
      })
      .select()
      .single();

    if (profileError) throw profileError;

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role as UserRole,
      churchId: profile.church_id ?? undefined,
    };
  }
};

// ==================== CHURCHES ====================

export const churchService = {
  async getAll() {
    const { data, error } = await supabase
      .from('churches')
      .select('*')
      .order('cents_code', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('churches')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async seedChurches() {
    // Check if churches already exist
    const { count } = await supabase
      .from('churches')
      .select('*', { count: 'exact', head: true });

    if (count && count > 0) return;

    // Insert all churches from the mapping
    const churches = Object.entries(CHURCH_MAPPING).map(([cents, name]) => ({
      name,
      cents_code: parseInt(cents),
    }));

    const { error } = await supabase.from('churches').insert(churches);
    if (error) throw error;
  },

  async updateGoogleSheetId(churchId: number, sheetId: string) {
    const { error } = await supabase
      .from('churches')
      .update({ google_sheet_id: sheetId })
      .eq('id', churchId);

    if (error) throw error;
  }
};

// ==================== TRANSACTIONS ====================

export const transactionService = {
  async getAll(role: UserRole, churchId?: number): Promise<AppTransaction[]> {
    let query = supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
      .limit(500);

    if (role === UserRole.CHURCH_LEADER && churchId !== undefined) {
      query = query.eq('church_id', churchId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return data.map(tx => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      churchId: tx.church_id,
      hash: tx.hash,
      status: tx.status,
    }));
  },

  async create(transaction: TransactionInsert) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(transaction)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async checkDuplicate(hash: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('transactions')
      .select('id')
      .eq('hash', hash)
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  },

  async bulkCreate(transactions: TransactionInsert[]) {
    if (!transactions.length) return [];

    const { data, error } = await supabase
      .from('transactions')
      // Usa upsert para respeitar a unique constraint em "hash"
      // e ignorar silenciosamente registros já existentes
      .upsert(transactions, { onConflict: 'hash', ignoreDuplicates: true })
      .select();

    if (error) throw error;
    return data;
  },

  async updateStatus(id: string, status: 'PENDING' | 'SYNCED' | 'ERROR') {
    const { error } = await supabase
      .from('transactions')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  },

  async deleteAll(): Promise<number> {
    // NOTA: Esta operação apaga APENAS a tabela `transactions`.
    // A tabela `monthly_stats` (snapshot incremental da evolução mensal)
    // é preservada intencionalmente para não perder o histórico.
    // Get count before deletion
    const { count: beforeCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true });

    // Delete all transactions using gte (greater than or equal to) on a timestamp
    // This will match all rows
    const { error, count: deletedCount } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .gte('created_at', '1970-01-01'); // Match all records (any date >= 1970)

    if (error) throw error;
    return deletedCount || beforeCount || 0;
  }
};

// ==================== MONTHLY STATS ====================

export interface MonthlyIncrementItem {
  year: number;
  month: number; // 1-12
  churchId: number;
  amount: number;
  count: number;
}

/**
 * Agrupa transações (já persistidas) por (ano, mês, igreja),
 * somando valor e quantidade. Usado para alimentar o snapshot mensal.
 * Função pura — sem dependência de Supabase — facilita testes.
 */
export const groupTransactionsByMonth = (
  items: { date: string; amount: number; church_id: number }[]
): MonthlyIncrementItem[] => {
  const map = new Map<string, MonthlyIncrementItem>();

  for (const tx of items) {
    if (!tx || !tx.date) continue;
    const d = new Date(tx.date);
    if (isNaN(d.getTime())) continue;
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    const churchId = Number(tx.church_id);
    if (!Number.isFinite(churchId)) continue;

    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const key = `${year}-${month}-${churchId}`;

    const existing = map.get(key);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(key, { year, month, churchId, amount, count: 1 });
    }
  }

  return Array.from(map.values());
};

export const monthlyStatsService = {
  /**
   * Aplica incremento otimista: lê linhas existentes para as chaves informadas
   * e executa upsert somando os deltas. Assíncrono e idempotente em relação
   * ao fluxo de upload (dedupe por hash garante que delta venha só do novo).
   */
  async applyIncrement(items: MonthlyIncrementItem[]): Promise<void> {
    if (!items || items.length === 0) return;

    // Agrupa por chave caso a lista tenha duplicatas
    const merged = new Map<string, MonthlyIncrementItem>();
    for (const it of items) {
      const key = `${it.year}-${it.month}-${it.churchId}`;
      const cur = merged.get(key);
      if (cur) {
        cur.amount += it.amount;
        cur.count += it.count;
      } else {
        merged.set(key, { ...it });
      }
    }
    const deltas = Array.from(merged.values());

    // Busca linhas existentes para somar corretamente
    const existingByKey = new Map<string, { total_amount: number; transaction_count: number }>();
    for (const d of deltas) {
      const { data, error } = await supabase
        .from('monthly_stats')
        .select('total_amount, transaction_count')
        .eq('year', d.year)
        .eq('month', d.month)
        .eq('church_id', d.churchId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        existingByKey.set(`${d.year}-${d.month}-${d.churchId}`, {
          total_amount: Number(data.total_amount) || 0,
          transaction_count: Number(data.transaction_count) || 0,
        });
      }
    }

    const rows = deltas.map((d) => {
      const key = `${d.year}-${d.month}-${d.churchId}`;
      const existing = existingByKey.get(key);
      return {
        year: d.year,
        month: d.month,
        church_id: d.churchId,
        total_amount: (existing?.total_amount ?? 0) + d.amount,
        transaction_count: (existing?.transaction_count ?? 0) + d.count,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertError } = await supabase
      .from('monthly_stats')
      .upsert(rows, { onConflict: 'year,month,church_id' });

    if (upsertError) throw upsertError;
  },

  async getEvolution(
    churchIdParam?: number | number[],
  ): Promise<MonthlyEvolutionPoint[]> {
    const filterIds: number[] | undefined = Array.isArray(churchIdParam)
      ? churchIdParam
      : typeof churchIdParam === 'number'
        ? [churchIdParam]
        : undefined;

    const hasFilter = !!(filterIds && filterIds.length > 0);

    // 1) Fonte primária: tabela `transactions` (bate 1:1 com getStats/Dashboard).
    let txQuery = supabase
      .from('transactions')
      .select('date, amount, church_id');
    if (hasFilter) {
      txQuery = txQuery.in('church_id', filterIds!);
    }
    const { data: txRows, error: txErr } = await txQuery;
    if (txErr) throw txErr;

    if (txRows && txRows.length > 0) {
      const bucket = new Map<
        string,
        { year: number; month: number; amount: number; count: number }
      >();
      for (const row of txRows as any[]) {
        const d = new Date(row.date);
        if (isNaN(d.getTime())) continue;
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth() + 1;
        const key = `${y}-${String(m).padStart(2, '0')}`;
        const amount = Number(row.amount) || 0;
        const cur = bucket.get(key);
        if (cur) {
          cur.amount += amount;
          cur.count += 1;
        } else {
          bucket.set(key, { year: y, month: m, amount, count: 1 });
        }
      }
      return Array.from(bucket.entries())
        .map(([key, v]) => ({
          key,
          label: `${String(v.month).padStart(2, '0')}/${v.year}`,
          amount: v.amount,
          count: v.count,
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    }

    // 2) Fallback: snapshot `monthly_stats` (preserva histórico mesmo após resetar transações).
    let msQuery = supabase
      .from('monthly_stats')
      .select('year, month, church_id, total_amount, transaction_count');
    if (hasFilter) {
      msQuery = msQuery.in('church_id', filterIds!);
    }
    const { data, error } = await msQuery;
    if (error) throw error;

    const bucket = new Map<string, { year: number; month: number; amount: number; count: number }>();
    (data ?? []).forEach((row: any) => {
      const y = Number(row.year);
      const m = Number(row.month);
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const cur = bucket.get(key);
      const amount = Number(row.total_amount) || 0;
      const count = Number(row.transaction_count) || 0;
      if (cur) {
        cur.amount += amount;
        cur.count += count;
      } else {
        bucket.set(key, { year: y, month: m, amount, count });
      }
    });

    return Array.from(bucket.entries())
      .map(([key, v]) => ({
        key,
        label: `${String(v.month).padStart(2, '0')}/${v.year}`,
        amount: v.amount,
        count: v.count,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  },

  async getChurchesWithData(): Promise<ChurchWithData[]> {
    // Retorna TODAS as igrejas cadastradas (as 66 do CHURCH_MAPPING), não apenas as que já têm dados.
    // Igrejas sem transações exibem o gráfico com os 12 meses zerados.
    const { data: churches, error } = await supabase
      .from('churches')
      .select('id, name');

    if (error) throw error;

    return ((churches ?? []) as Array<{ id: number; name: string }>)
      .map((c) => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },
};

// ==================== STATS ====================

export const statsService = {
  async getDashboardStats(): Promise<DashboardStats> {
    // Get all transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false });

    if (error) throw error;
    const totalAmount = transactions?.reduce((acc, tx) => acc + tx.amount, 0) || 0;
    const totalTransactions = transactions?.length || 0;

    // Calculate daily volume (last 7 days)
    const dailyVolume = transactions?.reduce((acc: { date: string; amount: number }[], tx) => {
      const date = tx.date.split('T')[0];
      const existing = acc.find(d => d.date === date);
      if (existing) {
        existing.amount += tx.amount;
      } else {
        acc.push({ date, amount: tx.amount });
      }
      return acc;
    }, [])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-7) || [];

    // Calculate top churches
    const churchTotals: Record<number, number> = {};
    transactions?.forEach(tx => {
      churchTotals[tx.church_id] = (churchTotals[tx.church_id] || 0) + tx.amount;
    });

    const topChurches = Object.entries(churchTotals)
      .map(([id, amount]) => ({
        name: CHURCH_MAPPING[parseInt(id)] || 'Desconhecido',
        amount
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      totalAmount,
      totalTransactions,
      topChurches,
      dailyVolume,
    };
  },

  async getMonthlyEvolution(churchId?: number | number[]): Promise<MonthlyEvolutionPoint[]> {
    return monthlyStatsService.getEvolution(churchId);
  },

  async getChurchesWithMonthlyData(): Promise<ChurchWithData[]> {
    return monthlyStatsService.getChurchesWithData();
  },
};

// ==================== FILE PARSER ====================

interface ParsedTransaction {
  date: Date;
  amount: number;
  description: string;
  // Identificador anônimo por linha (hash curto do remetente bruto + índice),
  // usado apenas para deduplicação – NÃO expõe dados pessoais.
  externalId: string;
}

export interface DiscardStats {
  noDate: number;
  noAmount: number;
  sentPix: number;
  metadataRow: number;
  tooFewColumns: number;
}

const createEmptyDiscardStats = (): DiscardStats => ({
  noDate: 0,
  noAmount: 0,
  sentPix: 0,
  metadataRow: 0,
  tooFewColumns: 0,
});

// Build a safe, generic description that não expõe nome do doador
const buildSafeDescription = (_raw?: string): string => {
  // Mantemos uma descrição neutra para qualquer crédito recebido
  return 'PIX RECEBIDO';
};

// Hash curto (djb2) para uso como identificador anônimo não reversível
const shortHash = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
};

// Gera externalId anônimo combinando remetente bruto + índice da linha.
// O índice garante unicidade mesmo quando remetente repete.
const buildExternalId = (rawIdentifier: string, rowIndex: number): string => {
  const normalized = (rawIdentifier || '').trim().toUpperCase();
  return `${shortHash(normalized)}-${rowIndex}`;
};

// Generate hash for deduplication
const generateHash = (tx: ParsedTransaction): string => {
  const str = `${tx.date.toISOString()}|${tx.amount.toFixed(2)}|${tx.description.trim()}|${tx.externalId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
};

// Identify church by cents (maps to actual database ID, not cents_code)
// Uses cached map for performance
// Example: 100.15 -> cents=15, 100.66 -> cents=66, 100.00 -> cents=0
const identifyChurchId = async (amount: number): Promise<number> => {
  // Extract cents more reliably by converting to string (usa valor absoluto para
  // lidar corretamente com valores negativos).
  const amountStr = Math.abs(amount).toFixed(2); // Ensures 2 decimal places
  const parts = amountStr.split('.');
  const cents = parseInt(parts[1] || '0', 10);
  
  try {
    const churchMap = await getChurchIdMap();
    
    // Look up the database ID for this cents_code
    if (churchMap.has(cents)) {
      const dbId = churchMap.get(cents)!;
      return dbId;
    }
    
    // If not found, use default church (cents_code = 0 = "Não identificado")
    if (churchMap.has(0)) {
      const defaultId = churchMap.get(0)!;
      return defaultId;
    }
    
    // Fallback if even default doesn't exist (shouldn't happen)
    return 1; // Fallback to first church
  } catch (error) {
    return 1; // Fallback to first church on error
  }
};

// Parse Brazilian date formats (DD/MM/YYYY, DD-MM-YYYY, etc).
// Aceita opcionalmente uma string de hora (HH:MM ou HH:MM:SS) a ser aplicada à data.
const parseDate = (dateStr: string, timeStr?: string): Date | null => {
  if (!dateStr) return null;

  const cleaned = dateStr.toString().trim().replace(/"/g, '');

  // Extrai hora opcional (HH:MM ou HH:MM:SS)
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (timeStr) {
    const timeMatch = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10) || 0;
      minute = parseInt(timeMatch[2], 10) || 0;
      second = timeMatch[3] ? parseInt(timeMatch[3], 10) || 0 : 0;
    }
  }

  // Try DD/MM/YYYY or DD-MM-YYYY (Brazilian format)
  const brMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1]);
    const month = parseInt(brMatch[2]) - 1;
    let year = parseInt(brMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day, hour, minute, second);
    if (!isNaN(date.getTime())) return date;
  }

  // Try YYYY-MM-DD (ISO format)
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]), hour, minute, second);
    if (!isNaN(date.getTime())) return date;
  }

  // Try standard Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    if (timeStr) {
      date.setHours(hour, minute, second, 0);
    }
    return date;
  }

  return null;
};

// Parse amount from various formats. Retorna qualquer número válido (inclusive 0 e negativos).
const parseAmount = (amountStr: string | number): number | null => {
  if (typeof amountStr === 'number') {
    return Number.isFinite(amountStr) ? amountStr : null;
  }
  
  if (amountStr === null || amountStr === undefined) return null;
  
  let cleaned = amountStr.toString().trim().replace(/"/g, '');
  if (!cleaned) return null;
  
  // Remove currency symbols and spaces
  cleaned = cleaned.replace(/R\$|\$|BRL/gi, '').trim();
  
  // Handle Brazilian format: 1.234,56 -> 1234.56
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Check which is the decimal separator (last one)
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    
    if (lastComma > lastDot) {
      // Brazilian format: 1.234,56
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Only comma - could be decimal separator
    cleaned = cleaned.replace(',', '.');
  }
  
  const amount = parseFloat(cleaned);
  return Number.isFinite(amount) ? amount : null;
};

const splitCsvLine = (line: string, separator: string): string[] => {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields.map(field => field.replace(/^"|"$/g, '').trim());
};

const uploadParsedTransactionsViaNetlify = async (
  filename: string,
  userId: string,
  transactions: ParsedTransaction[],
  discardStats: DiscardStats,
): Promise<{ processed: number; duplicates: number; totalAmount: number; discarded: number; discardStats: DiscardStats } | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    return null;
  }

  const payloadTransactions = transactions.map((tx) => ({
    date: tx.date.toISOString(),
    amount: tx.amount,
    description: tx.description,
    externalId: tx.externalId,
  }));

  const response = await fetch('/.netlify/functions/upload-extrato', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      filename,
      userId,
      transactions: payloadTransactions,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || 'Falha ao enviar o extrato para o processamento online');
  }

  const discardedTotal =
    discardStats.noDate +
    discardStats.noAmount +
    discardStats.sentPix +
    discardStats.metadataRow +
    discardStats.tooFewColumns;

  return {
    ...(payload as { processed: number; duplicates: number; totalAmount: number }),
    discarded: discardedTotal,
    discardStats,
  };
};

export const fileParserService = {
  async parseCSV(content: string, discardStats?: DiscardStats): Promise<ParsedTransaction[]> {
    const lines = content.trim().split(/\r?\n/);
    const transactions: ParsedTransaction[] = [];
    const stats = discardStats ?? createEmptyDiscardStats();

    if (lines.length < 2) {
      return transactions;
    }

    // Detect separator (try tab, semicolon, then comma)
    const firstLine = lines[0];
    let separator = '\t';
    if (!firstLine.includes('\t')) {
      separator = firstLine.includes(';') ? ';' : ',';
    }

    // Parse header to find columns
    const headers = splitCsvLine(firstLine, separator).map(h => h.toLowerCase());
    
    // Find column indexes - support Caixa PIX format
    const dateIdx = headers.findIndex(h => 
      h === 'data' || h.includes('data') || h.includes('date') || h.includes('dt')
    );
    const timeIdx = headers.findIndex(h =>
      h === 'hora' || h.includes('hora') || h.includes('time')
    );
    const descIdx = headers.findIndex(h => 
      h.includes('remetente') || h.includes('destinat') || h.includes('descri') || h.includes('histor') || h.includes('nome') || h.includes('pagador')
    );
    const amountIdx = headers.findIndex(h => 
      h === 'valor' || h.includes('valor') || h.includes('amount') || h.includes('value')
    );
    // For Caixa format: Tipo de Pix column
    const tipoPixIdx = headers.findIndex(h => 
      h.includes('tipo') && h.includes('pix')
    );

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // NOTA: não descartamos mais linhas por palavras-chave tipo "cliente/conta/extrato"
      // porque isso pode afetar transações legítimas cujo remetente contenha essas
      // palavras. Linhas de metadado sem data/valor serão naturalmente filtradas
      // pelas validações abaixo.

      const parts = splitCsvLine(line, separator);
      
      // Skip if not enough columns
      if (parts.length < 3) {
        stats.tooFewColumns++;
        continue;
      }
      
      // NOTA: filtro "ENVIADO" removido intencionalmente — importamos todas as
      // transações sem descarte por tipo de PIX.
      
      // Use detected columns or fallback to positional
      const dateStr = dateIdx >= 0 ? parts[dateIdx] : parts[0];
      const timeStr = timeIdx >= 0 ? parts[timeIdx] : undefined;
      const rawDescription = descIdx >= 0 ? parts[descIdx] : (parts[4] || parts[1] || 'PIX');
      // For Caixa: valor is usually the last column
      const amountStr = amountIdx >= 0 ? parts[amountIdx] : parts[parts.length - 1];
      
      const date = parseDate(dateStr, timeStr);
      const amount = parseAmount(amountStr);
      
      if (!date) {
        stats.noDate++;
        continue;
      }
      // Aceita qualquer valor numérico válido (inclusive zero e negativos)
      if (amount === null || Number.isNaN(amount)) {
        stats.noAmount++;
        continue;
      }

      const description = buildSafeDescription(rawDescription);
      const externalId = buildExternalId(rawDescription, i);
      transactions.push({ date, amount, description, externalId });
    }

    return transactions;
  },

  async parseXLSX(buffer: ArrayBuffer, discardStats?: DiscardStats): Promise<ParsedTransaction[]> {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Get raw data first to see what we have
    const rawData = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });
    
    // Find the header row (look for "Data" column)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i] as any[];
      if (row && row.some(cell => {
        const cellStr = String(cell || '').toLowerCase();
        return cellStr === 'data' || cellStr.includes('data');
      })) {
        headerRowIdx = i;
        break;
      }
    }
    
    // Parse with detected header
    const data = XLSX.utils.sheet_to_json<any>(firstSheet, { 
      range: headerRowIdx,
      raw: false, 
      dateNF: 'dd/mm/yyyy' 
    });

    const transactions: ParsedTransaction[] = [];
    const stats = discardStats ?? createEmptyDiscardStats();
    let rowCounter = 0;

    for (const row of data) {
      rowCounter++;
      const keys = Object.keys(row);
      const values = Object.values(row);
      
      // Try to find columns by name patterns - Caixa PIX format
      let dateValue: any = null;
      let timeValue: any = null;
      let descValue: any = null;
      let amountValue: any = null;
      let tipoPix: string = '';
      
      for (const key of keys) {
        const keyLower = key.toLowerCase().trim();
        
        // Date column
        if (!dateValue && (keyLower === 'data' || keyLower.startsWith('data'))) {
          dateValue = row[key];
        }

        // Hora column
        if (!timeValue && (keyLower === 'hora' || keyLower.startsWith('hora') || keyLower.includes('time'))) {
          timeValue = row[key];
        }
        
        // Description - Remetente/Destinatário for Caixa
        if (!descValue && (
          keyLower.includes('remetente') || 
          keyLower.includes('destinat') || 
          keyLower.includes('pagador') ||
          keyLower.includes('nome')
        )) {
          descValue = row[key];
        }
        
        // Amount - Valor
        if (!amountValue && keyLower === 'valor') {
          amountValue = row[key];
        }
        
        // Tipo de Pix - to filter only RECEBIDO
        if (keyLower.includes('tipo') && (keyLower.includes('pix') || keyLower.includes('transação'))) {
          tipoPix = String(row[key] || '').toUpperCase();
        }
      }
      
      // NOTA: filtro "ENVIADO" removido intencionalmente — importamos todas as
      // transações sem descarte por tipo de PIX.
      
      // Fallback: if no named columns found, use positional (Caixa format)
      // Caixa format: Data | Hora | Tipo de Pix | Situação | Remetente/Destinatário | Valor
      if (!dateValue) dateValue = values[0];
      if (!timeValue) timeValue = values[1];
      if (!descValue) descValue = values[4] || values[1] || 'PIX RECEBIDO';
      if (!amountValue) amountValue = values[5] || values[values.length - 1];

      let date: Date | null = null;
      
      // Handle Excel serial date numbers
      if (typeof dateValue === 'number') {
        date = new Date((dateValue - 25569) * 86400 * 1000);
      } else if (dateValue instanceof Date) {
        date = new Date(dateValue.getTime());
      } else {
        date = parseDate(String(dateValue), timeValue ? String(timeValue) : undefined);
      }

      // Se recebemos data sem hora e há coluna de hora separada, aplica
      if (date && timeValue && (typeof dateValue === 'number' || dateValue instanceof Date)) {
        const timeMatch = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
          date.setHours(
            parseInt(timeMatch[1], 10) || 0,
            parseInt(timeMatch[2], 10) || 0,
            timeMatch[3] ? parseInt(timeMatch[3], 10) || 0 : 0,
            0,
          );
        }
      }
      
      const amount = parseAmount(amountValue);

      if (!date || isNaN(date.getTime())) {
        stats.noDate++;
        continue;
      }
      // Aceita qualquer valor numérico válido (inclusive zero e negativos)
      if (amount === null || Number.isNaN(amount)) {
        stats.noAmount++;
        continue;
      }

      const description = buildSafeDescription(String(descValue));
      const externalId = buildExternalId(String(descValue), rowCounter);
      transactions.push({
        date,
        amount,
        description,
        externalId,
      });
    }

    return transactions;
  },

  async parseOFX(content: string): Promise<ParsedTransaction[]> {
    const transactions: ParsedTransaction[] = [];
    
    // Handle both XML-style and SGML-style OFX
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
    let match;
    let rowCounter = 0;

    while ((match = stmtTrnRegex.exec(content)) !== null) {
      rowCounter++;
      const trn = match[1];
      
      // Try different date formats in OFX
      const dtPosted = trn.match(/<DTPOSTED>(\d{8,14})/)?.[1];
      const trnAmt = trn.match(/<TRNAMT>([+-]?[\d.,]+)/)?.[1];
      const memo = trn.match(/<MEMO>([^<\r\n]*)/)?.[1]?.trim() || '';
      const name = trn.match(/<NAME>([^<\r\n]*)/)?.[1]?.trim() || '';
      const fitid = trn.match(/<FITID>([^<\r\n]*)/)?.[1]?.trim() || '';

      if (dtPosted && trnAmt) {
        const year = parseInt(dtPosted.substring(0, 4));
        const month = parseInt(dtPosted.substring(4, 6)) - 1;
        const day = parseInt(dtPosted.substring(6, 8));
        // OFX pode ter hora embutida (YYYYMMDDHHMMSS)
        const hour = dtPosted.length >= 10 ? parseInt(dtPosted.substring(8, 10)) || 0 : 0;
        const minute = dtPosted.length >= 12 ? parseInt(dtPosted.substring(10, 12)) || 0 : 0;
        const second = dtPosted.length >= 14 ? parseInt(dtPosted.substring(12, 14)) || 0 : 0;
        
        const date = new Date(year, month, day, hour, minute, second);
        const amount = parseFloat(trnAmt.replace(',', '.'));

        // Aceita qualquer valor numérico válido (inclusive zero e negativos).
        if (!isNaN(date.getTime()) && Number.isFinite(amount)) {
          const description = buildSafeDescription(memo || name);
          const rawId = fitid || memo || name;
          const externalId = buildExternalId(rawId, rowCounter);
          transactions.push({
            date,
            amount,
            description,
            externalId,
          });
        }
      }
    }

    return transactions;
  },

  async processFile(file: File, userId: string): Promise<{ processed: number; duplicates: number; totalAmount: number; discarded: number; discardStats: DiscardStats }> {
    let parsedTransactions: ParsedTransaction[] = [];
    const filename = file.name.toLowerCase();
    const discardStats = createEmptyDiscardStats();

    try {
      if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
        const content = await file.text();
        parsedTransactions = await this.parseCSV(content, discardStats);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        parsedTransactions = await this.parseXLSX(buffer, discardStats);
      } else if (filename.endsWith('.ofx') || filename.endsWith('.qfx')) {
        const content = await file.text();
        parsedTransactions = await this.parseOFX(content);
      } else {
        throw new Error('Formato de arquivo não suportado. Use CSV, XLSX, XLS, OFX ou QFX.');
      }
    } catch (e: any) {
      throw new Error(`Erro ao processar arquivo: ${e.message}`);
    }

    if (parsedTransactions.length === 0) {
      throw new Error('Nenhuma transação válida encontrada no arquivo. Verifique se o arquivo contém transações com data, descrição e valor positivo.');
    }

    const discardedTotal =
      discardStats.noDate +
      discardStats.noAmount +
      discardStats.sentPix +
      discardStats.metadataRow +
      discardStats.tooFewColumns;

    const remoteResult = await uploadParsedTransactionsViaNetlify(file.name, userId, parsedTransactions, discardStats);
    if (remoteResult) {
      return remoteResult;
    }

    // Create upload log (non-fatal: log warning and continue if this fails,
    // e.g., when no live Supabase session exists / RLS blocks the insert)
    let uploadLog: any = null;
    const { data: uploadLogData, error: logError } = await supabase
      .from('upload_logs')
      .insert({
        user_id: userId,
        filename: file.name,
        total_transactions: parsedTransactions.length,
        status: 'PROCESSING',
      })
      .select()
      .single();

    if (logError) {
    } else {
      uploadLog = uploadLogData;
    }

    // Process transactions
    const transactionsToInsert: TransactionInsert[] = [];
    const seenHashes = new Set<string>();
    let duplicates = 0;
    let totalAmount = 0;

    for (const parsed of parsedTransactions) {
      const hash = generateHash(parsed);

      // Duplicate dentro do próprio arquivo (mesmo hash na mesma importação)
      if (seenHashes.has(hash)) {
        duplicates++;
        continue;
      }
      seenHashes.add(hash);

      // Duplicate já existente no banco
      const isDuplicate = await transactionService.checkDuplicate(hash);
      if (isDuplicate) {
        duplicates++;
        continue;
      }

      const churchId = await identifyChurchId(parsed.amount);
      totalAmount += parsed.amount;

      transactionsToInsert.push({
        date: parsed.date.toISOString(),
        amount: parsed.amount,
        description: parsed.description,
        church_id: churchId,
        hash,
        status: 'PENDING',
      });
    }

    // Bulk insert transactions
    if (transactionsToInsert.length > 0) {
      await transactionService.bulkCreate(transactionsToInsert);

      // Alimenta o snapshot mensal apenas com as transações efetivamente
      // inseridas (não duplicadas). Falhas aqui não derrubam o upload.
      try {
        const increments = groupTransactionsByMonth(transactionsToInsert);
        if (increments.length > 0) {
          await monthlyStatsService.applyIncrement(increments);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[monthly_stats] applyIncrement falhou:', err);
      }
    }

    // Update upload log
    if (uploadLog) {
      await supabase
        .from('upload_logs')
        .update({
          processed_transactions: transactionsToInsert.length,
          duplicates_skipped: duplicates,
          total_amount: totalAmount,
          status: 'COMPLETED',
        })
        .eq('id', uploadLog.id);
    }

    return {
      processed: transactionsToInsert.length,
      duplicates,
      totalAmount,
      discarded: discardedTotal,
      discardStats,
    };
  }
};

// ==================== COMBINED API EXPORT ====================

const supabaseApi = {
  // Auth
  login: authService.login,
  logout: authService.logout,
  getCurrentUser: authService.getCurrentUser,
  signUp: authService.signUp,

  // Churches
  getChurches: churchService.getAll,
  seedChurches: churchService.seedChurches,

  // Transactions
  getTransactions: transactionService.getAll,
  resetTransactions: transactionService.deleteAll,
  
  // Stats
  getStats: statsService.getDashboardStats,
  getMonthlyEvolution: statsService.getMonthlyEvolution,
  getChurchesWithMonthlyData: statsService.getChurchesWithMonthlyData,

  // File upload
  uploadExtract: async (file: File, userId: string) => {
    return fileParserService.processFile(file, userId);
  },
};

export const api = USE_MOCK ? mockApi : supabaseApi;

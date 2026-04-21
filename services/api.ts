import { supabase, USE_MOCK } from './supabase';
import { api as mockApi } from './mockService';
import { CHURCH_MAPPING } from '../constants';
import { User, UserRole, DashboardStats, Transaction as AppTransaction } from '../types';
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

    if (count && count > 0) {
      console.log('Churches already seeded');
      return;
    }

    // Insert all churches from the mapping
    const churches = Object.entries(CHURCH_MAPPING).map(([cents, name]) => ({
      name,
      cents_code: parseInt(cents),
    }));

    const { error } = await supabase.from('churches').insert(churches);
    if (error) throw error;
    console.log('Churches seeded successfully');
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
    // Get count before deletion
    const { count: beforeCount } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true });

    console.log(`🔍 Found ${beforeCount || 0} transactions to delete`);

    // Delete all transactions using gte (greater than or equal to) on a timestamp
    // This will match all rows
    const { error, count: deletedCount } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .gte('created_at', '1970-01-01'); // Match all records (any date >= 1970)

    if (error) {
      console.error('❌ Delete error:', error);
      throw error;
    }

    console.log(`🗑️ Deleted ${deletedCount || beforeCount || 0} transactions`);
    return deletedCount || beforeCount || 0;
  }
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

    console.log('📊 getDashboardStats -> totalTransactions:', totalTransactions, 'totalAmount:', totalAmount);

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
  }
};

// ==================== FILE PARSER ====================

interface ParsedTransaction {
  date: Date;
  amount: number;
  description: string;
}

// Build a safe, generic description that não expõe nome do doador
const buildSafeDescription = (_raw?: string): string => {
  // Mantemos uma descrição neutra para qualquer crédito recebido
  return 'PIX RECEBIDO';
};

// Generate hash for deduplication
const generateHash = (tx: ParsedTransaction): string => {
  const str = `${tx.date.toISOString()}|${tx.amount.toFixed(2)}|${tx.description.trim()}`;
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
  // Extract cents more reliably by converting to string
  const amountStr = amount.toFixed(2); // Ensures 2 decimal places
  const parts = amountStr.split('.');
  const cents = parseInt(parts[1] || '0', 10);
  
  console.log(`🔍 Identifying church: amount=${amount}, amountStr=${amountStr}, cents=${cents}`);
  
  try {
    const churchMap = await getChurchIdMap();
    
    // Look up the database ID for this cents_code
    if (churchMap.has(cents)) {
      const dbId = churchMap.get(cents)!;
      console.log(`✅ Identified church: cents=${cents}, db_id=${dbId}`);
      return dbId;
    }
    
    // If not found, use default church (cents_code = 0 = "Não identificado")
    if (churchMap.has(0)) {
      const defaultId = churchMap.get(0)!;
      console.warn(`⚠️ Church not found for cents=${cents}, using default (id=${defaultId})`);
      return defaultId;
    }
    
    // Fallback if even default doesn't exist (shouldn't happen)
    console.error(`❌ Cannot identify church: cents=${cents}, no church map available`);
    return 1; // Fallback to first church
  } catch (error) {
    console.error(`❌ Error identifying church for amount ${amount}:`, error);
    return 1; // Fallback to first church on error
  }
};

// Parse Brazilian date formats (DD/MM/YYYY, DD-MM-YYYY, etc)
const parseDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  const cleaned = dateStr.toString().trim().replace(/"/g, '');
  
  // Try DD/MM/YYYY or DD-MM-YYYY (Brazilian format)
  const brMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1]);
    const month = parseInt(brMatch[2]) - 1;
    let year = parseInt(brMatch[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try YYYY-MM-DD (ISO format)
  const isoMatch = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try standard Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) return date;
  
  return null;
};

// Parse amount from various formats
const parseAmount = (amountStr: string | number): number | null => {
  if (typeof amountStr === 'number') {
    return amountStr > 0 ? amountStr : null;
  }
  
  if (!amountStr) return null;
  
  let cleaned = amountStr.toString().trim().replace(/"/g, '');
  
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
  return !isNaN(amount) && amount > 0 ? amount : null;
};

export const fileParserService = {
  async parseCSV(content: string): Promise<ParsedTransaction[]> {
    console.log('Parsing CSV...');
    const lines = content.trim().split(/\r?\n/);
    const transactions: ParsedTransaction[] = [];

    if (lines.length < 2) {
      console.log('CSV has less than 2 lines');
      return transactions;
    }

    // Detect separator (try tab, semicolon, then comma)
    const firstDataLine = lines.find(l => l.trim() && !l.toLowerCase().includes('cliente') && !l.toLowerCase().includes('conta'));
    const firstLine = lines[0];
    let separator = '\t';
    if (!firstLine.includes('\t')) {
      separator = firstLine.includes(';') ? ';' : ',';
    }
    console.log('CSV separator:', separator === '\t' ? 'TAB' : separator);

    // Parse header to find columns
    const headers = firstLine.split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    console.log('CSV headers:', headers);
    
    // Find column indexes - support Caixa PIX format
    const dateIdx = headers.findIndex(h => 
      h === 'data' || h.includes('data') || h.includes('date') || h.includes('dt')
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
    
    console.log('Column indexes - date:', dateIdx, 'desc:', descIdx, 'amount:', amountIdx, 'tipoPix:', tipoPixIdx);

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Skip header rows that might appear in the middle (Caixa format has metadata rows)
      if (line.toLowerCase().includes('cliente') || line.toLowerCase().includes('conta') || line.toLowerCase().includes('extrato')) {
        continue;
      }

      const parts = line.split(separator).map(p => p.trim().replace(/"/g, ''));
      
      // Skip if not enough columns
      if (parts.length < 3) continue;
      
      // For Caixa format: only process "RECEBIDO" or positive value transactions
      // Skip only if explicitly marked as "ENVIADO" (sent)
      if (tipoPixIdx >= 0) {
        const tipoPix = parts[tipoPixIdx]?.toUpperCase() || '';
        if (tipoPix === 'ENVIADO') {
          console.log('⏭️ Skipping sent transaction (ENVIADO):', tipoPix);
          continue;
        }
      }
      
      // Use detected columns or fallback to positional
      const dateStr = dateIdx >= 0 ? parts[dateIdx] : parts[0];
      const rawDescription = descIdx >= 0 ? parts[descIdx] : (parts[4] || parts[1] || 'PIX');
      // For Caixa: valor is usually the last column
      const amountStr = amountIdx >= 0 ? parts[amountIdx] : parts[parts.length - 1];
      
      const date = parseDate(dateStr);
      const amount = parseAmount(amountStr);
      
      if (date && amount && amount > 0) {
        const description = buildSafeDescription(rawDescription);
        transactions.push({ date, amount, description });
        console.log('✅ Parsed CSV transaction:', { date: date.toISOString(), amount });
      } else {
        console.log('⏭️ Skipped invalid transaction:', { dateStr, amountStr, amount });
      }
    }

    console.log('Total CSV transactions parsed:', transactions.length);
    return transactions;
  },

  async parseXLSX(buffer: ArrayBuffer): Promise<ParsedTransaction[]> {
    console.log('Parsing XLSX...');
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    
    // Get raw data first to see what we have
    const rawData = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 });
    console.log('XLSX total rows (raw):', rawData.length);
    
    // Find the header row (look for "Data" column)
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i] as any[];
      if (row && row.some(cell => {
        const cellStr = String(cell || '').toLowerCase();
        return cellStr === 'data' || cellStr.includes('data');
      })) {
        headerRowIdx = i;
        console.log('Found header row at index:', i);
        break;
      }
    }
    
    // Parse with detected header
    const data = XLSX.utils.sheet_to_json<any>(firstSheet, { 
      range: headerRowIdx,
      raw: false, 
      dateNF: 'dd/mm/yyyy' 
    });
    
    console.log('XLSX data rows:', data.length);
    if (data.length > 0) {
      console.log('First row:', data[0]);
      console.log('First row keys:', Object.keys(data[0]));
    }

    const transactions: ParsedTransaction[] = [];

    for (const row of data) {
      const keys = Object.keys(row);
      const values = Object.values(row);
      
      // Try to find columns by name patterns - Caixa PIX format
      let dateValue: any = null;
      let descValue: any = null;
      let amountValue: any = null;
      let tipoPix: string = '';
      
      for (const key of keys) {
        const keyLower = key.toLowerCase().trim();
        
        // Date column
        if (!dateValue && (keyLower === 'data' || keyLower.startsWith('data'))) {
          dateValue = row[key];
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
      
      // Skip only if explicitly marked as "ENVIADO" (sent), not all non-RECEBIDO
      if (tipoPix === 'ENVIADO') {
        console.log('⏭️ Skipping sent transaction (ENVIADO)');
        continue;
      }
      
      // Fallback: if no named columns found, use positional (Caixa format)
      // Caixa format: Data | Hora | Tipo de Pix | Situação | Remetente/Destinatário | Valor
      if (!dateValue) dateValue = values[0];
      if (!descValue) descValue = values[4] || values[1] || 'PIX RECEBIDO';
      if (!amountValue) amountValue = values[5] || values[values.length - 1];

      let date: Date | null = null;
      
      // Handle Excel serial date numbers
      if (typeof dateValue === 'number') {
        date = new Date((dateValue - 25569) * 86400 * 1000);
      } else if (dateValue instanceof Date) {
        date = dateValue;
      } else {
        date = parseDate(String(dateValue));
      }
      
      const amount = parseAmount(amountValue);

      if (date && amount && amount > 0) {
        const description = buildSafeDescription(String(descValue));
        transactions.push({
          date,
          amount,
          description,
        });
        console.log('✅ Parsed XLSX transaction:', { date: date.toISOString(), amount });
      } else {
        console.log('⏭️ Skipped invalid XLSX transaction:', { dateValue, amountValue, amount });
      }
    }

    console.log('Total XLSX transactions parsed:', transactions.length);
    return transactions;
  },

  async parseOFX(content: string): Promise<ParsedTransaction[]> {
    console.log('Parsing OFX...');
    const transactions: ParsedTransaction[] = [];
    
    // Handle both XML-style and SGML-style OFX
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi;
    let match;

    while ((match = stmtTrnRegex.exec(content)) !== null) {
      const trn = match[1];
      
      // Try different date formats in OFX
      const dtPosted = trn.match(/<DTPOSTED>(\d{8,14})/)?.[1];
      const trnAmt = trn.match(/<TRNAMT>([+-]?[\d.,]+)/)?.[1];
      const memo = trn.match(/<MEMO>([^<\r\n]*)/)?.[1]?.trim() || '';
      const name = trn.match(/<NAME>([^<\r\n]*)/)?.[1]?.trim() || '';
      const trnType = trn.match(/<TRNTYPE>([^<\r\n]*)/)?.[1]?.trim() || '';

      console.log('OFX transaction candidate:', { dtPosted, trnAmt, memo, name, trnType });

      if (dtPosted && trnAmt) {
        const year = parseInt(dtPosted.substring(0, 4));
        const month = parseInt(dtPosted.substring(4, 6)) - 1;
        const day = parseInt(dtPosted.substring(6, 8));
        
        const date = new Date(year, month, day);
        const amount = parseFloat(trnAmt.replace(',', '.'));

        // Accept positive amounts (credits) - most important is positive value
        if (!isNaN(date.getTime()) && !isNaN(amount) && amount > 0) {
          const description = buildSafeDescription(memo || name);
          transactions.push({
            date,
            amount,
            description,
          });
          console.log('✅ Parsed OFX transaction:', { date: date.toISOString(), amount });
        } else {
          console.log('⏭️ Skipped OFX transaction (invalid):', { amount });
        }
      }
    }

    console.log('Total OFX transactions parsed:', transactions.length);
    return transactions;
  },

  async processFile(file: File, userId: string): Promise<{ processed: number; duplicates: number; totalAmount: number }> {
    console.log('📄 Processing file:', file.name, 'Size:', (file.size / 1024).toFixed(1), 'KB');
    
    let parsedTransactions: ParsedTransaction[] = [];
    const filename = file.name.toLowerCase();

    try {
      if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
        const content = await file.text();
        console.log('File content preview (first 500 chars):', content.substring(0, 500));
        parsedTransactions = await this.parseCSV(content);
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        parsedTransactions = await this.parseXLSX(buffer);
      } else if (filename.endsWith('.ofx') || filename.endsWith('.qfx')) {
        const content = await file.text();
        console.log('File content preview (first 500 chars):', content.substring(0, 500));
        parsedTransactions = await this.parseOFX(content);
      } else {
        throw new Error('Formato de arquivo não suportado. Use CSV, XLSX, XLS, OFX ou QFX.');
      }
    } catch (e: any) {
      console.error('❌ Error parsing file:', e);
      throw new Error(`Erro ao processar arquivo: ${e.message}`);
    }

    console.log(`✅ Total transactions parsed from file: ${parsedTransactions.length}`);

    if (parsedTransactions.length === 0) {
      throw new Error('Nenhuma transação válida encontrada no arquivo. Verifique se o arquivo contém transações com data, descrição e valor positivo.');
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
      console.warn('⚠️ Could not create upload log (non-fatal):', logError.message);
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

    console.log('📦 Prepared for insert:', {
      parsed: parsedTransactions.length,
      toInsert: transactionsToInsert.length,
      duplicates,
      totalAmount,
    });

    // Bulk insert transactions
    if (transactionsToInsert.length > 0) {
      await transactionService.bulkCreate(transactionsToInsert);
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

  // File upload
  uploadExtract: async (file: File, userId: string) => {
    return fileParserService.processFile(file, userId);
  },
};

export const api = USE_MOCK ? mockApi : supabaseApi;

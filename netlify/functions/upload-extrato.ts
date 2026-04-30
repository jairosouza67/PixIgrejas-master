import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

type ParsedTransactionInput = {
  date: string;
  amount: number;
  description: string;
  externalId?: string;
};

type UploadRequestBody = {
  filename?: string;
  userId?: string;
  transactions?: ParsedTransactionInput[];
};

const jsonResponse = (body: unknown, statusCode: number) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const generateHash = (transaction: { date: Date; amount: number; description: string; externalId: string }) => {
  const normalized = `${transaction.date.toISOString()}|${transaction.amount.toFixed(2)}|${transaction.description.trim()}|${transaction.externalId}`;
  return crypto.createHash('md5').update(normalized).digest('hex');
};

const loadChurchMap = async (supabase: ReturnType<typeof createClient>) => {
  const { data, error } = await supabase
    .from('churches')
    .select('id, cents_code');

  if (error) {
    throw error;
  }

  const churchMap = new Map<number, number>();
  data?.forEach((church: any) => {
    churchMap.set(church.cents_code, church.id);
  });

  return churchMap;
};

const identifyChurchId = (churchMap: Map<number, number>, amount: number) => {
  // Usa valor absoluto para extrair centavos corretamente de valores negativos.
  const cents = Math.round((Math.abs(amount) % 1) * 100);

  if (churchMap.has(cents)) {
    return churchMap.get(cents)!;
  }

  if (churchMap.has(0)) {
    return churchMap.get(0)!;
  }

  return 1;
};

const parseDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data inválida recebida: ${value}`);
  }

  return parsed;
};

const runUploadExtrato = async (event: any) => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      {
        error:
          'Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.',
      },
      500,
    );
  }

  const authorization = event.headers?.authorization || event.headers?.Authorization || '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!accessToken) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  const body = (event.body ? JSON.parse(event.body) : {}) as UploadRequestBody;
  const filename = body.filename?.trim();
  const userId = body.userId?.trim();
  const transactions = Array.isArray(body.transactions) ? body.transactions : [];

  if (!filename) {
    return jsonResponse({ error: 'filename is required' }, 400);
  }

  if (userId && userId !== userData.user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (!transactions.length) {
    return jsonResponse({ error: 'transactions are required' }, 400);
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    return jsonResponse({ error: 'User profile not found' }, 404);
  }

  if (profile.role !== 'ADMIN') {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const parsedTransactions = transactions.map((transaction, index) => ({
    date: parseDate(transaction.date),
    amount: Number(transaction.amount),
    description: String(transaction.description || '').trim(),
    externalId: String(transaction.externalId || `row-${index}`).trim(),
  }));

  const { data: uploadLog, error: uploadLogError } = await supabase
    .from('upload_logs')
    .insert({
      user_id: userData.user.id,
      filename,
      total_transactions: parsedTransactions.length,
      status: 'PROCESSING',
    })
    .select()
    .single();

  if (uploadLogError) {
    return jsonResponse({ error: uploadLogError.message }, 500);
  }

  const normalizedTransactions = [] as Array<{
    date: string;
    amount: number;
    description: string;
    church_id: number;
    hash: string;
    status: 'PENDING';
  }>;
  const seenHashes = new Set<string>();
  let duplicates = 0;
  let totalAmount = 0;

  const hashes = parsedTransactions.map((transaction) => generateHash(transaction));
  const churchMap = await loadChurchMap(supabase);

  const { data: existingTransactions, error: existingError } = await supabase
    .from('transactions')
    .select('hash')
    .in('hash', hashes);

  if (existingError) {
    return jsonResponse({ error: existingError.message }, 500);
  }

  const existingHashes = new Set((existingTransactions ?? []).map((transaction: { hash: string }) => transaction.hash));

  for (const transaction of parsedTransactions) {
    const hash = generateHash(transaction);

    if (seenHashes.has(hash) || existingHashes.has(hash)) {
      duplicates += 1;
      continue;
    }

    seenHashes.add(hash);
    totalAmount += transaction.amount;

  const churchId = identifyChurchId(churchMap, transaction.amount);

    normalizedTransactions.push({
      date: transaction.date.toISOString(),
      amount: transaction.amount,
      description: transaction.description,
      church_id: churchId,
      hash,
      status: 'PENDING',
    });
  }

  if (normalizedTransactions.length > 0) {
    const { error: insertError } = await supabase.from('transactions').insert(normalizedTransactions);
    if (insertError) {
      await supabase
        .from('upload_logs')
        .update({
          processed_transactions: 0,
          duplicates_skipped: duplicates,
          total_amount: totalAmount,
          status: 'ERROR',
          error_message: insertError.message,
        })
        .eq('id', uploadLog.id);

      return jsonResponse({ error: insertError.message }, 500);
    }
  }

  await supabase
    .from('upload_logs')
    .update({
      processed_transactions: normalizedTransactions.length,
      duplicates_skipped: duplicates,
      total_amount: totalAmount,
      status: 'COMPLETED',
    })
    .eq('id', uploadLog.id);

  return jsonResponse(
    {
      processed: normalizedTransactions.length,
      duplicates,
      totalAmount,
    },
    200,
  );
};

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    return await runUploadExtrato(event);
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Unexpected error' }, 500);
  }
};

export default handler;
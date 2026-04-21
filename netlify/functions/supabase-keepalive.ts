import { createClient } from '@supabase/supabase-js';

const schedule = '*/30 * * * *';

export const config = {
  schedule,
};

const jsonResponse = (body: unknown, statusCode: number) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const runKeepalive = async () => {
  // Accept both backend-style and Vite-style env names to avoid deploy mismatches.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Missing Supabase env vars. Set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY), or VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.',
      },
      500,
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Read-only ping: HEAD + count evita trazer payload e nao altera dados.
  const { count, error } = await supabase
    .from('churches')
    .select('id', { head: true, count: 'exact' });

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse(
    {
      ok: true,
      message: 'Supabase keepalive executed successfully.',
      table: 'churches',
      rows: count ?? 0,
      timestamp: new Date().toISOString(),
      schedule,
    },
    200,
  );
};

export const handler = runKeepalive;
export default runKeepalive;


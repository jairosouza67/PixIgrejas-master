import { createClient } from '@supabase/supabase-js';

const schedule = '*/30 * * * *';

export const config = {
  schedule,
};

export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
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
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Supabase keepalive executed successfully.',
      table: 'churches',
      rows: count ?? 0,
      timestamp: new Date().toISOString(),
      schedule,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
};
#884

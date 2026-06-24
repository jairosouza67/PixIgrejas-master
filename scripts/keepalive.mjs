/**
 * Supabase Keepalive — usa fetch nativo (Node.js 18+)
 * Sem dependências externas.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Carrega .env localmente (em CI usa os secrets do ambiente)
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '..', '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* .env não encontrado — usa variáveis do sistema */ }

const supabaseUrl  = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  process.exit(1);
}

async function keepalive() {
  const startTime = Date.now();
  console.log(`🏓 [${new Date().toISOString()}] Executando keepalive...`);

  // ⚠️ Troque "empresas" pelo nome de qualquer tabela existente no seu banco
  const TABELA = 'perfis_usuario';

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${TABELA}?select=id&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'count=exact',
        },
      }
    );

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} — ${await response.text()}`);
    }

    console.log(`✅ Sucesso em ${elapsed}ms | Status: ${response.status}`);
    return true;
  } catch (err) {
    console.error(`❌ Falhou após ${Date.now() - startTime}ms: ${err.message}`);
    return false;
  }
}

const ok = await keepalive();
process.exit(ok ? 0 : 1);

# ⚡ Supabase Keepalive — Guia Reutilizável

> Evita que o banco Supabase entre em hibernação por inatividade.
> Funciona com qualquer projeto que tenha repositório no GitHub.

---

## Como funciona

Um script Node.js faz uma requisição leve à REST API do Supabase a cada 24h,
disparado automaticamente pelo GitHub Actions (gratuito, sem servidor).

- **Zero dependências npm** — usa `fetch` nativo do Node.js 22
- **Tempo de execução:** ~5 segundos
- **Custo:** R$ 0,00

---

## Pré-requisitos

- Repositório no GitHub (público ou privado)
- Projeto Supabase ativo
- Uma tabela qualquer no banco (ex: `empresas`, `users`, `produtos`)

---

## Passo 1 — Criar o script de keepalive

Crie o arquivo `scripts/keepalive.mjs` na raiz do projeto:

```js
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
  const TABELA = 'empresas';

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
```

> **Personalize a linha `const TABELA = 'empresas'`** com o nome de qualquer tabela do seu banco.

---

## Passo 2 — Criar o workflow do GitHub Actions

Crie o arquivo `.github/workflows/keepalive.yml`:

```yaml
name: Supabase Keepalive

on:
  schedule:
    - cron: '0 9 * * *'   # Todo dia às 09:00 UTC (06:00 BRT)
  workflow_dispatch:        # Permite rodar manualmente pelo GitHub UI

jobs:
  keepalive:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22   # Node 22+ tem WebSocket nativo (obrigatório)

      - name: Verificar secrets
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          [ -z "$SUPABASE_URL" ] && echo "❌ SUPABASE_URL não configurado!" && exit 1
          [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && echo "❌ SUPABASE_SERVICE_ROLE_KEY não configurado!" && exit 1
          echo "✅ Secrets OK"

      - name: Executar keepalive
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node scripts/keepalive.mjs
```

---

## Passo 3 — Configurar os Secrets no GitHub

1. Acesse: `https://github.com/SEU_USUARIO/SEU_REPO/settings/secrets/actions`
2. Clique em **"New repository secret"** e adicione:

| Secret | Onde encontrar |
|--------|---------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API → **Project URL** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → **service_role secret** |

---

## Passo 4 — Commit e teste manual

```bash
git add scripts/keepalive.mjs .github/workflows/keepalive.yml
git commit -m "feat: add Supabase keepalive via GitHub Actions"
git push
```

Depois acesse:
`https://github.com/SEU_USUARIO/SEU_REPO/actions/workflows/keepalive.yml`

Clique em **"Run workflow"** → confirme. Deve passar em ~5 segundos. ✅

---

## Checklist rápido para novos projetos

- [ ] Copiar `scripts/keepalive.mjs` e trocar `TABELA` para uma tabela existente
- [ ] Copiar `.github/workflows/keepalive.yml` sem alterações
- [ ] Adicionar `SUPABASE_URL` nos secrets do repositório
- [ ] Adicionar `SUPABASE_SERVICE_ROLE_KEY` nos secrets do repositório
- [ ] Fazer commit e push
- [ ] Rodar manualmente uma vez para validar

---

## Observações

- **Node.js deve ser 22+** — versões anteriores (18, 20) podem falhar com o `@supabase/realtime-js` mesmo sem usá-lo diretamente. Este script usa apenas `fetch` nativo, mas o ambiente deve ser Node 22.
- **Não use `@supabase/supabase-js`** neste script — o cliente inicializa o Realtime internamente e exige WebSocket nativo ou o pacote `ws`.
- **A tabela não precisa ter dados** — o `?limit=1` nunca falha mesmo com tabela vazia.
- **RLS:** se a tabela tiver RLS restritiva, use a `SUPABASE_SERVICE_ROLE_KEY` (que bypassa RLS). A `ANON_KEY` pode retornar erro 403.

# ⚡ SOLUÇÃO RÁPIDA: Erro RLS na Inicialização

## O Problema
```
Failed to insert churches batch: new row violates row-level security policy
```

A política de segurança do Supabase está bloqueando a inicialização.

---

## 🎯 SOLUÇÃO (Escolha UMA):

### **OPÇÃO 1: Mudar a Política RLS** ⭐ Recomendada
Menos intrusiva, mantém segurança.

**Execute este SQL no Supabase:**
```sql
DROP POLICY IF EXISTS "Admins can insert churches" ON churches;
CREATE POLICY "Anyone can insert churches (for initialization)" ON churches
  FOR INSERT TO authenticated
  WITH CHECK (true);
```

### **OPÇÃO 2: Desabilitar RLS Completamente**
Mais rápido, remove segurança (aceitável para dados públicos).

**Execute este SQL:**
```sql
ALTER TABLE churches DISABLE ROW LEVEL SECURITY;
```

---

## 📍 Como Executar:

1. Acesse: https://vnupleyrvqabhcfygaxd.supabase.co
2. Menu esquerdo → **SQL Editor**
3. **New Query**
4. Cole um dos SQLs acima
5. Clique **Run** (ou Ctrl+Enter)
6. Volte à app e **recarregue** (F5)

---

## ✅ Verificação

No Console (F12), você verá:
```
📊 Prepared 67 churches for insertion
📤 Batch 1/2: Inserting 50 churches...
✅ Database initialization completed successfully!
```

Dashboard carregará normalmente! 🎉

---

## 💡 Próximos Passos (após SQL executado)

1. Recarregue o navegador (F5)
2. Aguarde a inicialização (15-30 segundos)
3. Faça login com: `admin@ecclesia.com` / `admin`
4. Você verá o Dashboard com 0 transações
5. Vá para Upload e carregue sua planilha!

---

**Precisa de ajuda?** Verifique se:
- ✅ Você está logado no Supabase
- ✅ Está no projeto correto: `vnupleyrvqabhcfygaxd`
- ✅ Copiou o SQL EXATAMENTE como está acima
- ✅ Clicou em Run/Execute

---

## 📊 Tabela `monthly_stats` (Evolução Mensal por Igreja)

Essa tabela guarda o snapshot acumulado dos valores recebidos por mês e igreja.
Ela é alimentada incrementalmente a cada upload de extrato e NÃO é afetada
pelo botão "Limpar Todas as Transações" — o histórico mensal é preservado.

**Execute este SQL no Supabase SQL Editor:**

```sql
create table if not exists monthly_stats (
  id bigserial primary key,
  year smallint not null,
  month smallint not null check (month between 1 and 12),
  church_id bigint not null references churches(id) on delete cascade,
  total_amount numeric(14,2) not null default 0,
  transaction_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (year, month, church_id)
);

create index if not exists monthly_stats_year_month_idx
  on monthly_stats (year, month);

alter table monthly_stats enable row level security;

drop policy if exists "monthly_stats_select_all" on monthly_stats;
create policy "monthly_stats_select_all" on monthly_stats
  for select using (true);

drop policy if exists "monthly_stats_admin_write" on monthly_stats;
create policy "monthly_stats_admin_write" on monthly_stats
  for all
  using (exists (select 1 from users u where u.id = auth.uid() and u.role = 'ADMIN'))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.role = 'ADMIN'));
```

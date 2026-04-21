Sistema de gestão financeira para a Congregação Cristã no Brasil (Adm. Vitória da Conquista).
Faz upload de extratos bancários (CSV, XLSX, OFX) e identifica automaticamente a igreja pelos centavos.
Armazena as transações no Supabase, com deduplicação por hash para evitar lançamentos repetidos.
Exibe dashboard com volume total, transações processadas, ranking de igrejas e receita diária.
Integra com Google Sheets para cada congregação, sem exibir nomes de doadores (dados anonimizados).

## Modo sem Supabase (mock)

Se você estiver sem internet/DNS bloqueado ou não quiser configurar o Supabase agora, ative o modo mock adicionando no seu `.env`:

`VITE_USE_MOCK=true`

Isso desativa a inicialização do banco e usa dados simulados para login/dashboard/upload.
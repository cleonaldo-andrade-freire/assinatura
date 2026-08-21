-- Anamnese SaaS — base de medicamentos da Anvisa (dados abertos), usada só
-- pra autocomplete de nome no formulário de prescrição. Mesmo padrão de
-- `plans` (008): leitura pública pra qualquer usuário logado, escrita só
-- pela service key (script de import em scripts/import-anvisa-medicamentos.ts).
-- Rode uma vez no SQL Editor do Supabase, depois rode o script de import.
create table anvisa_medicamentos (
  id bigint generated always as identity primary key,
  nome_produto text not null,
  principio_ativo text,
  classe_terapeutica text,
  numero_registro text,
  created_at timestamptz not null default now()
);

create index anvisa_medicamentos_nome_idx on anvisa_medicamentos (nome_produto);

alter table anvisa_medicamentos enable row level security;

create policy "anvisa_medicamentos são públicos pra leitura" on anvisa_medicamentos
  for select using (true);
-- Sem policy de insert/update/delete: só a service key (script de import) escreve.

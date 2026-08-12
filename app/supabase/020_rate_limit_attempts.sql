-- Anamnese SaaS — limitador de tentativas pro portal público de validação
-- Rode uma vez no SQL Editor do Supabase, depois da 019.

create table rate_limit_attempts (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_attempts_key_created_idx on rate_limit_attempts(key, created_at);

-- Só a chave de serviço acessa (checagem de rate limit acontece no servidor,
-- antes de qualquer sessão existir) — sem policy de select/insert pra usuário
-- autenticado, mesmo espírito de `certificates`/`prescriptions`.
alter table rate_limit_attempts enable row level security;

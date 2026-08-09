-- Anamnese SaaS — schema inicial (Fatia 1)
-- Rode este script inteiro uma vez no Supabase: SQL Editor → New query → cole e Run.

create extension if not exists "pgcrypto";

-- ── Enums ──────────────────────────────────────────────────────────────────
create type plan as enum ('starter', 'pro');
create type billing_cycle as enum ('monthly', 'yearly');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type user_role as enum ('owner', 'staff');

-- ── Tabelas ────────────────────────────────────────────────────────────────
create table clinics (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  slug                    text unique not null,
  api_key                 uuid unique not null default gen_random_uuid(),
  plan                    plan not null default 'starter',
  billing_cycle           billing_cycle not null default 'monthly',
  asaas_customer_id       text,
  asaas_subscription_id   text,
  subscription_status     subscription_status not null default 'trialing',
  trial_ends_at           timestamptz,
  past_due_since          timestamptz,
  -- Config da instância Evolution API dessa clínica, cadastrada à mão pelo operador
  -- (onboarding self-service fica pra uma fatia futura). Usado só pra avisar a
  -- clínica no WhatsApp quando uma anamnese é assinada — opcional, best-effort.
  evolution_base_url      text,
  evolution_instance_name text,
  evolution_api_key       text,
  notify_phone            text,
  created_at              timestamptz not null default now()
);

-- Perfil da aplicação para um usuário do Supabase Auth. O `id` é sempre o mesmo
-- `id` do usuário em auth.users — não guardamos senha aqui, o Supabase Auth cuida disso.
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  clinic_id  uuid not null references clinics(id) on delete cascade,
  email      text unique not null,
  role       user_role not null default 'owner',
  created_at timestamptz not null default now()
);
create index profiles_clinic_id_idx on profiles(clinic_id);

create table anamneses (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  token         uuid unique not null default gen_random_uuid(),
  patient_name  text not null,
  patient_cpf   text not null,
  patient_phone text,
  answers       jsonb not null,
  created_at    timestamptz not null default now()
);
create index anamneses_clinic_id_idx on anamneses(clinic_id);

create table signatures (
  id               uuid primary key default gen_random_uuid(),
  anamnesis_id     uuid unique not null references anamneses(id) on delete cascade,
  clinic_id        uuid not null references clinics(id) on delete cascade,
  signer_name      text not null,
  signer_cpf       text not null,
  signed_at_client timestamptz not null,
  signed_at_server timestamptz not null default now(),
  ip               text,
  user_agent       text,
  sha256           text not null,
  -- Caminho do objeto dentro do bucket "signed-pdfs" do Supabase Storage.
  pdf_storage_key  text not null,
  created_at       timestamptz not null default now()
);
create index signatures_clinic_id_idx on signatures(clinic_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Todas as escritas (criar clínica, salvar anamnese, assinar, atualizar status de
-- pagamento) acontecem no servidor via chave de serviço (bypassa RLS), porque quem
-- chama esses endpoints é o Typebot/Asaas/paciente — nunca um usuário logado.
-- RLS aqui existe pra proteger as LEITURAS feitas pelo painel (usuário logado da
-- clínica), garantindo que ele só enxerga dado da própria clínica mesmo que haja
-- algum bug futuro na rota que esqueça de filtrar por clinic_id.

alter table clinics    enable row level security;
alter table profiles   enable row level security;
alter table anamneses  enable row level security;
alter table signatures enable row level security;

create policy "select own profile" on profiles
  for select using (id = auth.uid());

create policy "select own clinic" on clinics
  for select using (id in (select clinic_id from profiles where id = auth.uid()));

create policy "select own clinic anamneses" on anamneses
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

create policy "select own clinic signatures" on signatures
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Nenhuma policy de insert/update/delete pra usuários autenticados de propósito —
-- essas operações só acontecem via chave de serviço no servidor.

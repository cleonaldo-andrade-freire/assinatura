-- Anamnese SaaS — motor de conversa próprio (substitui o Typebot pra clínicas novas)
-- Rode uma vez no SQL Editor do Supabase.

-- O motor de conversa não exige CPF como pergunta fixa (fica a critério do modelo
-- cadastrado pela clínica) — o CPF que realmente importa legalmente é o digitado
-- na hora de assinar (signatures.signer_cpf). Esse aqui era só de conveniência.
alter table anamneses alter column patient_cpf drop not null;

create table question_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  -- [{ "id": "q1", "text": "Fuma?", "type": "text" | "yesno" }, ...]
  questions jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index question_templates_clinic_id_idx on question_templates(clinic_id);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  template_id uuid not null references question_templates(id),
  patient_name text not null,
  patient_phone text not null,
  -- cópia congelada das perguntas do template no momento em que a conversa começou
  questions jsonb not null,
  current_index int not null default 0,
  answers jsonb not null default '[]',
  status text not null default 'active', -- active | completed | abandoned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_clinic_id_idx on conversations(clinic_id);
create index conversations_active_phone_idx on conversations(clinic_id, patient_phone) where status = 'active';

alter table question_templates enable row level security;
alter table conversations enable row level security;

create policy "manage own templates" on question_templates
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

create policy "select own conversations" on conversations
  for select using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Inserts/updates em conversations são feitos pelo servidor (chave de serviço) —
-- tanto ao iniciar (painel) quanto ao processar respostas (webhook da Evolution),
-- então não precisam de policy própria pra usuário autenticado.

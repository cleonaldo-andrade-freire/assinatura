-- Anamnese SaaS — histórico de evoluções por tratamento (com imagens)
-- Rode uma vez no SQL Editor do Supabase, depois da 034.
--
-- Também precisa de um bucket de Storage novo, criado manualmente (Storage
-- > New bucket, igual "certificate-pdfs"/"patient-photos"/"budget-pdfs"):
--   nome: treatment-evolution-images — privado (não marcar "Public bucket").

-- Cada linha é UM registro de evolução — um tratamento pode ter várias ao
-- longo do tempo (sessões diferentes), em vez de um campo só que se
-- sobrescreve. Finalizar um tratamento também grava uma evolução aqui (ver
-- lib/treatments.ts), então o histórico fica completo num lugar só.
create table treatment_evolutions (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics(id) on delete cascade,
  treatment_id   uuid not null references treatments(id) on delete cascade,
  patient_id     uuid not null references patients(id) on delete cascade,
  evolution_date date not null,
  text           text not null,
  -- Até 5 imagens por evolução (checado na aplicação, não só aqui) — só as
  -- chaves do Storage, mesmo padrão de photo_storage_key em patients.
  image_keys     text[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index treatment_evolutions_treatment_id_idx on treatment_evolutions(treatment_id, created_at desc);

alter table treatment_evolutions enable row level security;

create policy "manage own treatment evolutions" on treatment_evolutions
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

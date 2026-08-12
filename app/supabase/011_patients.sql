-- Anamnese SaaS — cadastro de pacientes
-- Rode uma vez no SQL Editor do Supabase, depois da 010.

create table patients (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics(id) on delete cascade,
  name       text not null,
  cpf        text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_clinic_id_idx on patients(clinic_id);
create index patients_clinic_name_idx on patients(clinic_id, name);

alter table patients enable row level security;

create policy "manage own patients" on patients
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

-- Vínculo opcional do atestado com o cadastro de paciente. O atestado continua
-- guardando patient_name/patient_cpf/patient_phone embutidos (snapshot imutável
-- do documento) — esta coluna é só pra relatório/histórico. `set null`, nunca
-- cascade: apagar um paciente do cadastro não pode apagar um documento já emitido.
alter table certificates add column patient_id uuid references patients(id) on delete set null;
create index certificates_patient_id_idx on certificates(patient_id);

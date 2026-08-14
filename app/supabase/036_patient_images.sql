-- Anamnese SaaS — galeria de imagens do paciente (aba Imagens)
-- Rode uma vez no SQL Editor do Supabase, depois da 035.
--
-- Também precisa de um bucket de Storage novo, criado manualmente (Storage
-- > New bucket, igual "patient-photos"/"treatment-evolution-images"):
--   nome: patient-images — privado (não marcar "Public bucket").

create table patient_images (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics(id) on delete cascade,
  patient_id   uuid not null references patients(id) on delete cascade,
  file_name    text not null,
  storage_key  text not null,
  content_type text not null,
  size_bytes   integer not null,
  created_at   timestamptz not null default now()
);

create index patient_images_patient_id_idx on patient_images(patient_id, created_at desc);

alter table patient_images enable row level security;

create policy "manage own patient images" on patient_images
  for all using (clinic_id in (select clinic_id from profiles where id = auth.uid()));

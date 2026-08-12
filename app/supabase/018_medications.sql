-- Anamnese SaaS — base de referência de medicamentos (uso comum em odontologia)
-- Rode uma vez no SQL Editor do Supabase, depois da 017.
--
-- ⚠️ Conjunto inicial curado (~20 medicamentos de uso comum em odontologia —
-- analgésicos, anti-inflamatórios, antibióticos, antissépticos bucais), NÃO é
-- a base oficial da ANVISA/DCB. Só sugere nome e apresentação pro autocomplete
-- — não tem posologia sugerida (`default_dosage` fica null de propósito: não
-- vou insinuar uma dosagem "padrão" como se fosse orientação clínica; isso é
-- sempre digitado e revisado pelo dentista na prescrição).
--
-- Nenhum item aqui é medicamento controlado (sem opioide, benzodiazepínico ou
-- qualquer substância das listas da Portaria 344/98) — não tento classificar
-- tipo de controle nesta fatia, então só semeio o que é claramente comum, pra
-- não correr risco de classificar errado algo sensível. O campo de medicamento
-- na prescrição sempre aceita texto livre também, pra qualquer outro caso.

create table medications (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  presentation     text,
  default_dosage   text,
  unique (name, presentation)
);
create index medications_name_idx on medications using gin (to_tsvector('portuguese', name));

alter table medications enable row level security;

create policy "medications are public reference data" on medications
  for select using (true);

insert into medications (name, presentation) values
  ('Paracetamol', '500mg, comprimido'),
  ('Paracetamol', '750mg, comprimido'),
  ('Dipirona Sódica', '500mg, comprimido'),
  ('Dipirona Sódica', '1g, comprimido'),
  ('Ibuprofeno', '400mg, comprimido'),
  ('Ibuprofeno', '600mg, comprimido'),
  ('Nimesulida', '100mg, comprimido'),
  ('Diclofenaco Sódico', '50mg, comprimido'),
  ('Diclofenaco Potássico', '50mg, comprimido'),
  ('Cetoprofeno', '100mg, comprimido'),
  ('Meloxicam', '15mg, comprimido'),
  ('Dexametasona', '4mg, comprimido'),
  ('Amoxicilina', '500mg, cápsula'),
  ('Amoxicilina', '875mg, comprimido'),
  ('Amoxicilina + Clavulanato de Potássio', '500mg + 125mg, comprimido'),
  ('Azitromicina', '500mg, comprimido'),
  ('Clindamicina', '300mg, cápsula'),
  ('Metronidazol', '400mg, comprimido'),
  ('Cefalexina', '500mg, cápsula'),
  ('Clorexidina', '0,12%, solução para bochecho'),
  ('Nistatina', '100.000 UI/mL, suspensão oral')
on conflict do nothing;

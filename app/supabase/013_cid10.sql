-- Anamnese SaaS — base de referência de CID (capítulo odontológico, CID-10 K00-K14)
-- Rode uma vez no SQL Editor do Supabase, depois da 012.
--
-- ⚠️ Conjunto inicial curado (capítulo K00-K14, doenças da cavidade oral, das
-- glândulas salivares e dos maxilares), NÃO é a tabela oficial completa do
-- DATASUS (~14.000 códigos). Serve pro autocomplete do atestado começar a
-- funcionar — o campo de CID no formulário sempre aceita texto livre também,
-- pra não travar quando o código procurado não estiver aqui. Importar a base
-- oficial completa fica pra quando o arquivo do DATASUS for baixado
-- manualmente (formato grande demais e arriscado demais pra transcrever numa
-- sessão de IA, dado que são códigos médicos usados em documento legal).

create table cid_codes (
  code        text primary key,
  description text not null
);
create index cid_codes_description_idx on cid_codes using gin (to_tsvector('portuguese', description));

alter table cid_codes enable row level security;

create policy "cid codes are public reference data" on cid_codes
  for select using (true);

insert into cid_codes (code, description) values
  ('K00.0', 'Anodontia'),
  ('K00.1', 'Dentes supranumerários'),
  ('K00.2', 'Anomalias do tamanho e da forma dos dentes'),
  ('K00.6', 'Distúrbios da erupção dentária'),
  ('K00.7', 'Síndrome da erupção dentária'),
  ('K01.0', 'Dentes inclusos'),
  ('K01.1', 'Dentes impactados'),
  ('K02.0', 'Cárie limitada ao esmalte'),
  ('K02.1', 'Cárie da dentina'),
  ('K02.2', 'Cárie do cemento'),
  ('K02.3', 'Cárie dentária estacionária'),
  ('K02.9', 'Cárie dentária não especificada'),
  ('K03.0', 'Atrição excessiva dos dentes'),
  ('K03.6', 'Depósitos [acréscimos] nos dentes'),
  ('K04.0', 'Pulpite'),
  ('K04.1', 'Necrose da polpa'),
  ('K04.4', 'Periodontite apical aguda de origem pulpar'),
  ('K04.5', 'Periodontite apical crônica'),
  ('K04.6', 'Abscesso periapical com fístula'),
  ('K04.7', 'Abscesso periapical sem fístula'),
  ('K05.0', 'Gengivite aguda'),
  ('K05.1', 'Gengivite crônica'),
  ('K05.2', 'Periodontite aguda'),
  ('K05.3', 'Periodontite crônica'),
  ('K06.0', 'Retração gengival'),
  ('K06.1', 'Hiperplasia gengival'),
  ('K07.3', 'Anomalias da posição dos dentes'),
  ('K07.4', 'Má oclusão não especificada'),
  ('K08.1', 'Perda de dentes devida a acidente, extração ou doença periodontal localizada'),
  ('K08.3', 'Raiz dentária residual'),
  ('K08.8', 'Outros transtornos especificados dos dentes e das estruturas de sustentação'),
  ('K09.0', 'Cistos odontogênicos de desenvolvimento'),
  ('K10.2', 'Condições inflamatórias dos maxilares'),
  ('K10.3', 'Alveolite dos maxilares'),
  ('K11.2', 'Sialoadenite'),
  ('K12.0', 'Aftas orais recidivantes'),
  ('K12.1', 'Outras formas de estomatite'),
  ('K12.2', 'Celulite e abscesso da boca'),
  ('K13.0', 'Doenças dos lábios'),
  ('S02.5', 'Fratura de dente'),
  ('R51',   'Cefaleia'),
  ('Z01.2', 'Exame odontológico')
on conflict do nothing;

-- Anamnese SaaS — descrição opcional pra cada imagem da galeria do paciente
-- Rode uma vez no SQL Editor do Supabase, depois da 036.

alter table patient_images add column description text;

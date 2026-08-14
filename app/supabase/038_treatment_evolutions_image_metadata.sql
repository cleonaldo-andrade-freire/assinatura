-- Anamnese SaaS — nome original e descrição opcional de cada imagem de evolução
-- Rode uma vez no SQL Editor do Supabase, depois da 037.
--
-- A chave no Storage é um token aleatório (não o nome original), então sem
-- isso não dava pra saber qual miniatura era qual foto na hora de manter ou
-- remover uma imagem existente ao editar. Ambas as colunas ficam na mesma
-- posição/ordem de image_keys (uma entrada por imagem).

alter table treatment_evolutions add column image_names text[];
alter table treatment_evolutions add column image_descriptions text[];

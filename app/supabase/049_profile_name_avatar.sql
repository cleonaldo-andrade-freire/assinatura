-- Nome e foto do usuário logado (owner ou staff), mostrados na sidebar.
-- `profiles` até aqui só tinha e-mail — não dava pra identificar quem é
-- quem visualmente, só pelo endereço de e-mail cadastrado no convite.
alter table profiles add column name text;
alter table profiles add column avatar_url text;

-- Data de nascimento do paciente — nullable, cadastro existente continua
-- válido sem preencher. Usada pra calcular a idade exibida no grid
-- (calculada em runtime a partir daqui, não guardada em coluna própria).
alter table patients add column birth_date date;

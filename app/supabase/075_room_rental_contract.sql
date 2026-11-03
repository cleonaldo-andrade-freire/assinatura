-- Contrato da locação da sala: a clínica gera e envia (à mão, pelo
-- WhatsApp) um link com o contrato do turno; o locatário lê e assina com o
-- dedo ou o mouse. Rode uma vez no SQL Editor do Supabase, depois da 074.
--
-- Tudo na própria locação — um contrato por locação. Gerar de novo troca o
-- token (o link antigo para de funcionar) e congela os dados atuais.

alter table room_rentals
  add column contract_token     uuid unique,
  -- Dados congelados no momento do envio (partes, data, turno, valor) e o
  -- hash deles: a página mostra o snapshot, não a locação ao vivo, e a
  -- assinatura confere o hash do que o locatário leu.
  add column contract_snapshot  jsonb,
  add column contract_hash      text,
  add column contract_sent_at   timestamptz,
  add column contract_signed_at timestamptz,
  -- { dataUrl, strokeData, ip, userAgent } — PNG do traço + pontos brutos.
  add column contract_signature jsonb;

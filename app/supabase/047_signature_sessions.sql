-- Tabela para guardar estado da assinatura dividida (Deferred Signing)
CREATE TABLE IF NOT EXISTS public.signature_sessions (
    request_id UUID PRIMARY KEY,
    document_id UUID NOT NULL,
    clinic_id UUID NOT NULL,
    pdf_bytes_base64 TEXT NOT NULL,
    signer_certificate_pem TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes'
);

-- ADD COLUMN IF NOT EXISTS em vez de embutir no CREATE TABLE acima: se a
-- tabela já existia de uma rodada anterior deste arquivo (antes desta
-- coluna existir), CREATE TABLE IF NOT EXISTS não a criaria — o insert em
-- LocalAgentProvider.requestSignature falharia (coluna inexistente) e, como
-- silenciosamente não checava o erro, a sessão nunca era salva e o passo de
-- finalização quebrava com "Sessão de assinatura não encontrada".
--
-- Bytes DER (base64) exatos do SET de authenticatedAttributes que foram
-- hasheados e assinados pelo agente local — precisam ser reaproveitados bit
-- a bit ao completar a assinatura (ver LocalAgentDeferredSigner.ts), nunca
-- recalculados nesse momento.
ALTER TABLE public.signature_sessions ADD COLUMN IF NOT EXISTS auth_attrs_der_base64 TEXT;

-- Limpeza automática (opcional ou via cron, mas TTL cuida do lixo no nível de app)

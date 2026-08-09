# Guia de deploy — App SaaS (Fatia 1) no EasyPanel + Supabase

Este guia cobre publicar o app novo (`app/` neste repositório) no EasyPanel, usando o Supabase como banco de dados, autenticação e armazenamento de PDF. O app substitui os 3 webhooks do n8n para **clínicas novas** — a instância do n8n da Dra. Ewerjane continua rodando sem mudanças.

---

## 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto novo (região São Paulo/`sa-east-1`).
2. Em **Project Settings → API**, anote: `URL`, `anon public key`, `service_role key`.
3. Em **SQL Editor → New query**, rode nesta ordem: `app/supabase/schema.sql`, `app/supabase/002_add_clinic_logo.sql`, `app/supabase/003_add_whatsapp_number.sql`, `app/supabase/004_conversation_engine.sql`.
4. Em **Storage**, crie dois buckets: **`signed-pdfs`** (privado) e **`clinic-logos`** (público).

## 2. Criar o serviço do app no EasyPanel

1. **"+ Serviço"** → **App** (a partir de repositório Git).
2. Aponte pro seu repositório GitHub (`cleonaldo-andrade-freire/assinatura`), branch `main`.
3. **Build path / diretório raiz do build:** `app`.
4. Método de build: **Dockerfile** (já existe um `Dockerfile` em `app/Dockerfile`).
5. Porta exposta: `3000`.

## 3. Variáveis de ambiente

Na aba **Ambiente** do serviço do app:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

ADMIN_MASTER_KEY=<gere uma string aleatória longa>
ASAAS_API_KEY=<sua chave de API do Asaas>
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<gere outra string aleatória longa>

EVOLUTION_ADMIN_BASE_URL=https://evolution.suaempresa.com
EVOLUTION_ADMIN_API_KEY=<chave global/admin da sua Evolution API>

NEXT_PUBLIC_APP_URL=https://<seu-dominio-do-app>
```

> Comece com `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3` e uma chave sandbox pra testar o fluxo de cobrança inteiro sem mexer com dinheiro real, antes de trocar pra produção.

`EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY` são **globais** — o mesmo servidor Evolution API atende todas as clínicas, cada uma com sua própria instância dentro dele. É essa chave que permite o self-service de conexão do WhatsApp (passo 8).

Não precisa criar Postgres nem volume de disco no EasyPanel pra este app — o Supabase cuida do banco (já criado no passo 1) e do armazenamento dos PDFs.

## 4. Domínio

Na aba **Domínios**, configure o subdomínio público (ex.: `app.erodontologia.com.br` ou um domínio próprio do produto). Esse é o `NEXT_PUBLIC_APP_URL`.

## 5. Implantar

Clique em **Implantar**. Como as tabelas já foram criadas direto no Supabase (passo 1), não tem migration pra rodar no deploy — é só o build do Next.js subindo.

## 6. Configurar o webhook do Asaas

1. No painel do Asaas (sandbox ou produção), vá em **Integrações → Webhooks**.
2. URL: `https://<seu-dominio-do-app>/api/webhooks/asaas`
3. Eventos: pelo menos `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`.
4. Token de autenticação: o mesmo valor que você colocou em `ASAAS_WEBHOOK_TOKEN`.

## 7. Criar a primeira clínica de teste

Com o app no ar, use `/admin/login` → **"+ Nova clínica"** (ou o endpoint `POST /api/admin/clinics` via curl, protegido pela `ADMIN_MASTER_KEY`, se preferir script). Isso cria o usuário no Supabase Auth, o registro da clínica, e o cliente + assinatura no Asaas de uma vez.

## 8. Conectar o WhatsApp da clínica (self-service)

A própria clínica faz isso sozinha, sem você precisar mexer na Evolution API:

1. A clínica loga em `/dashboard` (e-mail/senha que você definiu ao criar) e vai em **WhatsApp**.
2. Clica em **"Conectar WhatsApp"** — o app cria a instância na Evolution API automaticamente e mostra um QR Code.
3. A clínica escaneia com o celular dela (WhatsApp → Aparelhos conectados → Conectar um aparelho).
4. Assim que conecta, o app já configura sozinho o webhook da instância apontando pro motor de conversa (`/api/webhooks/evolution/{instanceName}`) e pede pra confirmar o número.

Isso substitui o passo manual de criar instância + configurar webhook + preencher formulário que existia antes — agora é só o `EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY` do passo 3 que precisam estar certos.

**Instância da Dra. Ewerjane (Typebot, fluxo antigo):** essa continua manual, sem mudança — não passa por esse fluxo de self-service.

## 9. Cadastrar modelo de anamnese e testar

1. Em `/dashboard/templates`, a clínica cria pelo menos um modelo de perguntas.
2. Em `/dashboard/new`, dispara uma anamnese de teste pro próprio WhatsApp de quem estiver testando.
3. Confirma que a primeira pergunta chega, que responder avança pra próxima, e que ao final chega o link `/assinatura?token=...`.
4. Assina, confirma que o PDF fica disponível em `/dashboard` com status "Assinado", e que `/billing` mostra o status da assinatura (trial/em dia).

⚠️ **Ponto mais provável de precisar ajuste na primeira tentativa real**: o parsing do payload que a Evolution API manda quando o paciente responde (`lib/evolution.ts`, função `parseInboundMessage`). Foi implementado com base na documentação pública, mas não testado contra uma instância ao vivo — se uma resposta não fizer o app avançar a pergunta, veja os **Logs** do serviço do app no EasyPanel (o código loga os erros relevantes) pra confirmar o formato exato da sua versão.

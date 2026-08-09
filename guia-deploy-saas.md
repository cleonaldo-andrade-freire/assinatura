# Guia de deploy — App SaaS (Fatia 1) na Vercel + Supabase

Este guia cobre publicar o app novo (`app/` neste repositório) na Vercel, usando o Supabase como banco de dados, autenticação e armazenamento de PDF. O app substitui o Typebot/n8n para clínicas novas — cada clínica cadastra os próprios modelos de anamnese e conduz a conversa pelo motor próprio do app.

> Histórico: a primeira tentativa de deploy foi planejada pro EasyPanel (com Dockerfile). Migramos pra Vercel porque é a plataforma nativa do Next.js — sem precisar manter um servidor Node rodando 24/7, cada rota de API vira uma função serverless. O `Dockerfile` continua no repo caso um dia seja necessário rodar em outro lugar, mas não é o caminho usado hoje.

---

## 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto novo (região São Paulo/`sa-east-1`).
2. Em **Project Settings → API**, anote: `URL`, `anon public key`, `service_role key`.
3. Em **SQL Editor → New query**, rode nesta ordem: `app/supabase/schema.sql`, `app/supabase/002_add_clinic_logo.sql`, `app/supabase/003_add_whatsapp_number.sql`, `app/supabase/004_conversation_engine.sql`.
4. Em **Storage**, crie dois buckets: **`signed-pdfs`** (privado) e **`clinic-logos`** (público).

⚠️ Confirme que é **esse mesmo projeto** Supabase que o app em produção vai usar — rodar as migrations num projeto e apontar `NEXT_PUBLIC_SUPABASE_URL` de produção pra outro é um jeito garantido de tudo parecer quebrado sem erro nenhum.

## 2. Criar o projeto na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório GitHub `cleonaldo-andrade-freire/assinatura` (o mesmo repo do site principal — o app SaaS mora na subpasta `app/`).
2. **Root Directory:** clique em "Edit" e selecione `app`. Sem isso a Vercel tenta buildar a raiz do repo (que não é um projeto Next.js) e a build falha.
3. Nome do projeto: livre (ex.: `anamnese-saas`) — só define a URL `*.vercel.app` gerada automaticamente, não afeta nada mais.
4. Framework Preset deve virar **Next.js** sozinho assim que reconhecer o `package.json` dentro de `app/`.

## 3. Variáveis de ambiente

Na tela de criação do projeto (ou depois, em **Settings → Environment Variables**):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

ADMIN_MASTER_KEY=<gere uma string aleatória longa>
ASAAS_API_KEY=<sua chave de API do Asaas>
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=<gere outra string aleatória longa>

EVOLUTION_API_BASE_URL=https://evolution.suaempresa.com
EVOLUTION_ADMIN_BASE_URL=https://evolution.suaempresa.com
EVOLUTION_ADMIN_API_KEY=<chave global/admin da sua Evolution API>

NEXT_PUBLIC_APP_URL=https://<seu-domínio-do-app-na-vercel>
```

> Comece com `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3` e uma chave sandbox pra testar o fluxo de cobrança inteiro sem mexer com dinheiro real, antes de trocar pra produção.

⚠️ **Diferente do ambiente local:** se o valor de `ASAAS_API_KEY` no seu `.env` local está escrito com barra invertida antes do `$` (`\$aact_...`) — ajuste feito pra contornar um bug do loader `@next/env` lendo arquivo `.env` —, **na Vercel cole sem essa barra** (`$aact_...` puro). A Vercel injeta a variável direto no processo, sem o processamento que causava aquele bug; colar com a barra faria o valor ficar errado (com uma barra invertida literal dentro).

`EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY` são **globais** — o mesmo servidor Evolution API atende todas as clínicas, cada uma com sua própria instância dentro dele. É essa chave que permite o self-service de conexão do WhatsApp (passo 6).

## 4. Deploy

Clique em **Deploy**. Como as tabelas já foram criadas direto no Supabase (passo 1), não tem migration pra rodar no deploy — é só o build do Next.js subindo. A cada `git push` na branch `main`, a Vercel faz redeploy automático.

## 5. Domínio

Em **Settings → Domains** do projeto, adicione o subdomínio escolhido (ex.: `anamnese.erodontologia.com.br`). Se o domínio raiz já estiver verificado na sua conta Vercel (por outro projeto, como a landing page), o subdomínio novo costuma ser reconhecido automaticamente; senão, a Vercel mostra o registro CNAME exato pra criar onde o DNS do domínio estiver hospedado.

Depois de o domínio ficar ativo, atualize `NEXT_PUBLIC_APP_URL` pra usar esse domínio (em vez do `*.vercel.app`) e faça um redeploy (Settings → Environment Variables → salvar já dispara um novo build).

## 6. Configurar o webhook do Asaas

1. No painel do Asaas (sandbox ou produção), vá em **Integrações → Webhooks**.
2. URL: `https://<seu-domínio-do-app>/api/webhooks/asaas`
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

⚠️ **Isso só roda no momento de conectar/escanear o QR.** Se você trocar `NEXT_PUBLIC_APP_URL` depois (por exemplo: mudou de domínio, ou de `*.vercel.app` pro domínio final) numa clínica que **já estava conectada**, o webhook antigo continua registrado na Evolution até alguém reconectar. Não existe hoje um botão "só atualizar o webhook" sem desconectar — se isso acontecer, a forma mais simples de corrigir é chamar direto `setInstanceWebhook` (em `lib/evolutionAdmin.ts`) com a URL nova, ou desconectar e reconectar o WhatsApp pelo painel.

## 9. Cadastrar modelo de anamnese e testar

1. Em `/dashboard/templates`, a clínica cria pelo menos um modelo de perguntas.
2. Em `/dashboard/new`, dispara uma anamnese de teste pro próprio WhatsApp de quem estiver testando.
3. Confirma que a primeira pergunta chega, que responder avança pra próxima, e que ao final chega o link `/assinatura?token=...`.
4. Assina, confirma que o PDF fica disponível em `/dashboard` com status "Assinado", e que `/billing` mostra o status da assinatura (trial/em dia).
5. Se uma anamnese ficar travada no meio (paciente não respondeu, ou algo deu errado), dá pra cancelar direto na seção "Em andamento" do `/dashboard` — isso não apaga o histórico, só marca como abandonada e libera o telefone pra uma anamnese nova.

**Ponto de atenção confirmado em produção:** o payload que a Evolution API espera em `POST /webhook/set/{instance}` é **aninhado** — `{"webhook": {"enabled": true, "url": ..., "events": [...]}}` — não achatado como algumas versões da documentação sugerem. O código em `lib/evolutionAdmin.ts` já usa o formato aninhado (corrigido depois de testar contra uma instância real). Se você estiver numa versão diferente da Evolution API e o `/instance/connect` retornar 400 reclamando de `"instance requires property webhook"` ou o inverso, é esse o primeiro lugar a olhar.

Pra depurar uma resposta que não avança a conversa: veja os **Logs** do projeto na Vercel (Deployments → seu deploy → Functions/Logs) — a rota `/api/webhooks/evolution/[instanceName]` loga em qual ponto cada mensagem foi ignorada (payload não reconhecido, clínica não encontrada, ou nenhuma conversa ativa pro número).

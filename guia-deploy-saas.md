# Guia de deploy — App SaaS (Fatia 1) na Vercel + Supabase

Este guia cobre publicar o app novo (`app/` neste repositório) na Vercel, usando o Supabase como banco de dados, autenticação e armazenamento de PDF. O app substitui o Typebot/n8n para clínicas novas — cada clínica cadastra os próprios modelos de anamnese e conduz a conversa pelo motor próprio do app. Hoje o produto já vai muito além da anamnese: agenda com confirmação e lembrete automático via WhatsApp (redução de falta), atestados e prescrições com assinatura digital, orçamentos, tratamentos/evoluções, financeiro do paciente, despesas da clínica e pedidos de prótese — um consultório odontológico inteiro sem papel, operado pelo WhatsApp.

> Histórico: a primeira tentativa de deploy foi planejada pro EasyPanel (com Dockerfile). Migramos pra Vercel porque é a plataforma nativa do Next.js — sem precisar manter um servidor Node rodando 24/7, cada rota de API vira uma função serverless. O `Dockerfile` continua no repo caso um dia seja necessário rodar em outro lugar, mas não é o caminho usado hoje.

---

## 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie um projeto novo (região São Paulo/`sa-east-1`).
2. Em **Project Settings → API**, anote: `URL`, `anon public key`, `service_role key`.
3. Em **SQL Editor → New query**, rode `app/supabase/schema.sql` e, na sequência, todos os demais `app/supabase/NNN_*.sql` **em ordem numérica** (002, 003, 004... até o último arquivo da pasta) — a lista de migrations só cresce, então confie na numeração dos nomes em vez de uma lista fixa aqui.
4. Em **Storage**, crie os buckets (todos privados, exceto `clinic-logos` e `profile-avatars`, que são públicos): `signed-pdfs`, `clinic-logos`, `profile-avatars`, `certificate-pdfs`, `prescription-pdfs`, `patient-photos`, `patient-images`, `treatment-evolution-images`, `budget-pdfs`, `receipt-pdfs`, `expense-receipts`. Ver `app/README.md` pra que serve cada um.

⚠️ Confirme que é **esse mesmo projeto** Supabase que o app em produção vai usar — rodar as migrations num projeto e apontar `NEXT_PUBLIC_SUPABASE_URL` de produção pra outro é um jeito garantido de tudo parecer quebrado sem erro nenhum.

## 2. Criar o projeto na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório GitHub `cleonaldo-andrade-freire/assinatura` (o mesmo repo do site principal — o app SaaS mora na subpasta `app/`).
2. **Root Directory:** clique em "Edit" e selecione `app`. Sem isso a Vercel tenta buildar a raiz do repo (que não é um projeto Next.js) e a build falha.
3. Nome do projeto: livre (ex.: `anamnese-saas`) — só define a URL `*.vercel.app` gerada automaticamente, não afeta nada mais.
4. Framework Preset deve virar **Next.js** sozinho assim que reconhecer o `package.json` dentro de `app/`.

⚠️ **Região da função serverless.** `app/vercel.json` fixa `"regions": ["gru1"]` (São Paulo) de propósito — o Supabase do projeto roda perto do Brasil, e a região padrão da Vercel (`iad1`, EUA) já causou um caso real em produção onde qualquer `fetch` do servidor pro Supabase (login incluso) levava **~100 segundos** pra completar, travando login/qualquer ação que dependesse de rede, sem erro nenhum aparecer (só timeout do lado do cliente). Não remova esse campo do `vercel.json` nem mude a região sem confirmar que a nova região tem uma rota de rede boa até o projeto Supabase.

## 3. Variáveis de ambiente

Lista completa e comentada em `app/.env.example` — copie de lá. Resumo do essencial pra subir o app (Certisign/PSC só entram se for usar assinatura real de atestado/prescrição — ver `app/README.md`):

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

SIGNATURE_PROVIDER=mock
NEXT_PUBLIC_SIGNATURE_PROVIDER=mock

CRON_SECRET=<gere outra string aleatória longa>
NEXT_PUBLIC_APP_URL=https://<seu-domínio-do-app-na-vercel>

ANTHROPIC_API_KEY=<chave da API da Anthropic — ver platform.claude.com>
```

> Comece com `ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3` e uma chave sandbox pra testar o fluxo de cobrança inteiro sem mexer com dinheiro real, antes de trocar pra produção.
>
> `SIGNATURE_PROVIDER=mock` simula a assinatura (sem validade jurídica) — é o suficiente pra subir e testar o app. Trocar pra `certisign`, `psc` ou `local_agent` exige as variáveis extras correspondentes (`CERTISIGN_*`, `PSC_*` — ver `app/.env.example`) e é um passo separado, não bloqueia esse deploy inicial.
>
> `ANTHROPIC_API_KEY` alimenta o agente de triagem de leads no WhatsApp (`/dashboard/leads`, ver `app/README.md` seção "Mini-CRM de leads") — sem ela, mensagens de números sem anamnese/agendamento em andamento simplesmente não recebem resposta do bot (best-effort, não derruba o webhook). Não bloqueia o deploy inicial, mas sem essa chave o Mini-CRM não funciona.

⚠️ **Diferente do ambiente local:** se o valor de `ASAAS_API_KEY` no seu `.env` local está escrito com barra invertida antes do `$` (`\$aact_...`) — ajuste feito pra contornar um bug do loader `@next/env` lendo arquivo `.env` —, **na Vercel cole sem essa barra** (`$aact_...` puro). A Vercel injeta a variável direto no processo, sem o processamento que causava aquele bug; colar com a barra faria o valor ficar errado (com uma barra invertida literal dentro).

`EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY` são **globais** — o mesmo servidor Evolution API atende todas as clínicas, cada uma com sua própria instância dentro dele. É essa chave que permite o self-service de conexão do WhatsApp (passo 6).

## 4. Deploy

Clique em **Deploy**. Como as tabelas já foram criadas direto no Supabase (passo 1), não tem migration pra rodar no deploy — é só o build do Next.js subindo. A cada `git push` na branch `main`, a Vercel faz redeploy automático.

⚠️ **Cron jobs — plano Hobby só permite 1x/dia por cron.** `app/vercel.json` define os crons do projeto (hoje: `generate-recurring-expenses` e `check-signatures`, ambos 1x/dia). Se algum cron for configurado com frequência maior nesse arquivo (ex.: a cada 30min) **num projeto no plano Hobby**, a Vercel rejeita o deploy inteiro na hora de publicar — silenciosamente, sem aparecer um erro óbvio na tela, só "build failed"/deploy não completa. Antes de adicionar ou apertar a frequência de um cron, confirme o plano do projeto (Settings → Billing) ou vai ter que investigar do zero por que o deploy parou de funcionar.

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
2. Em `/dashboard/anamneses`, clica em "+ Nova anamnese" e dispara uma anamnese de teste pro próprio WhatsApp de quem estiver testando.
3. Confirma que a primeira pergunta chega, que responder avança pra próxima, e que ao final chega o link `/assinatura?token=...`.
4. Assina, confirma que o PDF fica disponível em `/dashboard` com status "Assinado", e que `/billing` mostra o status da assinatura (trial/em dia). Clicar no paciente na lista abre `/dashboard/anamneses/[id]` com a trilha de auditoria (hash, IP, dispositivo, horário).
5. Se uma anamnese ficar travada no meio (paciente não respondeu, ou algo deu errado), dá pra cancelar direto na seção "Em andamento" do `/dashboard` (não apaga o histórico, marca como abandonada) — ou "Reenviar pergunta"/"Retomar" em vez de cancelar, se só precisar dar um empurrão.
6. **Trial cobre só 3 anamneses** (vitalício, não é por mês) — na 4ª tentativa o painel bloqueia com um aviso e link pra assinar. Pra estender o trial ou dar um preço customizado numa clínica específica, use "Ajustes de cobrança" na tela dela em `/admin/clinics/[id]`.
7. No celular, teste instalar como app: Safari/Chrome → "Adicionar à Tela de Início". Deve abrir sem barra de endereço (modo standalone). Se instalou antes dessas mudanças, apague o atalho antigo e adicione de novo — o iOS só lê a configuração no momento da instalação.

**Ponto de atenção confirmado em produção:** o payload que a Evolution API espera em `POST /webhook/set/{instance}` é **aninhado** — `{"webhook": {"enabled": true, "url": ..., "events": [...]}}` — não achatado como algumas versões da documentação sugerem. O código em `lib/evolutionAdmin.ts` já usa o formato aninhado (corrigido depois de testar contra uma instância real). Se você estiver numa versão diferente da Evolution API e o `/instance/connect` retornar 400 reclamando de `"instance requires property webhook"` ou o inverso, é esse o primeiro lugar a olhar.

Pra depurar uma resposta que não avança a conversa: veja os **Logs** do projeto na Vercel (Deployments → seu deploy → Functions/Logs) — a rota `/api/webhooks/evolution/[instanceName]` loga em qual ponto cada mensagem foi ignorada (payload não reconhecido, clínica não encontrada, ou nenhuma conversa ativa pro número).

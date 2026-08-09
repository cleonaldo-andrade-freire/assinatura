# Anamnese SaaS — app

Painel multi-clínica + API que substitui os webhooks do n8n para clínicas novas. Banco de dados, autenticação e armazenamento de PDF rodam no Supabase (via `supabase-js`, sem ORM). Veja `../guia-deploy-saas.md` na raiz do repositório para o passo a passo de deploy em produção (EasyPanel).

## Configurando o Supabase (uma vez)

1. Crie uma conta e um projeto grátis em [supabase.com](https://supabase.com).
2. Em **Project Settings → API**, copie a `URL`, a `anon public key` e a `service_role key`.
3. Em **SQL Editor → New query**, cole o conteúdo de `supabase/schema.sql` e clique em **Run** — isso cria as tabelas, os enums e as políticas de Row Level Security. Depois, rode também `supabase/002_add_clinic_logo.sql` e `supabase/003_add_whatsapp_number.sql`.
4. Em **Storage**, crie dois buckets:
   - `signed-pdfs` — **privado** (PDFs assinados)
   - `clinic-logos` — **público** (logo de cada clínica, usado na página de assinatura e no PDF)
5. Preencha essas informações no `.env` (veja `.env.example`).

Não precisa de Postgres/Docker local — dá pra desenvolver direto contra o projeto Supabase (inclusive o gratuito).

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha com os dados do seu projeto Supabase
npm run db:seed            # cria uma clínica de teste (login: demo@clinica.com / teste1234)
npm run dev                # http://localhost:3000
```

O seed imprime no terminal o `clinicId` e o `apiKey` da clínica de teste — é isso que você usaria no lugar de `X-Api-Key` para simular uma chamada do Typebot:

```bash
curl -X POST http://localhost:3000/api/clinics/<clinicId>/anamnesis \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: <apiKey>" \
  -d '{"patient_name":"Paciente Teste","patient_cpf":"000.000.000-00","answers":[{"question":"Fuma?","answer":"Não"}]}'
```

A resposta traz um `token` — abra `http://localhost:3000/assinatura?token=<token>` no navegador para testar o fluxo de assinatura de ponta a ponta.

## Como o acesso aos dados funciona

- **Rotas chamadas por Typebot/Asaas/paciente** (`/api/clinics/.../anamnesis`, `/api/anamnesis/...`, `/api/webhooks/asaas`) usam a `service_role key`, que ignora Row Level Security — porque quem chama essas rotas nunca tem uma sessão de usuário logado. A validação (API key da clínica, token da anamnese, token do webhook do Asaas) é feita no código de cada rota.
- **Painel** (`/dashboard`, `/billing`) usa o cliente com a sessão do usuário logado — as políticas de RLS em `supabase/schema.sql` garantem que cada clínica só enxerga os próprios dados, mesmo que uma rota esqueça de filtrar por `clinic_id`.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` / `npm start` — build e start de produção
- `npm test` — testes unitários (Vitest)
- `npm run typecheck` — checagem de tipos
- `npm run db:seed` — cria a clínica de teste

## Duas formas de uma clínica funcionar

1. **Motor de conversa próprio (padrão pra clínicas novas)**: a clínica cadastra os modelos de anamnese em `/dashboard/templates` e conecta o próprio WhatsApp sozinha em `/dashboard/whatsapp` (QR Code, self-service — usa `EVOLUTION_ADMIN_BASE_URL`/`EVOLUTION_ADMIN_API_KEY`). Sem Typebot.
2. **Typebot (fluxo legado, só a instância da Dra. Ewerjane)**: uma instância do Typebot montada manualmente, com o bloco de Webhook final chamando `POST /api/clinics/{clinicId}/anamnesis` com o header `X-Api-Key`. Continua funcionando sem mudanças, mas não é o caminho recomendado pra clínicas novas.

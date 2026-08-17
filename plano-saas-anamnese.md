# Plano de transformação — Anamnese & Assinatura via WhatsApp em SaaS

Hoje a stack (Evolution API + n8n + Typebot + `assinatura.html`) resolve isso para uma clínica de cada vez, configurada à mão (primeira instância em produção: Dra. Ewerjane). Este documento descreve o caminho técnico e comercial até um SaaS multi-clínica com cobrança recorrente.

---

## 1. Diagnóstico

O núcleo funcional já está validado, inclusive em produção. O que falta é o que separa "uma automação que funciona" de "um produto que se vende sozinho".

**Já existe:**
- Fluxo completo: WhatsApp → Typebot → PDF → assinatura → e-mail
- Gatilho por palavra-chave testado (Evolution API, trigger "anamnese", "Listening from me" ativado)
- Assinatura eletrônica simples com trilha de auditoria (hash SHA-256, IP, timestamp)
- Página de assinatura hospedável como arquivo estático

**Falta para virar produto:**
- Isolamento de dados por clínica (hoje é pasta de arquivo por token, ver `guia-implementacao.md`)
- Onboarding sem você mexer em n8n/Evolution API a cada cliente novo
- Cobrança recorrente e controle de acesso por assinatura
- Postura de LGPD como operador de várias clínicas, não de uma só

---

## 2. Fases

Sequência pensada para validar demanda antes de investir pesado em engenharia — a Fase 0 usa a base de leads que já existe (grupos de médicos e nutricionistas em Aracaju) antes de qualquer linha de código nova.

### Fase 0 — Validar preço e demanda (1–2 semanas)
Confirmar que clínicas fora da Dra. Ewerjane pagariam por isso, antes de generalizar a arquitetura.
- Oferecer a 3–5 contatos dos grupos "Médicos Aracaju" e "Leads nutricionistas" a versão atual, configurada manualmente
- Cobrar algo desde esse piloto — grátis desvaloriza o teste de preço
- Definir o pacote de perguntas padrão por especialidade (odonto, nutrição, estética)

### Fase 1 — Fundação multi-tenant (4–6 semanas)
Trocar "uma pasta de arquivos por clínica" por uma base de dados real, e um workflow do n8n que atenda todas as clínicas em vez de um por cliente.
- Postgres substituindo os JSONs em disco, com `clinic_id` em cada tabela
- Um único workflow n8n parametrizado por `clinic_id` no path do webhook, em vez de um workflow duplicado por clínica
- `assinatura.html` passa a carregar nome/logo da clínica dinamicamente pelo token, em vez de hardcoded

### Fase 2 — Onboarding self-service (3–4 semanas)
Uma clínica nova consegue se cadastrar e conectar o próprio WhatsApp sem intervenção manual.
- Painel simples: cadastro da clínica, QR Code de conexão do WhatsApp embutido na tela
- Editor de perguntas da anamnese (adicionar/remover/reordenar sem depender do desenvolvedor)
- Provisionamento automático da instância Evolution API + config do Typebot ao finalizar o cadastro

### Fase 3 — Cobrança recorrente (1–2 semanas)
Transformar clínicas testando de graça em assinantes.
- Integração com gateway nacional (ver seção 5 — Asaas)
- Trial de 14 dias, bloqueio automático de acesso em caso de inadimplência (ver seção 6)

### Fase 4 — Beta pago fechado (4 semanas)
5–10 clínicas reais, pagando, fora do ciclo de desenvolvimento direto — testa o onboarding sem suporte manual.
- Recrutar via os mesmos grupos de leads já validados na Fase 0
- Medir onde o onboarding trava sem ajuda manual

### Fase 5 — Lançamento e crescimento (contínuo)
Sair do piloto fechado para aquisição ativa.
- Indicação entre clínicas (quem já usa costuma conhecer outros donos de clínica)
- Expandir templates de perguntas para novas especialidades conforme a demanda aparecer

---

## 3. O que muda na arquitetura

| Camada | Hoje | Como SaaS |
|---|---|---|
| Armazenamento | Arquivo JSON por token, em disco | Postgres, isolado por `clinic_id` |
| Instância WhatsApp | 1 instância Evolution API por clínica, criada à mão | Provisionamento automático no cadastro |
| Perguntas da anamnese | Blocos fixos montados manualmente no Typebot | Editor no painel, template por especialidade |
| Página de assinatura | Nome da clínica fixo no código-fonte | Carregado dinamicamente pelo token |
| Cobrança | Inexistente | Recorrente automatizada (Pix/boleto/cartão) |
| Acesso | Nenhum login — operação manual | Conta por clínica, painel próprio |

---

## 4. Precificação sugerida

Posicionado como economia de tempo de recepção, não como "software jurídico obrigatório" — a assinatura é simples (MP 2.200-2/2001), não certificado ICP-Brasil.

| Plano | Preço | Inclui |
|---|---|---|
| Starter | R$ 147/mês | Até 40 anamneses/mês, 1 número de WhatsApp, modelo de perguntas padrão |
| Pro | R$ 297/mês | Até 150 anamneses/mês, perguntas personalizáveis, múltiplos usuários na recepção |
| Clínica+ | Sob consulta | Múltiplas unidades/números, suporte prioritário, relatórios de uso |

Enquanto o onboarding ainda for manual (antes da Fase 2): cobrar uma taxa de setup única de R$ 300–500 para cobrir a configuração direta no n8n/Evolution API.

---

## 5. Hub de pagamento: Asaas vs. Stripe

Comparativo de custo efetivo para uma cobrança de **R$ 1.000,00** (taxas padrão, pós-período promocional):

| Modalidade | Asaas | Stripe |
|---|---|---|
| Pix | R$ 1,99 fixo → recebe R$ 998,01 | 1,19% → recebe R$ 988,10 (*só por convite no Brasil*) |
| Boleto | R$ 1,99 fixo → recebe R$ 998,01 | R$ 3,45 fixo → recebe R$ 996,55 |
| Cartão de crédito (à vista/assinatura) | 2,99% + R$ 0,49 → recebe R$ 969,61 | 3,99% + R$ 0,39 → recebe R$ 959,71 |
| Cartão internacional | mesma taxa acima | +2% adicional → recebe ~R$ 939,71 |

Visa e Mastercard pagam a mesma taxa nas duas plataformas — o que muda o custo é nacional vs. internacional e à vista vs. parcelado, não a bandeira.

**Recomendação: Asaas.** Mais barato em todas as modalidades, já com Pix liberado (Stripe Brasil está com Pix só por convite no momento), período promocional de 3 meses com taxas ainda menores, e webhooks de cobrança fáceis de plugar direto no n8n (mesmo padrão já usado nos outros webhooks do projeto).

---

## 6. Controle de acesso e inadimplência

**O que a Asaas já resolve sozinha:** notificação automática ao cliente (e-mail/SMS/WhatsApp configurável) antes e depois do vencimento da cobrança.

**O que precisa ser construído:** bloqueio de uso da aplicação — a Asaas não sabe nada sobre o seu sistema.

Fluxo recomendado, reaproveitando a stack atual (n8n + Postgres):

1. Assinatura recorrente criada no Asaas por clínica (`customer_id` vinculado ao `clinic_id`)
2. Webhook no Asaas apontando para o n8n, assinando os eventos `PAYMENT_OVERDUE` e `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`
3. n8n atualiza um campo `status` (`active` / `overdue` / `blocked`) na tabela `clinics`
4. O fluxo que recebe a palavra-gatilho "anamnese" da Evolution API consulta esse `status` antes de acionar o Typebot; se não for `active`, não dispara

**Carência antes de bloquear:** não bloquear no exato momento do `PAYMENT_OVERDUE` (pode ser atraso de compensação bancária). Marcar como `overdue` imediatamente, mas só mudar para `blocked` via job diário que verifica quem está vencido há mais de 3–5 dias.

**O que "bloquear" deve significar:**
- Desligar o gatilho "anamnese" para aquela clínica
- Bloquear login no painel de configuração
- **Nunca apagar** anamneses e PDFs já assinados — dado de saúde, com obrigação de retenção por LGPD independente de inadimplência

**Extra:** ao mudar o status para `overdue`/`blocked`, aproveitar a mesma Evolution API para notificar automaticamente o número da própria clínica (não do paciente) sobre a pendência — reforça o aviso do Asaas.

---

## 7. LGPD e riscos operacionais

- Como SaaS multi-clínica, o papel muda para **operador** de dado sensível de saúde de todas as clínicas — precisa de contrato de tratamento de dados e política de retenção clara por clínica.
- Evolution API usa conexão não oficial do WhatsApp (estilo Baileys) — risco real de banimento de número em escala. Avaliar migração para a Cloud API oficial do WhatsApp Business conforme o número de clínicas crescer.
- Isolamento de dados entre clínicas precisa ser garantido no banco (não só na aplicação) desde a Fase 1 — vazamento cruzado entre clínicas é o pior cenário possível nesse nicho.

---

## 8. Próximo passo imediato

Antes de escrever qualquer código de multi-tenant: rodar a Fase 0. Oferecer a versão atual (configurada manualmente, como foi feito para a Dra. Ewerjane) a 3–5 contatos dos grupos de médicos e nutricionistas em Aracaju, cobrando algo desde o primeiro dia. Isso responde à pergunta mais cara do plano — se existe demanda real fora de um único cliente — antes de investir semanas em arquitetura.

---

*Rascunho de trabalho, não um documento final. Versão web (design) disponível em: https://claude.ai/code/artifact/aa37d09b-570d-49b2-aeea-17d6e405ba30*

---

## 9. Atualização — 2026-08-16: o produto passou da anamnese

Este plano foi escrito quando o único produto era "anamnese + assinatura via WhatsApp". Isso mudou — vale reler o diagnóstico das seções 1–3 com essa lente:

**Já entregue (itens que a seção 1 listava como "falta para virar produto"):**
- Isolamento de dados por clínica: feito, Postgres/Supabase com RLS por `clinic_id` (não mais pasta de arquivo por token).
- Onboarding sem mexer em n8n/Evolution API por cliente: feito — clínica nova conecta o próprio WhatsApp sozinha via QR Code (`/dashboard/whatsapp`), sem intervenção manual.
- Cobrança recorrente e controle de acesso por assinatura: feito — integração Asaas completa (trial, troca de plano self-service, excedente cobrado automaticamente, bloqueio real só no trial).

**Escopo do produto, hoje, bem além da anamnese** — um consultório odontológico inteiro, sem papel, operado pelo WhatsApp:
- **Agenda com confirmação e lembrete automático via WhatsApp** — reduz falta: paciente recebe link de confirmação ao agendar, mais lembrete no dia anterior e no mesmo dia (se ainda não confirmou); pode confirmar/cancelar tocando no link ou respondendo em texto livre. *(Importante para qualquer material de venda: a marcação de "faltou" em si ainda é manual pela recepção — o que é automático é o lembrete/confirmação que reduz a chance de esquecimento, não uma detecção automática de falta.)*
- **Atestados e prescrições** com modelos próprios, busca de medicamentos/CID-10, envio do PDF assinado por WhatsApp, e verificação pública de autenticidade (`/validar`). Assinatura com certificado ICP-Brasil real (Certisign) está implementada mas **pausada, sem ter rodado em produção** (bloqueio de conta/API do lado da Certisign, ver memória do projeto) — hoje roda em modo mock; não anunciar "assinatura digital ICP-Brasil" como ativa até isso ser validado.
- **Orçamentos** a partir de tabela de preços, com envio por WhatsApp e aprovação que já gera o tratamento correspondente.
- **Tratamentos e evoluções clínicas** (com fotos/imagens) — substitui o prontuário de papel.
- **Financeiro do paciente** (débitos, pagamentos parciais, recibo em PDF enviado por WhatsApp) e **despesas da clínica** (inclusive recorrentes, geradas automaticamente).
- **Próteses**: kanban de 5 etapas com o paciente avisado por WhatsApp a cada mudança de etapa.
- **Ficha única do paciente** reunindo tudo isso (agendamentos, orçamentos, tratamentos, débitos, imagens, anamneses, atestados, prescrições) numa só tela.

**O que fica obsoleto neste documento:** a seção 4 (planos por "anamneses/mês") não reflete mais o produto — hoje a tabela `plans` no banco ainda cobra assim (herança do desenho original, ver `supabase/008_plans_table.sql`), mas isso já não captura o valor real entregue. Repricing sugerido tratado separadamente (conversa de 2026-08-16 sobre landing page + planos) — não duplicar aqui; ao revisar preço, checar o estado atual em `src/app/page.tsx`/tabela `plans` em vez de usar a tabela da seção 4 como referência.

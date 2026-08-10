import type { BillingCycle, PlanRecord } from "@/lib/database.types";
import { planValueFor } from "@/lib/plans";

/** Valor cobrado por anamnese além do limite do plano, igual pra todos os planos. */
export const OVERAGE_PRICE = 1.9;

function baseUrl(): string {
  return process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3";
}

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não configurado");
  return key;
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Asaas ${path} respondeu ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
}

export async function createAsaasCustomer(input: {
  name: string;
  cpfCnpj?: string;
  email?: string;
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  status: string;
  nextDueDate: string;
}

export function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, formato esperado pelo Asaas
}

/**
 * O trial não tem mais prazo em dias — só termina quando a clínica usa as
 * `TRIAL_ANAMNESIS_LIMIT` anamneses grátis (ver lib/billing.ts) ou escolhe um
 * plano antes disso. Por isso a assinatura no Asaas só é criada nesse momento
 * (`nextDueDate` = hoje por padrão, cobrança imediata), não no cadastro da
 * clínica — sem `nextDueDate` não teria como criar a assinatura (campo
 * obrigatório do Asaas), mas nada agenda uma cobrança automática enquanto a
 * clínica ainda não escolheu nada.
 */
export async function createAsaasSubscription(input: {
  customerId: string;
  plan: PlanRecord;
  cycle: BillingCycle;
  description: string;
  nextDueDate?: string;
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "UNDEFINED",
      cycle: input.cycle === "yearly" ? "YEARLY" : "MONTHLY",
      value: planValueFor(input.plan, input.cycle),
      description: input.description,
      nextDueDate: input.nextDueDate ?? addDays(new Date(), 0),
    }),
  });
}

/**
 * Eventos que efetivamente mudam o acesso da clínica. O Asaas manda vários
 * outros tipos de evento (estorno, exclusão, etc.) que ignoramos por enquanto.
 */
export const ASAAS_ACTIVATING_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
export const ASAAS_OVERDUE_EVENTS = new Set(["PAYMENT_OVERDUE"]);

export interface AsaasWebhookPayload {
  event: string;
  payment?: {
    subscription?: string;
    customer?: string;
  };
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido",
  CONFIRMED: "Confirmado",
  OVERDUE: "Em atraso",
  REFUNDED: "Estornado",
};

export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  invoiceUrl: string;
  dueDate: string;
  paymentDate: string | null;
}

/** Busca a cobrança mais recente e ainda não paga de uma assinatura, se houver. */
export async function getPendingInvoice(subscriptionId: string): Promise<AsaasPayment | null> {
  const result = await asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&status=PENDING&limit=1`
  );
  return result.data[0] ?? null;
}

/** Atualiza valor/descrição de uma cobrança ainda pendente (não paga) — usado pra somar o excedente de anamneses direto na fatura da assinatura, em vez de criar uma cobrança avulsa separada. */
export async function updateAsaasPaymentValue(input: {
  paymentId: string;
  value: number;
  description: string;
}): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(input.paymentId)}`, {
    method: "PUT",
    body: JSON.stringify({ value: input.value, description: input.description }),
  });
}

/** Últimas cobranças (pagas ou não) de uma assinatura — pra tela de admin. */
export async function listPayments(subscriptionId: string, limit = 10): Promise<AsaasPayment[]> {
  const result = await asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&limit=${limit}`
  );
  return result.data;
}

/** Link direto pro cliente no painel do Asaas (detecta sandbox vs produção pela ASAAS_BASE_URL). */
export function asaasCustomerDashboardUrl(customerId: string): string {
  const isSandbox = baseUrl().includes("sandbox");
  const host = isSandbox ? "sandbox.asaas.com" : "www.asaas.com";
  return `https://${host}/customer/show/${customerId}`;
}

export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  await asaasFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

/**
 * Atualiza campos soltos de uma assinatura existente (valor, ciclo, próxima data
 * de vencimento) — base pra troca de plano self-service, desconto e extensão de
 * trial do admin. `nextDueDate` no formato YYYY-MM-DD.
 */
export async function updateAsaasSubscriptionFields(input: {
  subscriptionId: string;
  value?: number;
  cycle?: BillingCycle;
  nextDueDate?: string;
}): Promise<AsaasSubscription> {
  const body: Record<string, unknown> = {};
  if (input.value !== undefined) body.value = input.value;
  if (input.cycle) body.cycle = input.cycle === "yearly" ? "YEARLY" : "MONTHLY";
  if (input.nextDueDate) body.nextDueDate = input.nextDueDate;

  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Muda o valor (e opcionalmente o ciclo) de uma assinatura existente — vale a partir da próxima cobrança, sem prorateio. */
export async function updateAsaasSubscription(input: {
  subscriptionId: string;
  plan: PlanRecord;
  cycle: BillingCycle;
}): Promise<AsaasSubscription> {
  return updateAsaasSubscriptionFields({
    subscriptionId: input.subscriptionId,
    value: planValueFor(input.plan, input.cycle),
    cycle: input.cycle,
  });
}

export interface AsaasCharge {
  id: string;
  invoiceUrl: string;
}

/** Cobrança avulsa (não-recorrente), usada pro excedente de anamneses do mês. */
export async function createAsaasCharge(input: {
  customerId: string;
  value: number;
  description: string;
}): Promise<AsaasCharge> {
  return asaasFetch<AsaasCharge>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "UNDEFINED",
      value: input.value,
      dueDate: addDays(new Date(), 3),
      description: input.description,
    }),
  });
}

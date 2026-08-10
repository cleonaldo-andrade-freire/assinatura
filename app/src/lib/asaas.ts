import type { BillingCycle, Plan } from "@/lib/database.types";

/** Preço mensal de cada plano, em reais. Anual cobra 10x o valor mensal (2 meses de desconto). */
export const PLAN_MONTHLY_PRICE: Record<Plan, number> = {
  starter: 39.9,
  basic: 59.9,
  standard: 79.9,
  plus: 99.9,
  pro: 129.9,
  enterprise: 199.0,
};

/** Nome exibido de cada plano nas telas de admin/clínica. */
export const PLAN_LABEL: Record<Plan, string> = {
  starter: "Starter",
  basic: "Basic",
  standard: "Standard",
  plus: "Plus",
  pro: "Pro",
  enterprise: "Enterprise",
};

/** Quantas anamneses o plano cobre por mês antes de virar cobrança avulsa. */
export const PLAN_MONTHLY_LIMIT: Record<Plan, number> = {
  starter: 20,
  basic: 40,
  standard: 60,
  plus: 80,
  pro: 120,
  enterprise: 20,
};

/** Valor cobrado por anamnese além do limite do plano, igual pra todos os planos. */
export const OVERAGE_PRICE = 1.9;

export function planValueFor(plan: Plan, cycle: BillingCycle): number {
  const monthly = PLAN_MONTHLY_PRICE[plan];
  return cycle === "yearly" ? monthly * 10 : monthly;
}

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

/** Dias de trial gratuito antes da primeira cobrança real. */
export const TRIAL_DAYS = 14;

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, formato esperado pelo Asaas
}

export async function createAsaasSubscription(input: {
  customerId: string;
  plan: Plan;
  cycle: BillingCycle;
  description: string;
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "UNDEFINED",
      cycle: input.cycle === "yearly" ? "YEARLY" : "MONTHLY",
      value: planValueFor(input.plan, input.cycle),
      description: input.description,
      // Primeira cobrança só depois do trial — implementa o período de graça
      // usando o próprio agendamento do Asaas, sem precisar de job/cron nosso.
      nextDueDate: addDays(new Date(), TRIAL_DAYS),
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

/** Muda o valor (e opcionalmente o ciclo) de uma assinatura existente — vale a partir da próxima cobrança, sem prorateio. */
export async function updateAsaasSubscription(input: {
  subscriptionId: string;
  plan: Plan;
  cycle: BillingCycle;
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify({
      cycle: input.cycle === "yearly" ? "YEARLY" : "MONTHLY",
      value: planValueFor(input.plan, input.cycle),
    }),
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

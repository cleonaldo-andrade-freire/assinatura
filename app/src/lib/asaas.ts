import type { BillingCycle, Plan } from "@/lib/database.types";

/** Preço mensal de cada plano, em reais. Anual cobra 10x o valor mensal (2 meses de desconto). */
export const PLAN_MONTHLY_PRICE: Record<Plan, number> = {
  starter: 147,
  pro: 297,
};

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

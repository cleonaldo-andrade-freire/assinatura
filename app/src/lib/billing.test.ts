import { describe, expect, it } from "vitest";
import { canAcceptAnamnesis, GRACE_PERIOD_DAYS } from "./billing";

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe("canAcceptAnamnesis", () => {
  it("permite quando a assinatura está em trial", () => {
    expect(canAcceptAnamnesis({ subscription_status: "trialing", past_due_since: null })).toBe(true);
  });

  it("permite quando a assinatura está ativa", () => {
    expect(canAcceptAnamnesis({ subscription_status: "active", past_due_since: null })).toBe(true);
  });

  it("bloqueia sempre quando a assinatura foi cancelada", () => {
    expect(canAcceptAnamnesis({ subscription_status: "canceled", past_due_since: null })).toBe(false);
    expect(canAcceptAnamnesis({ subscription_status: "canceled", past_due_since: daysAgo(0) })).toBe(false);
  });

  it("permite durante a carência após ficar em atraso", () => {
    expect(canAcceptAnamnesis({ subscription_status: "past_due", past_due_since: daysAgo(1) })).toBe(true);
    expect(
      canAcceptAnamnesis({ subscription_status: "past_due", past_due_since: daysAgo(GRACE_PERIOD_DAYS - 1) })
    ).toBe(true);
  });

  it("bloqueia depois que a carência expira", () => {
    expect(
      canAcceptAnamnesis({ subscription_status: "past_due", past_due_since: daysAgo(GRACE_PERIOD_DAYS + 1) })
    ).toBe(false);
  });

  it("permite se ficou em atraso mas ainda não tem data marcada", () => {
    expect(canAcceptAnamnesis({ subscription_status: "past_due", past_due_since: null })).toBe(true);
  });
});

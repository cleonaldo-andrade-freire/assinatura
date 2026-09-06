import { describe, expect, it } from "vitest";
import { LEAD_BOARD_STATUSES, compareLeadsForColumn, isStaleWaiting } from "./leads";
import type { Lead } from "./database.types";

function fakeLead(overrides: Partial<Lead>): Lead {
  return {
    id: crypto.randomUUID(),
    clinic_id: "clinic-1",
    patient_phone: "5579999999999",
    patient_name: null,
    status: "waiting_reply",
    clinical_summary: null,
    created_at: "2026-09-01T12:00:00+00:00",
    updated_at: "2026-09-01T12:00:00+00:00",
    last_alert_at: null,
    last_message_at: "2026-09-01T12:00:00+00:00",
    archived_at: null,
    ...overrides,
  };
}

const NOW = new Date("2026-09-10T12:00:00+00:00").getTime();

describe("LEAD_BOARD_STATUSES", () => {
  it("não inclui 'scheduled' — lead agendado sai do quadro", () => {
    expect(LEAD_BOARD_STATUSES).not.toContain("scheduled");
    expect(LEAD_BOARD_STATUSES).toEqual(["bot_active", "waiting_reply", "urgent"]);
  });
});

describe("isStaleWaiting", () => {
  it("é verdadeiro pra waiting_reply parado há mais dias que o limite", () => {
    const lead = fakeLead({ status: "waiting_reply", last_message_at: "2026-09-07T12:00:00+00:00" });
    expect(isStaleWaiting(lead, 2, NOW)).toBe(true); // 3 dias
  });

  it("é falso quando ainda não passou do limite", () => {
    const lead = fakeLead({ status: "waiting_reply", last_message_at: "2026-09-09T12:00:00+00:00" });
    expect(isStaleWaiting(lead, 2, NOW)).toBe(false); // 1 dia
  });

  it("só se aplica a waiting_reply", () => {
    const lead = fakeLead({ status: "urgent", last_message_at: "2026-08-01T12:00:00+00:00" });
    expect(isStaleWaiting(lead, 2, NOW)).toBe(false);
  });

  it("cai pro created_at quando não há last_message_at", () => {
    const lead = fakeLead({ status: "waiting_reply", last_message_at: null, created_at: "2026-09-01T12:00:00+00:00" });
    expect(isStaleWaiting(lead, 2, NOW)).toBe(true);
  });
});

describe("compareLeadsForColumn", () => {
  const older = fakeLead({ last_message_at: "2026-09-02T12:00:00+00:00" });
  const newer = fakeLead({ last_message_at: "2026-09-08T12:00:00+00:00" });

  it("em 'Aguardando resposta', quem espera há mais tempo vem primeiro", () => {
    expect(compareLeadsForColumn("waiting_reply", older, newer)).toBeLessThan(0);
  });

  it("nas outras colunas, o mais recente vem primeiro", () => {
    expect(compareLeadsForColumn("urgent", older, newer)).toBeGreaterThan(0);
  });
});

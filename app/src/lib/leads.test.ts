import { describe, expect, it } from "vitest";
import { LEAD_BOARD_STATUSES, compareLeadsByRecency, findPatientNameForPhone, isStaleWaiting } from "./leads";
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

describe("findPatientNameForPhone", () => {
  const patients = [
    { name: "Maria Souza", phone: "5579999998888" },
    { name: "  ", phone: "5579911112222" }, // nome em branco não conta
    { name: "João Lima", phone: "557988887777" }, // 8 dígitos, sem o 9
  ];

  it("acha o nome quando o telefone bate exatamente", () => {
    expect(findPatientNameForPhone("5579999998888", patients)).toBe("Maria Souza");
  });

  it("acha o nome pela variação do nono dígito", () => {
    // lead sem o 9, paciente com o 9
    expect(findPatientNameForPhone("557999998888", [{ name: "Maria Souza", phone: "5579999998888" }])).toBe(
      "Maria Souza"
    );
  });

  it("devolve null quando nenhum paciente bate", () => {
    expect(findPatientNameForPhone("5511777776666", patients)).toBeNull();
  });

  it("ignora paciente com nome em branco", () => {
    expect(findPatientNameForPhone("5579911112222", patients)).toBeNull();
  });
});

describe("compareLeadsByRecency", () => {
  const older = fakeLead({ last_message_at: "2026-09-02T12:00:00+00:00" });
  const newer = fakeLead({ last_message_at: "2026-09-08T12:00:00+00:00" });

  it("coloca o mais recente primeiro (ordem decrescente de data)", () => {
    expect(compareLeadsByRecency(older, newer)).toBeGreaterThan(0);
    expect([older, newer].sort(compareLeadsByRecency)).toEqual([newer, older]);
  });

  it("cai pro created_at quando não há last_message_at", () => {
    const a = fakeLead({ last_message_at: null, created_at: "2026-09-01T00:00:00+00:00" });
    const b = fakeLead({ last_message_at: null, created_at: "2026-09-05T00:00:00+00:00" });
    expect([a, b].sort(compareLeadsByRecency)).toEqual([b, a]);
  });
});

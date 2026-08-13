import { describe, expect, it } from "vitest";
import {
  appointmentEndsAt,
  buildContinuationMap,
  buildDaySlotTimes,
  isCancelled,
  rangesOverlap,
  slotKey,
  summarizeAppointmentsByDay,
} from "./appointments";
import type { Appointment } from "./database.types";

function fakeAppointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: crypto.randomUUID(),
    clinic_id: "clinic-1",
    scheduled_at: "2026-08-12T11:00:00+00:00",
    duration_minutes: 30,
    status: "agendado",
    urgent: false,
    patient_id: null,
    patient_name: "Paciente Teste",
    patient_phone: "5579999999999",
    professional_name: "Dra. Exemplo",
    notes: null,
    confirm_token: crypto.randomUUID(),
    reminder_24h_sent_at: null,
    reminder_final_sent_at: null,
    return_due_date: null,
    return_notified_at: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00+00:00",
    updated_at: "2026-08-01T00:00:00+00:00",
    ...overrides,
  };
}

describe("summarizeAppointmentsByDay", () => {
  it("agrupa por dia local do Brasil, conta por status e marca urgência", () => {
    const appointments = [
      fakeAppointment({ scheduled_at: "2026-08-12T11:00:00+00:00", status: "confirmado" }),
      fakeAppointment({ scheduled_at: "2026-08-12T14:00:00+00:00", status: "agendado", urgent: true }),
      fakeAppointment({ scheduled_at: "2026-08-13T11:00:00+00:00", status: "cancelado_paciente" }),
    ];
    const summary = summarizeAppointmentsByDay(appointments);

    expect(summary.get("2026-08-12")).toEqual({
      total: 2,
      byStatus: { confirmado: 1, agendado: 1 },
      anyUrgent: true,
    });
    expect(summary.get("2026-08-13")).toEqual({
      total: 1,
      byStatus: { cancelado_paciente: 1 },
      anyUrgent: false,
    });
    expect(summary.has("2026-08-14")).toBe(false);
  });

  it("horário perto da virada do dia (21h+ BR) cai no dia local certo, não no dia UTC", () => {
    // 22:30 em 12/08 no Brasil (-03:00) é 01:30 UTC do dia 13 — sem converter
    // pro fuso do Brasil antes de agrupar, isso cairia no dia errado.
    const appointments = [fakeAppointment({ scheduled_at: "2026-08-13T01:30:00+00:00" })];
    const summary = summarizeAppointmentsByDay(appointments);
    expect(summary.has("2026-08-12")).toBe(true);
    expect(summary.has("2026-08-13")).toBe(false);
  });

  it("aguenta um volume alto (várias clínicas/profissionais, mês cheio) sem degradar", () => {
    const many: Appointment[] = [];
    for (let day = 1; day <= 28; day++) {
      for (let i = 0; i < 80; i++) {
        many.push(
          fakeAppointment({
            scheduled_at: `2026-08-${String(day).padStart(2, "0")}T${String(11 + (i % 8)).padStart(2, "0")}:00:00+00:00`,
            status: (["agendado", "confirmado", "atendido", "cancelado_paciente"] as const)[i % 4],
          })
        );
      }
    }
    expect(many.length).toBe(2240);

    const start = performance.now();
    const summary = summarizeAppointmentsByDay(many);
    const elapsed = performance.now() - start;

    expect(summary.size).toBe(28);
    // Bem generoso de propósito (já flakou em 200ms e em 1500ms sob
    // máquina ocupada — formatação de data via Intl não é grátis por item,
    // e essa suíte às vezes roda em paralelo com outro build/typecheck).
    // O objetivo é só pegar uma regressão de algoritmo real (ex.: virar
    // O(n²) sem querer, que apareceria como segundos/minutos, não como
    // alguns milissegundos de diferença por carga de máquina).
    expect(elapsed).toBeLessThan(10_000);
  });
});

describe("slotKey", () => {
  it("casa o formato que o Postgres/PostgREST devolve (+00:00, sem milissegundos) com o de buildDaySlotTimes (.000Z)", () => {
    // Regressão: sem essa normalização, um agendamento existia no banco mas
    // nunca aparecia na grade/lista — a busca no Map nunca batia porque as
    // duas strings representam o mesmo instante de formas diferentes.
    const fromPostgrest = "2026-08-13T11:00:00+00:00";
    const [slot] = buildDaySlotTimes("2026-08-13", 8, 9);
    expect(slotKey(fromPostgrest)).toBe(slot);
  });

  it("também casa quando o valor já vem no formato Date.toISOString()", () => {
    expect(slotKey("2026-08-13T11:00:00.000Z")).toBe("2026-08-13T11:00:00.000Z");
  });
});

describe("buildDaySlotTimes", () => {
  it("gera slots de 30 em 30 minutos dentro do horário comercial", () => {
    const slots = buildDaySlotTimes("2026-08-12", 8, 9);
    expect(slots).toEqual(["2026-08-12T11:00:00.000Z", "2026-08-12T11:30:00.000Z"]);
  });

  it("horário local do Brasil vira o instante UTC certo (offset fixo -03:00)", () => {
    const [first] = buildDaySlotTimes("2026-08-12", 8, 9);
    expect(new Date(first).toISOString()).toBe("2026-08-12T11:00:00.000Z");
  });
});

describe("appointmentEndsAt", () => {
  it("soma a duração em minutos ao horário de início", () => {
    const end = appointmentEndsAt("2026-08-12T11:00:00.000Z", 30);
    expect(end.toISOString()).toBe("2026-08-12T11:30:00.000Z");
  });
});

describe("isCancelled", () => {
  it("considera os dois tipos de cancelamento como 'vago'", () => {
    expect(isCancelled("cancelado_paciente")).toBe(true);
    expect(isCancelled("cancelado_dentista")).toBe(true);
  });

  it("não considera os demais status como cancelados", () => {
    expect(isCancelled("agendado")).toBe(false);
    expect(isCancelled("confirmado")).toBe(false);
    expect(isCancelled("atendido")).toBe(false);
  });
});

/**
 * `rangesOverlap` é a mesma lógica de sobreposição que sustenta tanto a
 * checagem prévia da aplicação (`findOverlappingAppointment`) quanto o
 * `EXCLUDE USING gist` da migration 022 — este último só pode ser verificado
 * de verdade contra um Postgres real (não há harness de integração com
 * Supabase neste projeto; os 4 arquivos de teste existentes já testam só
 * lógica pura, sem tocar banco). O que dá pra garantir aqui é que a regra de
 * sobreposição em si está correta nos limites — inclusive concorrência: as
 * duas gravações concorrentes batem na mesma regra de exclusão do banco,
 * então acertar a regra aqui é acertar a mesma coisa que protege lá.
 */
describe("rangesOverlap", () => {
  const slot = (h: number, m = 0) => new Date(`2026-08-12T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`);

  it("detecta sobreposição parcial", () => {
    // 09:00–09:30 vs 09:15–09:45
    expect(rangesOverlap(slot(9), slot(9, 30), slot(9, 15), slot(9, 45))).toBe(true);
  });

  it("detecta um intervalo totalmente contido no outro", () => {
    expect(rangesOverlap(slot(9), slot(10), slot(9, 15), slot(9, 30))).toBe(true);
  });

  it("detecta horários idênticos como sobreposição", () => {
    expect(rangesOverlap(slot(9), slot(9, 30), slot(9), slot(9, 30))).toBe(true);
  });

  it("não considera intervalos adjacentes (fim de um = início do outro) como sobreposição", () => {
    // 09:00–09:30 seguido de 09:30–10:00 — encaixe exato na grade de 30min, não é conflito.
    expect(rangesOverlap(slot(9), slot(9, 30), slot(9, 30), slot(10))).toBe(false);
  });

  it("não detecta sobreposição em horários totalmente distintos", () => {
    expect(rangesOverlap(slot(9), slot(9, 30), slot(14), slot(14, 30))).toBe(false);
  });
});

describe("buildContinuationMap", () => {
  const slots = buildDaySlotTimes("2026-08-12", 8, 12);

  it("marca os slots de continuação de uma consulta de 60min, sem marcar o próprio horário de início", () => {
    const appt = fakeAppointment({ scheduled_at: slots[0], duration_minutes: 60 });
    const covered = buildContinuationMap([appt], slots);
    expect(covered.has(slots[0])).toBe(false); // início — já tratado via bySlot, não é "continuação"
    expect(covered.get(slots[1])).toBe(appt); // 30min depois — coberto
    expect(covered.has(slots[2])).toBe(false); // 60min depois — já fora da consulta
  });

  it("uma consulta de 30min (padrão) não cobre nenhum slot além do próprio início", () => {
    const appt = fakeAppointment({ scheduled_at: slots[0], duration_minutes: 30 });
    expect(buildContinuationMap([appt], slots).size).toBe(0);
  });

  it("agendamento cancelado não ocupa slot nenhum — o horário deve ficar livre pra realocação", () => {
    const appt = fakeAppointment({ scheduled_at: slots[0], duration_minutes: 90, status: "cancelado_paciente" });
    expect(buildContinuationMap([appt], slots).size).toBe(0);
  });
});

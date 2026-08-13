import { describe, expect, it } from "vitest";
import { appointmentEndsAt, isCancelled, rangesOverlap } from "./appointments";

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

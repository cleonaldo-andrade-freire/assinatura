import { describe, expect, it } from "vitest";
import {
  appointmentRoomRentedMessage,
  buildWeekGrid,
  groupReceivables,
  isReceivable,
  rentalConflictMessage,
  shiftRange,
} from "./roomRental";
import type { RoomRental, RoomRentalShift } from "./database.types";

function shift(id: string, start: string, end: string): RoomRentalShift {
  return {
    id,
    clinic_id: "c",
    name: id,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    default_amount: null,
    active: true,
    sort_order: 0,
    created_at: "",
    updated_at: "",
  };
}

function rental(overrides: Partial<RoomRental>): RoomRental {
  const date = overrides.rental_date ?? "2026-10-13";
  const { startsAt, endsAt } = shiftRange(date, { start_time: "07:00", end_time: "12:00" });
  return {
    id: "r1",
    clinic_id: "c",
    tenant_id: "t1",
    shift_id: "manha",
    rental_date: date,
    starts_at: startsAt,
    ends_at: endsAt,
    amount: 150,
    notes: null,
    status: "agendada",
    paid_at: null,
    payment_method: null,
    cancelled_at: null,
    cancel_reason: null,
    series_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const manha = shift("manha", "07:00", "12:00");
const tarde = shift("tarde", "13:00", "18:00");

describe("shiftRange", () => {
  it("converte o horário do turno do fuso do Brasil para UTC", () => {
    expect(shiftRange("2026-10-13", manha)).toEqual({
      startsAt: "2026-10-13T10:00:00.000Z",
      endsAt: "2026-10-13T15:00:00.000Z",
    });
  });

  it("turno da noite que termina às 22h não vira o dia seguinte no Brasil", () => {
    // 22h em Brasília = 01h UTC do dia seguinte — certo em UTC; o que importa
    // é que a data de referência continue sendo a do turno.
    const { endsAt } = shiftRange("2026-10-13", shift("noite", "18:00", "22:00"));
    expect(endsAt).toBe("2026-10-14T01:00:00.000Z");
  });
});

describe("buildWeekGrid", () => {
  const days = ["2026-10-13", "2026-10-14"];

  it("marca o turno alugado e deixa os outros livres", () => {
    const grid = buildWeekGrid(days, [manha, tarde], [rental({})], []);
    expect(grid.get("2026-10-13|manha")?.kind).toBe("alugada");
    expect(grid.get("2026-10-13|tarde")?.kind).toBe("livre");
    expect(grid.get("2026-10-14|manha")?.kind).toBe("livre");
  });

  it("locação cancelada não ocupa o turno", () => {
    const grid = buildWeekGrid(days, [manha], [rental({ status: "cancelada" })], []);
    expect(grid.get("2026-10-13|manha")?.kind).toBe("livre");
  });

  it("consulta que ocupa só parte do turno já marca o turno como da clínica", () => {
    const grid = buildWeekGrid(days, [manha, tarde], [], [
      { scheduled_at: "2026-10-13T14:00:00.000Z", ends_at: "2026-10-13T14:30:00.000Z" }, // 11h–11h30
    ]);
    expect(grid.get("2026-10-13|manha")).toEqual({ kind: "clinica", appointmentCount: 1 });
    expect(grid.get("2026-10-13|tarde")?.kind).toBe("livre");
  });

  it("consulta que termina exatamente no início do turno não conflita", () => {
    // [06:30, 07:00) e [07:00, 12:00) não se sobrepõem — mesma regra '[)' do banco.
    const grid = buildWeekGrid(days, [manha], [], [{ scheduled_at: "2026-10-13T09:30:00.000Z", ends_at: "2026-10-13T10:00:00.000Z" }]);
    expect(grid.get("2026-10-13|manha")?.kind).toBe("livre");
  });

  it("turno Integral aparece alugado quando a Manhã do mesmo dia está alugada", () => {
    // É a sobreposição por intervalo — não por id de turno — que decide.
    const integral = shift("integral", "07:00", "18:00");
    const grid = buildWeekGrid(days, [integral], [rental({})], []);
    expect(grid.get("2026-10-13|integral")?.kind).toBe("alugada");
  });
});

describe("isReceivable / groupReceivables", () => {
  const today = "2026-10-13";

  it("só é a receber depois do uso, não pago e não cancelado", () => {
    expect(isReceivable(rental({ rental_date: "2026-10-13" }), today)).toBe(true);
    expect(isReceivable(rental({ rental_date: "2026-10-14" }), today)).toBe(false);
    expect(isReceivable(rental({ paid_at: "2026-10-13T15:00:00Z" }), today)).toBe(false);
    expect(isReceivable(rental({ status: "cancelada" }), today)).toBe(false);
  });

  it("agrupa por locatário, maior total primeiro, locações da mais antiga para a mais nova", () => {
    const groups = groupReceivables(
      [
        rental({ id: "a2", tenant_id: "ana", rental_date: "2026-10-09", amount: 100 }),
        rental({ id: "a1", tenant_id: "ana", rental_date: "2026-10-02", amount: 100 }),
        rental({ id: "b1", tenant_id: "bruno", rental_date: "2026-10-05", amount: 150 }),
        rental({ id: "futura", tenant_id: "bruno", rental_date: "2026-10-20", amount: 999 }),
      ],
      [
        { id: "ana", name: "Dra. Ana" },
        { id: "bruno", name: "Dr. Bruno" },
      ],
      today
    );
    expect(groups.map((g) => [g.tenant.name, g.total])).toEqual([
      ["Dra. Ana", 200],
      ["Dr. Bruno", 150],
    ]);
    expect(groups[0].rentals.map((r) => r.id)).toEqual(["a1", "a2"]);
  });
});

describe("mensagens de conflito", () => {
  it("distingue locação sobreposta de consulta na agenda", () => {
    expect(rentalConflictMessage({ code: "23P01", message: "conflicting key value violates exclusion constraint" })).toMatch(/já está alugada/);
    expect(rentalConflictMessage({ code: "23P01", message: "room_rental_appointment_conflict" })).toMatch(/consulta marcada/);
    expect(rentalConflictMessage({ code: "23505", message: "x" })).toBeNull();
  });

  it("do lado da agenda, só reconhece o trigger de sala alugada", () => {
    expect(appointmentRoomRentedMessage({ code: "23P01", message: "room_rented" })).toMatch(/sala está alugada/);
    expect(appointmentRoomRentedMessage({ code: "23P01", message: "conflicting key value violates exclusion constraint" })).toBeNull();
  });
});

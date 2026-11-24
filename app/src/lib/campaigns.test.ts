import { describe, expect, it } from "vitest";
import {
  canonicalCampaignPhone,
  classifyCampaignReply,
  isBrazilianHoliday,
  isCampaignSendingWindow,
  nextCampaignSendAt,
  renderCampaignText,
} from "@/lib/campaigns";

// Horários em Brasília (UTC-3, sem horário de verão).
const br = (iso: string) => new Date(`${iso}-03:00`);

describe("isCampaignSendingWindow", () => {
  it("libera seg–sex das 9h até antes das 18h", () => {
    expect(isCampaignSendingWindow(br("2026-11-23T09:00:00"))).toBe(true); // segunda
    expect(isCampaignSendingWindow(br("2026-11-27T17:59:00"))).toBe(true); // sexta
  });

  it("bloqueia antes das 9h, a partir das 18h e no fim de semana", () => {
    expect(isCampaignSendingWindow(br("2026-11-23T08:59:00"))).toBe(false);
    expect(isCampaignSendingWindow(br("2026-11-23T18:00:00"))).toBe(false);
    expect(isCampaignSendingWindow(br("2026-11-28T10:00:00"))).toBe(false); // sábado
    expect(isCampaignSendingWindow(br("2026-11-29T10:00:00"))).toBe(false); // domingo
  });

  it("bloqueia feriado nacional em dia útil", () => {
    expect(isCampaignSendingWindow(br("2026-11-20T10:00:00"))).toBe(false); // Consciência Negra (sexta)
  });
});

describe("isBrazilianHoliday", () => {
  it("reconhece feriados fixos e os móveis da Páscoa", () => {
    expect(isBrazilianHoliday("2026-12-25")).toBe(true);
    expect(isBrazilianHoliday("2026-04-03")).toBe(true); // Sexta-feira Santa 2026 (Páscoa 05/04)
    expect(isBrazilianHoliday("2026-02-17")).toBe(true); // Carnaval 2026
    expect(isBrazilianHoliday("2026-06-04")).toBe(true); // Corpus Christi 2026
    expect(isBrazilianHoliday("2026-11-23")).toBe(false);
  });
});

describe("nextCampaignSendAt", () => {
  it("fica entre 4 e 7 minutos depois", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(nextCampaignSendAt(now, () => 0).getTime() - now.getTime()).toBe(4 * 60_000);
    expect(nextCampaignSendAt(now, () => 0.9999).getTime() - now.getTime()).toBeLessThan(7 * 60_000);
  });
});

describe("classifyCampaignReply", () => {
  it.each(["Sim", "sim!", "SIM, pode mandar", "Quero", "pode mandar", "Claro 😊", "👍", "quero saber mais"])("'%s' = yes", (t) => {
    expect(classifyCampaignReply(t)).toBe("yes");
  });

  it.each(["Não", "nao, obrigado", "SAIR", "Pare", "não tenho interesse"])("'%s' = no", (t) => {
    expect(classifyCampaignReply(t)).toBe("no");
  });

  it.each(["Oii, sim!", "Sum", "Boa noite D.Evigane pode sim", "Simmm", "Siiim", "ss", "Bom dia! Sim, quero", "Oi Dra, pode mandar sim"])("'%s' = yes (com cumprimento ou erro de digitação)", (t) => {
    expect(classifyCampaignReply(t)).toBe("yes");
  });

  it.each(["Não sei, quanto custa?", "Qual o valor?", "sim mas não agora", "Bom dia", "quem é?", "não conheço essa pessoa, número errado"])("'%s' = other", (t) => {
    expect(classifyCampaignReply(t)).toBe("other");
  });
});

describe("renderCampaignText", () => {
  it("usa só o primeiro nome e o nome da clínica", () => {
    expect(renderCampaignText("Oi, {{nome}}! Aqui é da {{clinica}}.", { name: "MARIA DA SILVA", clinicName: "Clínica X" })).toBe(
      "Oi, Maria! Aqui é da Clínica X."
    );
  });

  it("sem nome, remove a vírgula junto", () => {
    expect(renderCampaignText("Oi, {{nome}}! Tudo bem?", { name: null, clinicName: "X" })).toBe("Oi! Tudo bem?");
  });
});

describe("canonicalCampaignPhone", () => {
  it("normaliza para DDI 55 com nono dígito", () => {
    expect(canonicalCampaignPhone("(79) 99861-6410")).toBe("5579998616410");
    expect(canonicalCampaignPhone("557998616410")).toBe("5579998616410");
    expect(canonicalCampaignPhone("5579998616410")).toBe("5579998616410");
  });

  it("rejeita o que não é telefone", () => {
    expect(canonicalCampaignPhone("123")).toBeNull();
    expect(canonicalCampaignPhone(null)).toBeNull();
  });
});

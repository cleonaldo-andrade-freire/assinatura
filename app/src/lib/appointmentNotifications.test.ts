import { describe, expect, it } from "vitest";
import { matchConfirmCancel } from "./appointmentNotifications";

describe("matchConfirmCancel", () => {
  it("reconhece variações comuns de confirmação", () => {
    expect(matchConfirmCancel("Confirmar")).toBe("confirm");
    expect(matchConfirmCancel("confirmo!")).toBe("confirm");
    expect(matchConfirmCancel("Sim")).toBe("confirm");
    expect(matchConfirmCancel("1")).toBe("confirm");
    expect(matchConfirmCancel("Ok, confirmado")).toBe("confirm");
  });

  it("reconhece variações comuns de cancelamento, inclusive com acento", () => {
    expect(matchConfirmCancel("Cancelar")).toBe("cancel");
    expect(matchConfirmCancel("Não posso ir")).toBe("cancel");
    expect(matchConfirmCancel("nao")).toBe("cancel");
    expect(matchConfirmCancel("2")).toBe("cancel");
  });

  it("não interpreta texto ambíguo — melhor pedir pra usar o link do que arriscar errar a ação", () => {
    expect(matchConfirmCancel("oi, tudo bem?")).toBe(null);
    expect(matchConfirmCancel("quero remarcar pra outro dia")).toBe(null);
    expect(matchConfirmCancel("")).toBe(null);
  });
});

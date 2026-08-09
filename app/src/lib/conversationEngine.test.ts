import { describe, expect, it } from "vitest";
import { advanceConversation, matchYesNo } from "./conversationEngine";
import type { Question } from "./database.types";

describe("matchYesNo", () => {
  it("reconhece variações comuns de sim", () => {
    expect(matchYesNo("sim")).toBe("Sim");
    expect(matchYesNo("Sim")).toBe("Sim");
    expect(matchYesNo("S")).toBe("Sim");
    expect(matchYesNo("sim, uso losartana")).toBe("Sim");
    expect(matchYesNo("Sim!")).toBe("Sim");
  });

  it("reconhece variações comuns de não, com e sem acento/pontuação", () => {
    expect(matchYesNo("não")).toBe("Não");
    expect(matchYesNo("nao")).toBe("Não");
    expect(matchYesNo("Não!")).toBe("Não");
    expect(matchYesNo("n")).toBe("Não");
  });

  it("retorna null pra texto ambíguo", () => {
    expect(matchYesNo("talvez")).toBeNull();
    expect(matchYesNo("hipertensão controlada")).toBeNull();
    expect(matchYesNo("")).toBeNull();
  });
});

describe("advanceConversation", () => {
  const questions: Question[] = [
    { id: "q1", text: "Qual seu nome completo?", type: "text" },
    { id: "q2", text: "Possui diabetes?", type: "yesno" },
    { id: "q3", text: "Alguma observação?", type: "text" },
  ];

  it("avança pra próxima pergunta depois de uma resposta de texto válida", () => {
    const result = advanceConversation(questions, 0, [], "Maria Silva");
    expect(result.kind).toBe("next");
    if (result.kind === "next") {
      expect(result.nextIndex).toBe(1);
      expect(result.question.text).toBe("Possui diabetes?");
      expect(result.answers).toEqual([{ question: "Qual seu nome completo?", answer: "Maria Silva" }]);
    }
  });

  it("pede esclarecimento quando a resposta de sim/não não é reconhecida", () => {
    const result = advanceConversation(questions, 1, [{ question: "Qual seu nome completo?", answer: "Maria" }], "quem sabe");
    expect(result.kind).toBe("clarify");
  });

  it("normaliza a resposta de sim/não pra 'Sim'/'Não' antes de salvar", () => {
    const result = advanceConversation(questions, 1, [], "s");
    expect(result.kind).toBe("next");
    if (result.kind === "next") {
      expect(result.answers[0].answer).toBe("Sim");
    }
  });

  it("finaliza a conversa depois da última pergunta", () => {
    const answersSoFar = [
      { question: "Qual seu nome completo?", answer: "Maria" },
      { question: "Possui diabetes?", answer: "Não" },
    ];
    const result = advanceConversation(questions, 2, answersSoFar, "Nenhuma");
    expect(result.kind).toBe("done");
    if (result.kind === "done") {
      expect(result.answers).toHaveLength(3);
      expect(result.answers[2]).toEqual({ question: "Alguma observação?", answer: "Nenhuma" });
    }
  });

  it("trata índice além do fim das perguntas como concluído (defensivo)", () => {
    const result = advanceConversation(questions, 99, [], "qualquer coisa");
    expect(result.kind).toBe("done");
  });
});

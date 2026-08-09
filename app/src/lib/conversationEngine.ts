import type { AnamnesisAnswer, Question } from "@/lib/database.types";

const YES_WORDS = new Set(["sim", "s", "yes", "y", "claro"]);
const NO_WORDS = new Set(["nao", "n", "no", "negativo"]);

function normalizeWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z\s]/g, ""); // remove pontuação (ex.: "não!", "sim.")
}

/** Interpreta uma resposta livre como Sim/Não, aceitando variações comuns de digitação. */
export function matchYesNo(raw: string): "Sim" | "Não" | null {
  const normalized = normalizeWord(raw);
  if (YES_WORDS.has(normalized)) return "Sim";
  if (NO_WORDS.has(normalized)) return "Não";

  const firstWord = normalized.split(/\s+/)[0] ?? "";
  if (YES_WORDS.has(firstWord)) return "Sim";
  if (NO_WORDS.has(firstWord)) return "Não";
  return null;
}

export function formatQuestionPrompt(question: Question): string {
  return question.type === "yesno" ? `${question.text} (responda Sim ou Não)` : question.text;
}

export type AdvanceResult =
  | { kind: "clarify"; prompt: string }
  | { kind: "next"; question: Question; nextIndex: number; answers: AnamnesisAnswer[] }
  | { kind: "done"; answers: AnamnesisAnswer[] };

/**
 * Processa a resposta do paciente pra pergunta atual e decide o próximo passo.
 * Função pura — não faz nenhuma chamada de rede/banco, só recebe o estado atual
 * da conversa e devolve o que deveria acontecer a seguir.
 */
export function advanceConversation(
  questions: Question[],
  currentIndex: number,
  answersSoFar: AnamnesisAnswer[],
  rawText: string
): AdvanceResult {
  const question = questions[currentIndex];
  if (!question) {
    return { kind: "done", answers: answersSoFar };
  }

  let answerText = rawText.trim();
  if (question.type === "yesno") {
    const matched = matchYesNo(rawText);
    if (!matched) {
      return { kind: "clarify", prompt: `Não entendi sua resposta. ${formatQuestionPrompt(question)}` };
    }
    answerText = matched;
  }

  if (!answerText) {
    return { kind: "clarify", prompt: formatQuestionPrompt(question) };
  }

  const answers = [...answersSoFar, { question: question.text, answer: answerText }];
  const nextIndex = currentIndex + 1;
  const nextQuestion = questions[nextIndex];

  if (!nextQuestion) {
    return { kind: "done", answers };
  }
  return { kind: "next", question: nextQuestion, nextIndex, answers };
}

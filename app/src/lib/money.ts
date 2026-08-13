/**
 * Máscara de valor em reais — digita só números, os centavos se acomodam
 * sozinhos à direita (mesmo padrão de app de banco: "15000" vira "150,00"),
 * em vez de deixar o campo aceitar qualquer caractere e depender de o
 * usuário digitar vírgula/ponto no lugar certo.
 */
export function formatMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Converte o texto já mascarado ("1.500,00") de volta pro número. */
export function parseMoneyInput(formatted: string): number {
  const normalized = formatted.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Mesmo formato de exibição da máscara, mas a partir de um número (linhas já salvas) — sem o "R$" no meio da tabela. */
export function formatMoneyDisplay(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

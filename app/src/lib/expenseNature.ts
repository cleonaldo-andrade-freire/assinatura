import type { ExpenseNature } from "@/lib/database.types";

export const EXPENSE_NATURES: ExpenseNature[] = ["fixa", "variavel"];

export const EXPENSE_NATURE_LABEL: Record<ExpenseNature, string> = {
  fixa: "Fixa",
  variavel: "Variável",
};

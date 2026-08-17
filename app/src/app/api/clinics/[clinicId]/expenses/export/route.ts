import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EXPENSE_NATURE_LABEL } from "@/lib/expenseNature";
import { firstOfNextMonth, brDateOnly } from "@/lib/date";
import { formatDateBR } from "@/lib/pdfTextLayout";
import { formatMoneyDisplay } from "@/lib/money";
import type { Expense } from "@/lib/database.types";

const EXPORT_ROW_LIMIT = 2000;

function csvField(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Exporta em CSV (separador `;`, decimal com vírgula — convenção do Excel em pt-BR) as despesas que batem com os
 * mesmos filtros da tela: pendentes (todas) + pagas do mês selecionado. */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const overdueOnly = sp.get("overdue") === "1";
  const monthParam = sp.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : brDateOnly().slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = firstOfNextMonth(monthStart);

  const supabase = await createSupabaseServerClient();

  let pendingQuery = supabase.from("expenses").select("*").eq("clinic_id", clinic.id).eq("status", "pendente");
  if (overdueOnly) pendingQuery = pendingQuery.lt("due_date", brDateOnly());

  const paidQuery = supabase
    .from("expenses")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("status", "pago")
    .gte("paid_at", monthStart)
    .lt("paid_at", monthEnd);

  const [{ data: pendingData }, { data: paidData }] = await Promise.all([
    pendingQuery.order("due_date", { ascending: true }).limit(EXPORT_ROW_LIMIT),
    paidQuery.order("paid_at", { ascending: false }).limit(EXPORT_ROW_LIMIT),
  ]);
  const rows = [...((pendingData as Expense[]) ?? []), ...((paidData as Expense[]) ?? [])];

  const header = ["Descrição", "Categoria", "Natureza", "Status", "Vencimento", "Pago em", "Forma de pagamento", "Valor"];
  const lines = [header.map(csvField).join(";")];
  for (const e of rows) {
    lines.push(
      [
        e.description,
        e.category ?? "",
        e.nature ? EXPENSE_NATURE_LABEL[e.nature] : "",
        e.status === "pago" ? "Pago" : "Pendente",
        formatDateBR(e.due_date),
        e.paid_at ? formatDateBR(e.paid_at) : "",
        e.payment_method ?? "",
        formatMoneyDisplay(Number(e.amount)),
      ]
        .map(csvField)
        .join(";")
    );
  }
  const csv = "﻿" + lines.join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="despesas-${month}.csv"`,
    },
  });
}

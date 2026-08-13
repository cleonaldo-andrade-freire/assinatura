import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readBudgetPdf } from "@/lib/budgetPdfStorage";

/** Download autenticado do PDF de orçamento, usado no dashboard. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS garante que essa leitura só retorna o orçamento se ele pertencer à
  // clínica do usuário logado.
  const { data: budget } = await supabase.from("budgets").select("id, pdf_storage_key").eq("id", params.id).maybeSingle();

  if (!budget || !budget.pdf_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const pdf = await readBudgetPdf(budget.pdf_storage_key);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${budget.id}.pdf"`,
    },
  });
}

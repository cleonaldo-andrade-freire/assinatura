import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveExpenseReceipt, readExpenseReceipt, deleteExpenseReceipt } from "@/lib/expenseReceiptStorage";

/** Stream autenticado do comprovante — a tag <a download> do navegador é quem decide entre visualizar/baixar. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense } = await supabase
    .from("expenses")
    .select("receipt_storage_key, receipt_content_type, receipt_file_name")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!expense?.receipt_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await readExpenseReceipt(expense.receipt_storage_key);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": expense.receipt_content_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(expense.receipt_file_name || "comprovante")}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

/** Anexa (ou substitui) o comprovante — multipart/form-data, campo `receipt`. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense } = await supabase.from("expenses").select("id").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!expense) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("receipt");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  let key: string;
  try {
    key = await saveExpenseReceipt(clinic.id, params.id, file);
  } catch (err) {
    return NextResponse.json({ error: "upload_failed", message: err instanceof Error ? err.message : "Falha ao salvar o arquivo." }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ receipt_storage_key: key, receipt_file_name: file.name, receipt_content_type: file.type, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ expense: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: expense } = await supabase.from("expenses").select("receipt_storage_key").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!expense) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: updated, error } = await supabase
    .from("expenses")
    .update({ receipt_storage_key: null, receipt_file_name: null, receipt_content_type: null, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  if (expense.receipt_storage_key) await deleteExpenseReceipt(expense.receipt_storage_key);
  return NextResponse.json({ expense: updated });
}

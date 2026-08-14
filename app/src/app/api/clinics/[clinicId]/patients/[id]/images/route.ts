import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { savePatientImage } from "@/lib/patientImageStorage";
import type { PatientImage } from "@/lib/database.types";

export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("patient_images")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
  return NextResponse.json({ images: (data as PatientImage[]) ?? [] });
}

/** Envia uma ou mais imagens de uma vez — multipart/form-data, campo `images`. */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase.from("patients").select("id").eq("id", params.id).eq("clinic_id", clinic.id).maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const files = form?.getAll("images").filter((f): f is File => f instanceof File && f.size > 0) ?? [];
  if (files.length === 0) {
    return NextResponse.json({ error: "missing_files" }, { status: 400 });
  }

  const uploaded: PatientImage[] = [];
  for (const file of files) {
    const { data: row, error: insertError } = await supabase
      .from("patient_images")
      .insert({
        clinic_id: clinic.id,
        patient_id: patient.id,
        file_name: file.name,
        storage_key: "",
        content_type: file.type,
        size_bytes: file.size,
      })
      .select("*")
      .single();
    if (insertError || !row) {
      console.error("Falha ao registrar imagem do paciente:", insertError);
      continue;
    }
    try {
      const key = await savePatientImage(clinic.id, patient.id, row.id, file);
      const { data: updated } = await supabase.from("patient_images").update({ storage_key: key }).eq("id", row.id).select("*").single();
      if (updated) uploaded.push(updated as PatientImage);
    } catch (err) {
      console.error("Falha ao salvar imagem no Storage:", err);
      await supabase.from("patient_images").delete().eq("id", row.id);
    }
  }

  if (uploaded.length === 0) {
    return NextResponse.json({ error: "upload_failed" }, { status: 400 });
  }
  return NextResponse.json({ images: uploaded }, { status: 201 });
}

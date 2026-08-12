import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { contentTypeForKey, readPatientPhoto, savePatientPhoto } from "@/lib/patientPhotoStorage";

/** Upload da foto do paciente (bucket privado — ver `lib/patientPhotoStorage.ts`). */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  let storageKey: string;
  try {
    storageKey = await savePatientPhoto(clinic.id, params.id, file);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "upload_failed" }, { status: 400 });
  }

  const { error } = await supabase.from("patients").update({ photo_storage_key: storageKey }).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Stream autenticado da foto — nunca servida por URL pública do Storage. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("photo_storage_key")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!patient?.photo_storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const photo = await readPatientPhoto(patient.photo_storage_key);
  return new NextResponse(photo as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeForKey(patient.photo_storage_key),
      "Cache-Control": "private, max-age=300",
    },
  });
}

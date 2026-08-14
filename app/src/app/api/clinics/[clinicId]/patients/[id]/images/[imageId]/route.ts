import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deletePatientImage, readPatientImage } from "@/lib/patientImageStorage";

/** Stream autenticado da imagem — a tag <a download> do navegador é quem decide entre visualizar/baixar. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string; imageId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: image } = await supabase
    .from("patient_images")
    .select("storage_key, content_type, file_name")
    .eq("id", params.imageId)
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .maybeSingle();
  if (!image?.storage_key) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const bytes = await readPatientImage(image.storage_key);
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": image.content_type,
      "Content-Disposition": `inline; filename="${encodeURIComponent(image.file_name)}"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { clinicId: string; id: string; imageId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: image } = await supabase
    .from("patient_images")
    .select("storage_key")
    .eq("id", params.imageId)
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .maybeSingle();
  if (!image) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase.from("patient_images").delete().eq("id", params.imageId).eq("clinic_id", clinic.id);
  if (error) return NextResponse.json({ error: "delete_failed", message: error.message }, { status: 500 });

  if (image.storage_key) await deletePatientImage(image.storage_key);
  return NextResponse.json({ ok: true });
}

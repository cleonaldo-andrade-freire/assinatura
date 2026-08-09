import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "clinic-logos";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function saveClinicLogo(clinicId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato de imagem não suportado — use PNG, JPEG, WEBP ou SVG.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${clinicId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar logo no Supabase Storage: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  // Adiciona um cache-buster pra imagem atualizar na hora quando a clínica troca o logo.
  return `${data.publicUrl}?v=${Date.now()}`;
}

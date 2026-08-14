import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "patient-images";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Galeria de imagens do paciente — bucket privado, uma chave por arquivo. */
export async function savePatientImage(clinicId: string, patientId: string, imageId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato de imagem não suportado — use PNG, JPEG ou WEBP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Imagem muito grande — o limite é 8MB por arquivo.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${clinicId}/${patientId}/${imageId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar imagem no Supabase Storage: ${error.message}`);
  return key;
}

export async function readPatientImage(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler imagem do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePatientImage(storageKey: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove([storageKey]);
  if (error) console.error("Falha ao excluir imagem do Storage:", error.message);
}

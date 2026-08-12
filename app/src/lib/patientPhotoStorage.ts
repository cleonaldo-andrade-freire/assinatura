import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "patient-photos";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export function contentTypeForKey(storageKey: string): string {
  const ext = storageKey.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/** Foto do paciente — bucket privado, nunca uma URL pública direta (dado sensível pela LGPD). */
export async function savePatientPhoto(clinicId: string, patientId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato de imagem não suportado — use PNG, JPEG ou WEBP.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${clinicId}/${patientId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar a foto no Supabase Storage: ${error.message}`);
  return key;
}

export async function readPatientPhoto(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler a foto do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

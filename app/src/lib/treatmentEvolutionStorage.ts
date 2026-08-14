import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "treatment-evolution-images";

export const MAX_EVOLUTION_IMAGES = 5;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — foto clínica comum, generoso o bastante sem deixar upload gigante

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

/** Imagem de uma evolução — bucket privado, uma chave por arquivo (até 5 por evolução, checado em quem chama). */
export async function saveEvolutionImage(clinicId: string, evolutionId: string, index: number, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato de imagem não suportado — use PNG, JPEG ou WEBP.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Imagem muito grande — o limite é 8MB por arquivo.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${clinicId}/${evolutionId}/${index}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar imagem no Supabase Storage: ${error.message}`);
  return key;
}

export async function readEvolutionImage(storageKey: string): Promise<Buffer> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storageKey);
  if (error || !data) throw new Error(`Falha ao ler imagem do Supabase Storage: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteEvolutionImages(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).remove(storageKeys);
  if (error) console.error("Falha ao excluir imagens de evolução do Storage:", error.message);
}

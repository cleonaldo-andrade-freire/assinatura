import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "profile-avatars";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function saveProfileAvatar(userId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) {
    throw new Error("Formato de imagem não suportado — use PNG, JPEG ou WEBP.");
  }

  const supabase = createSupabaseAdminClient();
  const key = `${userId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar foto no Supabase Storage: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  // Cache-buster — sem isso a foto trocada não atualiza na hora (URL igual à anterior).
  return `${data.publicUrl}?v=${Date.now()}`;
}

import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

/**
 * Sobe o instalador do agente local (agent/dist/AssinaturaDigitalAgent.zip,
 * gerado por `agent/pack.ps1`) pro Supabase Storage e imprime a URL pública
 * — usada pelo botão de download em /dashboard/configuracoes.
 */

const BUCKET = "agent-installer";
const OBJECT_KEY = "AssinaturaDigitalAgent.zip";
const ZIP_PATH = path.resolve(__dirname, "../../agent/dist/AssinaturaDigitalAgent.zip");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Não encontrei ${ZIP_PATH} — rode "powershell -ExecutionPolicy Bypass -File pack.ps1" na pasta agent/ primeiro.`);
  }

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw new Error(`Falha ao listar buckets: ${listError.message}`);

  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
    });
    if (createError) throw new Error(`Falha ao criar o bucket ${BUCKET}: ${createError.message}`);
    console.log(`Bucket "${BUCKET}" criado (público).`);
  }

  const buffer = fs.readFileSync(ZIP_PATH);
  console.log(`Enviando ${OBJECT_KEY} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(OBJECT_KEY, buffer, {
    contentType: "application/zip",
    upsert: true,
  });
  if (uploadError) throw new Error(`Falha no upload: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(OBJECT_KEY);
  console.log("");
  console.log("Enviado com sucesso. URL pública:");
  console.log(data.publicUrl);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

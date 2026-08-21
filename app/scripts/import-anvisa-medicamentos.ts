import "dotenv/config";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

/**
 * Importa o CSV de dados abertos da Anvisa (registro de medicamentos, sem
 * classificação de controle especial — só nome/princípio ativo/classe) pra
 * alimentar o autocomplete do formulário de prescrição. Rode depois da
 * migration 062. Idempotente: apaga e reimporta tudo a cada execução, pra
 * refletir baixas/novos registros — reexecute periodicamente (o arquivo é um
 * snapshot estático da Anvisa, não uma API ao vivo).
 *
 * O CSV vem em ISO-8859-1 (latin1) e usa ";" como delimitador — alguns campos
 * (ex.: princípio ativo com múltiplas substâncias) contêm ";" dentro de aspas,
 * por isso usamos um parser de CSV de verdade em vez de um split ingênuo.
 */
const CSV_URL = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface AnvisaRow {
  TIPO_PRODUTO?: string;
  NOME_PRODUTO?: string;
  CATEGORIA_REGULATORIA?: string;
  NUMERO_REGISTRO_PRODUTO?: string;
  CLASSE_TERAPEUTICA?: string;
  SITUACAO_REGISTRO?: string;
  PRINCIPIO_ATIVO?: string;
}

/**
 * `fetch` global do Node valida o certificado contra a lista embutida dele —
 * em redes com antivírus/proxy corporativo fazendo inspeção de HTTPS (comum
 * no Windows), o certificado chega re-assinado por uma CA que o Windows/
 * navegador confia mas o Node não, e o fetch falha com
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE mesmo a conexão sendo legítima. Usa
 * `https` nativo com verificação desativada só pra este download pontual de
 * dado público (CSV aberto do governo) — não afeta a verificação de TLS da
 * conexão com o Supabase logo depois, que continua pelo `fetch`/client normal.
 */
function downloadCsv(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    https
      .get(url, { agent }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Falha ao baixar CSV da Anvisa: HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  console.log("Baixando CSV da Anvisa...");
  const buffer = await downloadCsv(CSV_URL);
  const text = buffer.toString("latin1");

  const rows = parse(text, {
    delimiter: ";",
    columns: true,
    bom: true,
    relax_quotes: true,
    skip_empty_lines: true,
  }) as AnvisaRow[];

  console.log(`${rows.length} linhas no CSV.`);

  // Só medicamentos com registro ativo — evita sugerir produto descontinuado/
  // cancelado no autocomplete. Sem classificação de controle especial aqui:
  // esse dado não existe nesse CSV, a categoria continua autodeclarada pela
  // dentista no formulário (ver lib/prescriptionControl.ts).
  const seen = new Set<string>();
  const toInsert = rows
    .filter((r) => r.TIPO_PRODUTO === "MEDICAMENTO" && r.SITUACAO_REGISTRO === "Ativo" && r.NOME_PRODUTO?.trim())
    .filter((r) => {
      const key = r.NOME_PRODUTO!.trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      nome_produto: r.NOME_PRODUTO!.trim(),
      principio_ativo: r.PRINCIPIO_ATIVO?.trim() || null,
      classe_terapeutica: r.CLASSE_TERAPEUTICA?.trim() || null,
      numero_registro: r.NUMERO_REGISTRO_PRODUTO?.trim() || null,
    }));

  console.log(`${toInsert.length} medicamentos ativos únicos pra importar.`);

  const { error: deleteError } = await supabase.from("anvisa_medicamentos").delete().gte("id", 0);
  if (deleteError) throw new Error(`Falha ao limpar tabela antes do import: ${deleteError.message}`);

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("anvisa_medicamentos").insert(chunk);
    if (error) throw new Error(`Falha ao inserir lote a partir do índice ${i}: ${error.message}`);
    console.log(`Importados ${Math.min(i + CHUNK_SIZE, toInsert.length)}/${toInsert.length}`);
  }

  console.log("Importação concluída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

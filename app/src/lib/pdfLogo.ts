export interface PdfLogo {
  bytes: Uint8Array;
  format: "png" | "jpg";
}

/** Busca o logo da clínica pra embutir num PDF (atestado ou prescrição) — pdf-lib só embute PNG/JPEG. */
export async function loadClinicLogoForPdf(logoUrl: string | null): Promise<PdfLogo | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    const format = contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : null;
    // webp/svg não são suportados pelo pdf-lib — o PDF sai sem logo nesse caso
    // (mesma tolerância que AssinaturaClient.tsx já tem para SVG).
    if (!format) return null;
    return { bytes: new Uint8Array(await res.arrayBuffer()), format };
  } catch (err) {
    console.error("Falha ao carregar o logo da clínica para o PDF:", err);
    return null;
  }
}

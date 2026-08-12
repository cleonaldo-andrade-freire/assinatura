import QRCode from "qrcode";

/** Gera um QR code PNG localmente (sem chamada de rede) pra embutir num PDF via pdf-lib. */
export async function generateQrCodePng(url: string): Promise<Uint8Array> {
  const buffer = await QRCode.toBuffer(url, { type: "png", width: 240, margin: 1 });
  return new Uint8Array(buffer);
}

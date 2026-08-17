import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

export function addSignaturePlaceholder(
  pdfBuffer: Buffer,
  signatureLength: number = 8192,
  signatureFieldName: string = 'Signature1'
): Buffer {
  // O placeholder-plain apenas anexa o objeto de assinatura visual/invisível no final do PDF
  // Isso é suficiente para PDFs simples gerados sem pdf-lib ou com pdf-lib (antes de assinar)
  
  return plainAddPlaceholder({
    pdfBuffer,
    reason: 'Assinado Digitalmente (ICP-Brasil)',
    signatureLength,
  });
}

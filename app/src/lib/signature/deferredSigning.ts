import forge from "node-forge";
import { Signer } from '@signpdf/utils';
import signpdf from '@signpdf/signpdf';

class HashCaptureSigner extends Signer {
  public capturedPdfBuffer: Buffer | null = null;
  async sign(pdfBuffer: Buffer): Promise<Buffer> {
    this.capturedPdfBuffer = pdfBuffer;
    // Assinatura dummy apenas para o signpdf não quebrar imediatamente
    return Buffer.alloc(16384);
  }
}

/**
 * Monta os atributos assinados de um CMS (PKCS#7) e retorna o Hash SHA-256
 * da sua estrutura ASN.1 DER, que deve ser assinado externamente (ex: pelo Agente).
 *
 * `authAttrsDerBase64` precisa ser persistido (ver `signature_sessions`) e
 * reutilizado bit a bit em `LocalAgentDeferredSigner` — o agente local assina
 * o hash SHA-256 destes bytes exatos, então o CMS final tem que embutir os
 * MESMOS bytes, não uma reconstrução feita depois (ver LocalAgentDeferredSigner.ts).
 */
export async function createDeferredSignatureHash(pdfBuffer: Buffer, certificatePem: string, signingTime: Date): Promise<{ hashToSignBase64: string, authAttrsDerBase64: string }> {
    // 1. Extrai o ByteRange final (sem os zeros e com o offset corrigido) —
    // são exatamente esses bytes que o CMS precisa cobrir (messageDigest),
    // não o PDF original com o placeholder ainda intacto.
    const capturer = new HashCaptureSigner();
    try {
        await signpdf.sign(pdfBuffer, capturer);
    } catch (e) {
        // O signpdf pode reclamar do tamanho do dummy no final, mas o buffer já foi capturado.
    }

    if (!capturer.capturedPdfBuffer) {
        throw new Error("Falha ao calcular o ByteRange do PDF para assinatura.");
    }

    const finalPdfBuffer = capturer.capturedPdfBuffer;

    const p7 = forge.pkcs7.createSignedData();
    // IMPORTANTE: o conteúdo hasheado pelo CMS (messageDigest) tem que ser o
    // recorte real coberto pelo /ByteRange (finalPdfBuffer), não o PDF
    // original com placeholder — caso contrário o messageDigest embutido não
    // bate com o que qualquer validador recalcula a partir do PDF final.
    p7.content = forge.util.createBuffer(finalPdfBuffer.toString('binary'));
    const certsPemArray = certificatePem.split('-----END CERTIFICATE-----')
      .map(c => c.trim())
      .filter(c => c.length > 0)
      .map(c => c + '\n-----END CERTIFICATE-----');

    // Adiciona todos os certificados da cadeia no P7
    for (const pem of certsPemArray) {
      p7.addCertificate(pem);
    }

    // O signatário principal é o primeiro certificado da cadeia
    const cert = forge.pki.certificateFromPem(certsPemArray[0]);

    // Configurar os atributos assinados (CMS)
    const authenticatedAttributes = [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
        // será calculado e preenchido automaticamente pelo p7.sign()
      },
      {
        type: forge.pki.oids.signingTime,
        value: signingTime, // node-forge converte Date para ASN1 internamente
      },
    ];

    p7.addSigner({
      key: forge.pki.rsa.generateKeyPair({ bits: 1024 }).privateKey, // Chave dummy apenas para o node-forge gerar a estrutura
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: authenticatedAttributes as any,
    });

    p7.sign({ detached: true });

    // Obter os atributos assinados em DER reais que o node-forge gerou
    const p7Asn1 = p7.toAsn1() as any;

    // Navega na árvore ASN.1 para encontrar os AuthenticatedAttributes
    // ContentInfo -> [1] -> SignedData
    const signedData = p7Asn1.value[1].value[0];

    // O último elemento de SignedData é o SET de SignerInfos
    const signerInfos = signedData.value[signedData.value.length - 1];

    // Pega o primeiro SignerInfo
    const signerInfoNode = signerInfos.value[0];

    // Encontra o node CONTEXT_SPECIFIC tag 0 (authenticatedAttributes)
    const authAttrsNode = signerInfoNode.value.find((n: any) =>
      n.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && n.type === 0
    );

    if (!authAttrsNode) {
      throw new Error("Atributos assinados não encontrados na árvore ASN.1");
    }

    // DER exige que os elementos de um SET OF estejam em ordem canônica
    // (bytes da codificação DER de cada elemento, ordem crescente) — não a
    // ordem em que foram adicionados. O node-forge NÃO faz essa ordenação
    // sozinha (só empilha na ordem que os atributos foram passados pra
    // addSigner). Validadores estritos como o do ITI recalculam o hash sobre
    // a versão canonicamente ordenada; se a nossa não estiver ordenada assim,
    // o hash que o agente assinou nunca vai bater com o que o validador
    // recalcula — isso por si só já derruba a assinatura ("Cifra
    // assimétrica: Reprovada"), mesmo com messageDigest e todo o resto certos.
    const sortedAttrs = [...authAttrsNode.value].sort((a: any, b: any) => {
      const derA = forge.asn1.toDer(a).getBytes();
      const derB = forge.asn1.toDer(b).getBytes();
      return derA < derB ? -1 : derA > derB ? 1 : 0;
    });

    // Para o hash matemático, o PKCS#7 exige que a tag seja SET (0x31) em vez de CONTEXT_SPECIFIC (0xA0)
    const authAttrsForHash = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      sortedAttrs
    );

    const authAttrsDer = forge.asn1.toDer(authAttrsForHash).getBytes();

    const mdAuth = forge.md.sha256.create();
    mdAuth.update(authAttrsDer);
    const hashToSignBase64 = forge.util.encode64(mdAuth.digest().getBytes());

    const authAttrsDerBase64 = Buffer.from(authAttrsDer, 'binary').toString('base64');

    return { hashToSignBase64, authAttrsDerBase64 };
}

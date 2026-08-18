import { Signer } from '@signpdf/utils';
import forge from 'node-forge';

/**
 * Injeta no PDF a assinatura calculada externamente (pelo agente local, com a
 * chave privada real do certificado ICP-Brasil).
 *
 * ATENÇÃO: node-forge "assa" a árvore ASN.1 do SignerInfo dentro de
 * `p7.sign()` — nesse momento ele já serializa `signer.signature` (que só
 * temos disponível como uma chave RSA descartável, gerada localmente só pra
 * satisfazer a API do forge) dentro do node ASN.1 do SignerInfo. Reatribuir
 * `signer.signature` depois (como o código fazia antes) NÃO tem efeito
 * nenhum no resultado de `p7.toAsn1()`, porque o node ASN.1 já foi montado
 * com o valor antigo — o PDF final saía sempre assinado pela chave
 * descartável, nunca pela chave real do certificado. É exatamente o motivo
 * do relatório do ITI reportar "Cifra assimétrica: Reprovada".
 *
 * Por isso aqui montamos o SignerInfo à mão, usando os bytes EXATOS de
 * `authenticatedAttributes` (`authAttrsDerBase64`) que foram hasheados e
 * assinados pelo agente em `createDeferredSignatureHash` — não uma
 * reconstrução feita agora, que poderia divergir bit a bit (mesmo que por
 * pouco) do que foi realmente assinado.
 */
export class LocalAgentDeferredSigner extends Signer {
  private certificatePem: string;
  private authAttrsDer: string; // string binária (forge byte string) — DER exato hasheado/assinado
  private signatureBase64: string;

  constructor(certificatePem: string, authAttrsDerBase64: string, signatureBase64: string) {
    super();
    this.certificatePem = certificatePem;
    this.authAttrsDer = Buffer.from(authAttrsDerBase64, 'base64').toString('binary');
    this.signatureBase64 = signatureBase64;
  }

  async sign(pdfBuffer: Buffer): Promise<Buffer> {
    const certsPemArray = this.certificatePem.split('-----END CERTIFICATE-----')
      .map(c => c.trim())
      .filter(c => c.length > 0)
      .map(c => c + '\n-----END CERTIFICATE-----');

    const cert = forge.pki.certificateFromPem(certsPemArray[0]);

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    for (const pem of certsPemArray) {
      p7.addCertificate(pem);
    }

    // Precisamos que o forge monte ContentInfo/detachedContent e
    // digestAlgorithmIdentifiers (só acontece dentro de p7.sign()). Usamos
    // uma chave descartável só pra isso — o SignerInfo que sair daqui é
    // completamente substituído logo abaixo.
    p7.addSigner({
      key: forge.pki.rsa.generateKeyPair({ bits: 1024 }).privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
      ] as any,
    });
    p7.sign({ detached: true });

    // Re-tageia o SET universal (0x31) de volta pra [0] IMPLICIT
    // (CONTEXT_SPECIFIC), como o PKCS#7/CMS exige dentro do SignerInfo.
    const authAttrsSet = forge.asn1.fromDer(this.authAttrsDer) as any;
    const authenticatedAttributesAsn1 = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      authAttrsSet.value
    );

    const signatureBytes = Buffer.from(this.signatureBase64, 'base64').toString('binary');

    // Réplica exata da estrutura que node-forge usa internamente para
    // SignerInfo (ver `_signerToAsn1` em node_modules/node-forge/lib/pkcs7.js),
    // trocando apenas authenticatedAttributes e encryptedDigest pelos valores
    // reais vindos do agente.
    const signerInfoAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      // version
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
        forge.asn1.integerToDer(1).getBytes()),
      // issuerAndSerialNumber
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.pki.distinguishedNameToAsn1({ attributes: cert.issuer.attributes }),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
          forge.util.hexToBytes(cert.serialNumber)),
      ]),
      // digestAlgorithm
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
          forge.asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
      // authenticatedAttributes [0] IMPLICIT — bytes exatos assinados pelo agente
      authenticatedAttributesAsn1,
      // digestEncryptionAlgorithm
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
          forge.asn1.oidToDer(forge.pki.oids.rsaEncryption).getBytes()),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
      // encryptedDigest — assinatura real, calculada pelo agente com a chave do certificado
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, signatureBytes),
    ]);

    (p7 as any).signerInfos = [signerInfoAsn1];

    const p7Asn1 = p7.toAsn1();
    const p7Der = forge.asn1.toDer(p7Asn1).getBytes();

    return Buffer.from(p7Der, 'binary');
  }
}

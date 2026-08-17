import { Signer } from '@signpdf/utils';
import forge from 'node-forge';
import { PscClient } from './PscClient';

export class PscSigner extends Signer {
  private pscClient: PscClient;
  private accessToken: string;
  private certificateAlias: string;
  private certificatePem: string;

  private mockPrivateKeyPem?: string;

  constructor(
    pscClient: PscClient,
    accessToken: string,
    certificateAlias: string,
    certificatePem: string,
    mockPrivateKeyPem?: string
  ) {
    super();
    this.pscClient = pscClient;
    this.accessToken = accessToken;
    this.certificateAlias = certificateAlias;
    this.certificatePem = certificatePem;
    this.mockPrivateKeyPem = mockPrivateKeyPem;
  }

  async sign(pdfBuffer: Buffer): Promise<Buffer> {
    // 1. Calcular o SHA-256 do PDF (que é o conteúdo assinado no PAdES)
    const md = forge.md.sha256.create();
    md.update(pdfBuffer.toString('binary'));
    
    // 2. Criar a estrutura PKCS#7 / CMS
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));
    
    // Adiciona o certificado público
    p7.addCertificate(this.certificatePem);
    
    // Configura o signer (mas sem chave privada, pois vamos assinar remotamente)
    // O node-forge não suporta deferred signing nativamente, então construímos os atributos autenticados na mão
    const cert = forge.pki.certificateFromPem(this.certificatePem);
    
    // Gerar os authenticatedAttributes padrão
    const authenticatedAttributes = [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
        value: md.digest().getBytes(),
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date(),
      },
    ];

    // Converter para ASN.1 para obter o hash
    const authAttrsAsn1 = forge.pki.certificateToAsn1(cert); // dummy call to get access to asn1 methods? No.
    
    // O node-forge tem um método interno para criar o set de atributos
    p7.addSigner({
      key: forge.pki.rsa.generateKeyPair({ bits: 1024 }).privateKey, // Chave dummy apenas para o node-forge não quebrar
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: authenticatedAttributes as any,
    });

    // O método sign() do p7 preenche os signers com os atributos e assina. 
    // Vamos chamar o sign() para ele gerar a estrutura ASN.1 interna.
    p7.sign({ detached: true });

    // Após o p7.sign(), p7.signers[0] tem os atributos autenticados formatados em ASN.1 
    // no campo authenticatedAttributesAsn1.
    // Vamos extrair o array de atributos para calcular o hash real que vai pro PSC usando um SET.
    const signerInfo = (p7 as any).signers[0];
    const authAttrsSetAsn1 = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      signerInfo.authenticatedAttributesAsn1.value
    );
    
    // O hash a ser assinado pelo PSC é o SHA-256 da codificação DER desse SET OF attributes
    const authAttrsDer = forge.asn1.toDer(authAttrsSetAsn1).getBytes();
    const hashToSign = forge.md.sha256.create().update(authAttrsDer).digest().toHex();
    const hashToSignBase64 = Buffer.from(hashToSign, 'hex').toString('base64');

    let signatureBase64 = '';
    
    if (this.mockPrivateKeyPem) {
      // MODO DE TESTE LOCAL
      const privateKey = forge.pki.privateKeyFromPem(this.mockPrivateKeyPem);
      const mdSign = forge.md.sha256.create();
      mdSign.update(authAttrsDer);
      const signature = privateKey.sign(mdSign, 'RSASSA-PKCS1-V1_5');
      signatureBase64 = Buffer.from(signature, 'binary').toString('base64');
    } else {
      // 3. Enviar o hash para o PSC assinar via API
      signatureBase64 = await this.pscClient.signHash(
        this.accessToken,
        this.certificateAlias,
        hashToSignBase64,
        'SHA256withRSA'
      );
    }

    // 4. Injetar a assinatura real na estrutura ASN.1 do p7
    const signatureBytes = Buffer.from(signatureBase64, 'base64').toString('binary');
    signerInfo.signature = signatureBytes;

    // 5. Converter o p7 modificado para DER (Buffer) para injetar no PDF
    const p7Asn1 = p7.toAsn1();
    const p7Der = forge.asn1.toDer(p7Asn1).getBytes();
    
    return Buffer.from(p7Der, 'binary');
  }
}

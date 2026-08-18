using System;
using System.Collections.Generic;
using System.Formats.Asn1;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;

namespace Agent.Services
{
    public class WindowsStoreProvider : ICertificateProvider
    {
        public List<CertificateInfo> GetCertificates()
        {
            var results = new List<CertificateInfo>();

            using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);

            foreach (var cert in store.Certificates)
            {
                if (!cert.HasPrivateKey) continue;
                if (DateTime.Now < cert.NotBefore || DateTime.Now > cert.NotAfter) continue;

                // Verifica KeyUsage (digitalSignature ou nonRepudiation)
                bool hasKeyUsage = false;
                foreach (var ext in cert.Extensions)
                {
                    if (ext is X509KeyUsageExtension kuExt)
                    {
                        if ((kuExt.KeyUsages & X509KeyUsageFlags.DigitalSignature) != 0 ||
                            (kuExt.KeyUsages & X509KeyUsageFlags.NonRepudiation) != 0)
                        {
                            hasKeyUsage = true;
                            break;
                        }
                    }
                }
                if (!hasKeyUsage) continue;

                // Só ICP-Brasil de verdade: a cadeia inteira (raiz + AC
                // intermediária) tem que chegar em O=ICP-Brasil (obrigatório
                // por regulação do ITI, vale pra qualquer AC — Certisign,
                // Valid, Serasa etc). Isso descarta certificados autoassinados
                // de dev/SSL local (ex.: "localhost", certs de teste do IIS
                // Express) que também têm KeyUsage de assinatura mas não tem
                // nada a ver com ICP-Brasil.
                var chainElements = BuildChainElements(cert);
                bool isIcpBrasil = chainElements.Any(e =>
                    e.Certificate.Subject.Contains("ICP-Brasil", StringComparison.OrdinalIgnoreCase) ||
                    e.Certificate.Issuer.Contains("ICP-Brasil", StringComparison.OrdinalIgnoreCase));
                if (!isIcpBrasil) continue;

                var cpf = ExtractCpfFromSubjectAltName(cert);
                if (string.IsNullOrEmpty(cpf))
                {
                    cpf = "Não identificado";
                }

                var cn = ExtractCommonName(cert.Subject);
                var issuerCn = ExtractCommonName(cert.Issuer);

                var rsa = cert.GetRSAPublicKey();
                var keyAlgorithm = rsa != null ? "RSA" : "UNKNOWN";
                var keySize = rsa?.KeySize ?? 0;

                results.Add(new CertificateInfo
                {
                    Thumbprint = cert.Thumbprint,
                    SubjectCommonName = cn,
                    HolderName = cn.Split(':').FirstOrDefault()?.Trim() ?? cn,
                    HolderCpf = cpf,
                    Issuer = issuerCn,
                    NotBefore = cert.NotBefore.ToUniversalTime(),
                    NotAfter = cert.NotAfter.ToUniversalTime(),
                    CertificateChainBase64 = chainElements.Select(e => Convert.ToBase64String(e.Certificate.RawData)).ToList(),
                    KeyAlgorithm = keyAlgorithm,
                    KeySize = keySize
                });
            }

            return results;
        }

        public string SignHash(string thumbprint, string hashBase64, string hashAlgorithm, string signaturePadding)
        {
            using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);

            var certCollection = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, false);
            if (certCollection.Count == 0)
                throw new Exception($"Certificado {thumbprint} não encontrado.");

            var cert = certCollection[0];
            using var rsa = cert.GetRSAPrivateKey();
            if (rsa == null)
                throw new Exception("O certificado selecionado não possui chave privada RSA acessível.");

            var hashBytes = Convert.FromBase64String(hashBase64);

            HashAlgorithmName algName = hashAlgorithm.ToUpper() switch
            {
                "SHA256" => HashAlgorithmName.SHA256,
                "SHA384" => HashAlgorithmName.SHA384,
                "SHA512" => HashAlgorithmName.SHA512,
                _ => HashAlgorithmName.SHA256
            };

            RSASignaturePadding padding = signaturePadding.ToUpper() switch
            {
                "PKCS1" => RSASignaturePadding.Pkcs1,
                "PSS" => RSASignaturePadding.Pss,
                _ => RSASignaturePadding.Pkcs1
            };

            var signatureBytes = rsa.SignHash(hashBytes, algName, padding);
            return Convert.ToBase64String(signatureBytes);
        }

        // OID do ICP-Brasil OtherName pra e-CPF (DOC-ICP-04): dentro do SAN, um
        // GeneralName otherName cujo value é uma string de 45 caracteres —
        // 8 (data nasc. DDMMAAAA) + 11 (CPF) + 11 (NIS) + 15 (RG, com padding).
        private const string IcpBrasilCpfOid = "2.16.76.1.3.1";

        private string ExtractCpfFromSubjectAltName(X509Certificate2 cert)
        {
            foreach (var ext in cert.Extensions)
            {
                if (ext.Oid?.Value != "2.5.29.17") continue; // Subject Alternative Name

                try
                {
                    var sanReader = new AsnReader(ext.RawData, AsnEncodingRules.BER);
                    var generalNames = sanReader.ReadSequence();

                    while (generalNames.HasData)
                    {
                        var tag = generalNames.PeekTag();

                        // GeneralName ::= CHOICE { otherName [0] OtherName, ... }
                        // (tag [0] IMPLICIT — substitui o SEQUENCE do OtherName)
                        if (tag.TagClass != TagClass.ContextSpecific || tag.TagValue != 0)
                        {
                            generalNames.ReadEncodedValue();
                            continue;
                        }

                        var otherName = generalNames.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
                        var oid = otherName.ReadObjectIdentifier();
                        if (oid != IcpBrasilCpfOid)
                        {
                            continue; // outros OtherName do ICP-Brasil (NIS, RG, título de eleitor etc.) — ignora
                        }

                        // OtherName.value ::= [0] EXPLICIT ANY DEFINED BY type-id
                        var explicitWrapper = otherName.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
                        var value = ReadAnyStringValue(explicitWrapper);

                        if (value.Length >= 19)
                        {
                            return value.Substring(8, 11);
                        }
                    }
                }
                catch
                {
                    // Extensão SAN em formato inesperado — não deve derrubar a
                    // listagem de certificados, só fica sem CPF identificado.
                }
            }
            return string.Empty;
        }

        /// <summary>
        /// Lê o conteúdo de um valor ASN.1 como texto, aceitando os tipos de
        /// string que diferentes ACs usam pra esse campo (OctetString na
        /// Certisign/AC VALID, mas outras ACs podem usar PrintableString/
        /// UTF8String/IA5String).
        /// </summary>
        private static string ReadAnyStringValue(AsnReader reader)
        {
            var tag = reader.PeekTag();
            if (tag.TagClass == TagClass.Universal)
            {
                switch ((UniversalTagNumber)tag.TagValue)
                {
                    case UniversalTagNumber.UTF8String:
                        return reader.ReadCharacterString(UniversalTagNumber.UTF8String);
                    case UniversalTagNumber.PrintableString:
                        return reader.ReadCharacterString(UniversalTagNumber.PrintableString);
                    case UniversalTagNumber.IA5String:
                        return reader.ReadCharacterString(UniversalTagNumber.IA5String);
                    case UniversalTagNumber.BMPString:
                        return reader.ReadCharacterString(UniversalTagNumber.BMPString);
                    case UniversalTagNumber.OctetString:
                        return Encoding.ASCII.GetString(reader.ReadOctetString());
                }
            }
            return Encoding.ASCII.GetString(reader.ReadEncodedValue().ToArray());
        }

        private string ExtractCommonName(string subjectOrIssuer)
        {
            var match = Regex.Match(subjectOrIssuer, @"CN=([^,]+)");
            return match.Success ? match.Groups[1].Value : subjectOrIssuer;
        }

        private List<X509ChainElement> BuildChainElements(X509Certificate2 cert)
        {
            var chain = new X509Chain();
            chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
            chain.Build(cert);
            return chain.ChainElements.Cast<X509ChainElement>().ToList();
        }
    }
}

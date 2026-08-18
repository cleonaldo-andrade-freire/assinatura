using System;
using System.Collections.Generic;

namespace Agent.Services
{
    public class CertificateInfo
    {
        public string Thumbprint { get; set; } = string.Empty;
        public string SubjectCommonName { get; set; } = string.Empty;
        public string HolderName { get; set; } = string.Empty;
        public string HolderCpf { get; set; } = string.Empty;
        public string Issuer { get; set; } = string.Empty;
        public DateTime NotBefore { get; set; }
        public DateTime NotAfter { get; set; }
        public List<string> CertificateChainBase64 { get; set; } = new();
        public string KeyAlgorithm { get; set; } = string.Empty;
        public int KeySize { get; set; }
    }

    public interface ICertificateProvider
    {
        List<CertificateInfo> GetCertificates();
        string SignHash(string thumbprint, string hashBase64, string hashAlgorithm, string signaturePadding);
    }
}

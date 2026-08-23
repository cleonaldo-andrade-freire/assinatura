import { TermoAssinaturaClient } from "./TermoAssinaturaClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termo de Adesão Eletrônica",
  robots: { index: false, follow: false },
};

export default function TermoAssinaturaPage({ params }: { params: { token: string } }) {
  return <TermoAssinaturaClient token={params.token} />;
}

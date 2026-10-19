import { Suspense } from "react";
import { EvolucaoAssinaturaClient } from "./EvolucaoAssinaturaClient";
import { clinicLinkPreview } from "@/lib/linkPreview";

export function generateMetadata({ searchParams }: { searchParams: { token?: string } }) {
  return clinicLinkPreview("evolucao", searchParams.token);
}

export default function EvolucaoAssinaturaPage() {
  return (
    <Suspense fallback={null}>
      <EvolucaoAssinaturaClient />
    </Suspense>
  );
}

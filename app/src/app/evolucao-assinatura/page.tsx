import { Suspense } from "react";
import { EvolucaoAssinaturaClient } from "./EvolucaoAssinaturaClient";

export default function EvolucaoAssinaturaPage() {
  return (
    <Suspense fallback={null}>
      <EvolucaoAssinaturaClient />
    </Suspense>
  );
}

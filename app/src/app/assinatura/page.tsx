import { Suspense } from "react";
import { AssinaturaClient } from "./AssinaturaClient";
import { clinicLinkPreview } from "@/lib/linkPreview";

export function generateMetadata({ searchParams }: { searchParams: { token?: string } }) {
  return clinicLinkPreview("anamnese", searchParams.token);
}

export default function AssinaturaPage() {
  return (
    <Suspense fallback={null}>
      <AssinaturaClient />
    </Suspense>
  );
}

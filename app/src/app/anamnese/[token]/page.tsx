import { Suspense } from "react";
import { AnamneseClient } from "./AnamneseClient";
import { clinicLinkPreview } from "@/lib/linkPreview";

export function generateMetadata({ params }: { params: { token: string } }) {
  return clinicLinkPreview("anamnese", params.token);
}

export default function AnamnesePage({ params }: { params: { token: string } }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#f7f9fa]"><p className="text-gray-500 animate-pulse">Carregando...</p></div>}>
      <AnamneseClient token={params.token} />
    </Suspense>
  );
}

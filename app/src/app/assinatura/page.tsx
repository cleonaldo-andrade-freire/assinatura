import { Suspense } from "react";
import { AssinaturaClient } from "./AssinaturaClient";

export default function AssinaturaPage() {
  return (
    <Suspense fallback={null}>
      <AssinaturaClient />
    </Suspense>
  );
}

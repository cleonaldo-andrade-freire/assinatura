"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export interface SignaturePoint {
  x: number;
  y: number;
  /** Offset em ms desde o primeiro ponto do primeiro traço — não depende do relógio do dispositivo. */
  t: number;
  /** `event.pressure` — `null` quando o dispositivo não reporta (nunca inventamos 0.5). */
  p: number | null;
}

export interface SignatureStroke {
  index: number;
  points: SignaturePoint[];
}

export interface SignatureStrokeData {
  schema: "tracado/v1";
  canvas: { cssWidth: number; cssHeight: number; dpr: number };
  capturedAt: string;
  pointerType: string;
  strokes: SignatureStroke[];
  metrics: {
    durationTotalMs: number;
    pointsTotal: number;
    numStrokes: number;
    bbox: { x: number; y: number; w: number; h: number };
  };
}

export interface SignatureResult {
  /** PNG do traço, só pra pré-visualização/embutir no PDF — a prova de
   * verdade é `strokeData`, os pontos brutos. */
  dataUrl: string;
  strokeData: SignatureStrokeData;
}

const MIN_POINTS = 8;
const MIN_DURATION_MS = 300;
const MIN_BBOX_WIDTH_RATIO = 0.15;

/**
 * Canvas de assinatura com captura vetorial (Pointer Events: x, y, tempo,
 * pressão) — não só o PNG achatado. Compartilhado entre a assinatura da
 * anamnese e a da evolução clínica; qualquer terceiro fluxo de assinatura
 * reaproveita este componente em vez de duplicar a lógica de captura.
 *
 * Rejeita traços degenerados (poucos pontos, muito rápido, ou muito
 * pequeno) — um clique único não é uma assinatura.
 */
export function SignatureCanvas({ onChange, height = 160 }: { onChange: (result: SignatureResult | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);
  const currentStrokeRef = useRef<SignatureStroke | null>(null);
  const startTimeRef = useRef(0);
  const pointerTypeRef = useRef("unknown");
  const [isEmpty, setIsEmpty] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function toCanvasPoint(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Coordenadas do evento vêm em pixels de CSS; o canvas pode ter
    // resolução interna diferente (devicePixelRatio) — sem essa escala, o
    // traço desenhado fica deslocado/errado em qualquer tela que não seja
    // 1:1 entre pixel de CSS e pixel de canvas.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    if (strokesRef.current.length === 0) startTimeRef.current = performance.now();
    pointerTypeRef.current = e.pointerType || "unknown";
    const { x, y } = toCanvasPoint(e);
    const point: SignaturePoint = { x, y, t: Math.round(performance.now() - startTimeRef.current), p: e.pressure > 0 ? e.pressure : null };
    currentStrokeRef.current = { index: strokesRef.current.length, points: [point] };
    setError(null);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!currentStrokeRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = toCanvasPoint(e);
    currentStrokeRef.current.points.push({ x, y, t: Math.round(performance.now() - startTimeRef.current), p: e.pressure > 0 ? e.pressure : null });
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = "#1e2b27";
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    setIsEmpty(false);
  }

  function handlePointerUp() {
    if (!currentStrokeRef.current) return;
    strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
    currentStrokeRef.current = null;
    emitChange();
  }

  function emitChange() {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) {
      onChange(null);
      return;
    }
    const allPoints = strokesRef.current.flatMap((s) => s.points);
    const pointsTotal = allPoints.length;
    const durationTotalMs = allPoints[allPoints.length - 1]?.t ?? 0;
    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);
    const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };

    if (pointsTotal < MIN_POINTS || durationTotalMs < MIN_DURATION_MS || bbox.w < canvas.width * MIN_BBOX_WIDTH_RATIO) {
      setError("Não consegui capturar sua assinatura. Tente novamente com um traço maior.");
      onChange(null);
      return;
    }

    const strokeData: SignatureStrokeData = {
      schema: "tracado/v1",
      canvas: { cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: window.devicePixelRatio || 1 },
      capturedAt: new Date().toISOString(),
      pointerType: pointerTypeRef.current,
      strokes: strokesRef.current,
      metrics: { durationTotalMs, pointsTotal, numStrokes: strokesRef.current.length, bbox },
    };
    onChange({ dataUrl: canvas.toDataURL("image/png"), strokeData });
  }

  function handleClear() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setIsEmpty(true);
    setError(null);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={height * 2}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: "100%",
          height,
          touchAction: "none",
          background: "#fff",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--radius-sm)",
          cursor: "crosshair",
          display: "block",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: 12.5, margin: 0 }}>{error}</p>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>Assine com o dedo na área acima</span>
        )}
        <button
          type="button"
          onClick={handleClear}
          disabled={isEmpty}
          style={{
            border: "1px solid var(--line)",
            background: "transparent",
            color: "var(--ink-soft)",
            borderRadius: "var(--radius-sm)",
            padding: "5px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: isEmpty ? "not-allowed" : "pointer",
            opacity: isEmpty ? 0.5 : 1,
          }}
        >
          Limpar
        </button>
      </div>
    </div>
  );
}

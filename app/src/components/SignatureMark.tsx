export function SignatureMark({ size = 40, color = "var(--sign)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * (2 / 3)} viewBox="0 0 72 48" fill="none" aria-hidden="true">
      <path
        d="M6 34C14 14 20 10 26 20C31 28 33 16 40 14C47 12 46 26 53 24C58 22.5 60 18 66 16"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

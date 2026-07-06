export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="brand-mark inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 40" className="h-full w-full" role="img">
        <defs>
          <linearGradient id="brand-mark-gradient" x1="8" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#34D399" />
            <stop offset="0.58" stopColor="#2DD4BF" />
            <stop offset="1" stopColor="#6366F1" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="10" fill="#12151C" stroke="rgba(255,255,255,0.12)" />
        <path
          d="M15.5 12.5h-2.25c-2.35 0-4.25 1.9-4.25 4.25v6.5c0 2.35 1.9 4.25 4.25 4.25h2.25"
          fill="none"
          stroke="url(#brand-mark-gradient)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M24.5 12.5h2.25c2.35 0 4.25 1.9 4.25 4.25v6.5c0 2.35-1.9 4.25-4.25 4.25H24.5"
          fill="none"
          stroke="url(#brand-mark-gradient)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path d="M15.5 20h9" stroke="#F5F7FA" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M20 15.5v9" stroke="#34D399" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

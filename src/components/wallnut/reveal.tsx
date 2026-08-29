import type { CSSProperties, ReactNode } from "react";

export function Reveal({
  children,
  className = "",
  delayMs = 0,
  dramatic = false,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  dramatic?: boolean;
}) {
  const style: CSSProperties = { animationDelay: `${delayMs}ms` };

  return (
    <div
      className={`${dramatic ? "wallnut-reveal-dramatic" : "wallnut-reveal"} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

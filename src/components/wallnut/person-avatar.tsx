"use client";

import { useEffect, useState } from "react";
import { avatarInitials, avatarPalette } from "@/components/wallnut/avatar";

export function PersonAvatar({
  label,
  src,
  size = 36,
  className = "",
}: {
  label: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [status, setStatus] = useState<"idle" | "loaded" | "error">(
    src ? "idle" : "error",
  );
  const palette = avatarPalette(label);
  const showImage = Boolean(src) && status !== "error";

  useEffect(() => {
    setStatus(src ? "idle" : "error");
  }, [src]);

  return (
    <span
      aria-label={label || "Unknown member"}
      className={`relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold ring-[1.5px] ring-black ${className}`}
      style={{
        width: size,
        height: size,
        background: palette.background,
        color: palette.foreground,
        fontSize: Math.max(9, Math.round(size * 0.29)),
      }}
    >
      {status !== "loaded" ? avatarInitials(label, size) : null}
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          className={`absolute inset-0 size-full object-cover ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      ) : null}
    </span>
  );
}

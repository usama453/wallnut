const PALETTES = [
  { background: "#5b4fcf", foreground: "#d8d3f9" },
  { background: "#2d6a4f", foreground: "#b7e4c7" },
  { background: "#8b4513", foreground: "#f4c49a" },
  { background: "#1a5276", foreground: "#a9cce3" },
  { background: "#6b2d5e", foreground: "#e8b4df" },
  { background: "#3d5a80", foreground: "#caddf0" },
  { background: "#9b2226", foreground: "#f5c2c4" },
  { background: "#4a4e69", foreground: "#e1e2ea" },
] as const;

export function initialsFor(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return "?";

  if (text.startsWith("+") || /^\d[\d\s()-]+$/.test(text)) {
    const digits = text.replace(/\D/g, "");
    return digits.slice(-2) || "?";
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
}

/** Single-letter avatar label for compact stacks and small avatars. */
export function compactInitialFor(value: string | null | undefined) {
  const initials = initialsFor(value);
  return initials.slice(0, 1) || "?";
}

export function avatarInitials(value: string | null | undefined, size: number) {
  return size <= 30 ? compactInitialFor(value) : initialsFor(value);
}

export function avatarPalette(seed: string | null | undefined) {
  let hash = 0;
  for (const char of seed ?? "") hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length]!;
}

export function InitialAvatar({
  label,
  size = 36,
  className = "",
  style,
}: {
  label: string | null | undefined;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const palette = avatarPalette(label);

  return (
    <span
      aria-label={label || "Unknown member"}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold ring-[1.5px] ring-black ${className}`}
      style={{
        width: size,
        height: size,
        background: palette.background,
        color: palette.foreground,
        fontSize: Math.max(9, Math.round(size * 0.29)),
        ...style,
      }}
    >
      {avatarInitials(label, size)}
    </span>
  );
}

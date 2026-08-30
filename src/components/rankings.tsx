"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PersonAvatar } from "@/components/wallnut/person-avatar";
import { avatarPalette } from "@/components/wallnut/avatar";
import { BackIcon } from "@/components/wallnut/icons";
import { MetricChip } from "@/components/wallnut/metric-chip";
import { Reveal } from "@/components/wallnut/reveal";
import { orgHomePath } from "@/lib/org-paths";
import type { PersonStats } from "@/lib/stats";

export function Rankings({
  orgName,
  orgSlug,
  byTypos,
  byUploads,
  totals,
}: {
  orgName: string;
  orgSlug?: string | null;
  byTypos: PersonStats[];
  byUploads: PersonStats[];
  totals: {
    uploads: number;
    typos: number;
    people: number;
    checked: number;
    avgScore: number | null;
  };
}) {
  const [stage, setStage] = useState<"hero" | "celebrate" | "rest">("hero");
  const champion = byTypos[0] ?? byUploads[0] ?? null;

  useEffect(() => {
    if (
      !champion ||
      champion.typos === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setStage("rest");
      return;
    }
    const celebrate = window.setTimeout(() => setStage("celebrate"), 1100);
    const reveal = window.setTimeout(() => setStage("rest"), 2850);
    return () => {
      window.clearTimeout(celebrate);
      window.clearTimeout(reveal);
    };
  }, [champion]);

  if (!champion) {
    return (
      <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center text-center">
        <h1 className="text-[27px] font-bold tracking-[-0.72px]">Rankings</h1>
        <p className="mt-3 text-[12px] text-[#919191]">
          Rankings will appear after a WhatsApp group is linked.
        </p>
        <Link href={orgSlug ? orgHomePath(orgSlug) : "/"} className="mt-6 text-[12px] text-[#919191] hover:text-white">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-7rem)] overflow-hidden">
      <Confetti active={stage === "celebrate"} />
      <Link
        href={orgSlug ? orgHomePath(orgSlug) : "/"}
        className="absolute left-0 top-0 z-20 flex items-center gap-1 text-[12px] text-[#919191] transition hover:text-white"
      >
        <BackIcon />
        Back
      </Link>

      {stage !== "rest" ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="origin-center scale-[1.35]">
            <Champion person={champion} animated />
          </div>
        </div>
      ) : (
        <div className="flex min-h-[calc(100vh-7rem)] flex-col items-center justify-center py-10">
          <Reveal>
            <h1 className="text-center text-[27px] font-bold leading-none tracking-[-0.72px]">
              Rankings
            </h1>
          </Reveal>
          <Reveal delayMs={100}>
            <p className="mt-2.5 text-[12px] text-[#919191]">{orgName}</p>
          </Reveal>

          <div className="mt-7">
            <Champion person={champion} />
          </div>

          <div className="mt-8 grid w-full max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-2">
            <Reveal delayMs={120}>
              <Leaderboard
                title="Typos Rank"
                rows={byTypos.slice(1)}
                value={(person) => `${person.typos} typo${person.typos === 1 ? "" : "s"}`}
                startRank={2}
              />
            </Reveal>
            <Reveal delayMs={220}>
              <Leaderboard
                title="Designs Uploaded Rank"
                rows={byUploads}
                value={(person) => `${person.uploads} uploaded`}
              />
            </Reveal>
          </div>

          <div className="mt-4 flex w-full max-w-[720px] flex-wrap items-center justify-center gap-2">
            <Reveal delayMs={300}>
              <MetricChip value={totals.typos} label="issues found" />
            </Reveal>
            <Reveal delayMs={360}>
              <MetricChip value={totals.uploads} label="designs sent" />
            </Reveal>
            <Reveal delayMs={420}>
              <MetricChip value={totals.checked} label="reports checked" />
            </Reveal>
            <Reveal delayMs={480}>
              <MetricChip value={totals.people} label="contributors" />
            </Reveal>
            {totals.avgScore != null ? (
              <Reveal delayMs={540}>
                <MetricChip value={`${totals.avgScore}/100`} label="average score" />
              </Reveal>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Champion({
  person,
  animated = false,
}: {
  person: PersonStats;
  animated?: boolean;
}) {
  const palette = avatarPalette(person.display);
  return (
    <div className="relative flex flex-col items-center">
      <p
        className={`${animated ? "wallnut-hero-line" : ""} mb-3 text-[10px] font-bold tracking-[0.16em] text-[#e8c547]`}
        style={animated ? { animationDelay: "120ms" } : undefined}
      >
        Top Typos Award
      </p>
      <div className="relative flex items-center justify-center">
        <Laurel side="left" />
        <div className="relative mx-[-4px] flex flex-col items-center">
          <span
            aria-hidden
            className="absolute inset-[-18px] top-2 rounded-full opacity-45 blur-2xl"
            style={{ background: palette.background }}
          />
          <Crown />
          <span className="wallnut-sparkle absolute -left-1 top-8 text-[10px] text-[#e8c547]">
            ✦
          </span>
          <span
            className="wallnut-sparkle absolute -right-2 top-12 text-[12px] text-[#e8c547]"
            style={{ animationDelay: "250ms" }}
          >
            ✦
          </span>
          <span className="relative rounded-full ring-2 ring-[#e8c547]/80 shadow-[0_0_0_6px_rgba(232,197,71,0.12)]">
            <PersonAvatar
              label={person.display}
              src={person.avatarUrl}
              size={92}
              className="ring-0"
            />
          </span>
        </div>
        <Laurel side="right" />
      </div>
      <p className="mt-3 text-[16px] font-bold leading-none text-white">{person.display}</p>
      <p className="mt-1 text-[12px] text-[#919191]">
        {person.typos} typo{person.typos === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function Leaderboard({
  title,
  rows,
  value,
  startRank = 1,
}: {
  title: string;
  rows: PersonStats[];
  value: (person: PersonStats) => string;
  startRank?: number;
}) {
  return (
    <section className="flex h-[326px] flex-col overflow-hidden rounded-[8px] border border-[#111111] bg-[#060606] shadow-[0_24px_36px_rgba(0,0,0,0.5)]">
      <h2 className="border-b border-[#131313] px-4 py-3 text-[12px] font-bold text-[#fbfbfb]">
        {title}
      </h2>
      {rows.length > 0 ? (
        <div className="thin-scroll flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {rows.map((person, index) => (
            <div key={person.key} className="flex items-center gap-2.5">
              <span className="w-4 text-[11px] tabular-nums text-[#6c6c6c]">
                {startRank + index}
              </span>
              <PersonAvatar
                label={person.display}
                src={person.avatarUrl}
                size={22}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#919191]">
                {person.display}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-[#bdbdbd]">
                {value(person)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-auto px-5 text-center text-[11px] text-[#555]">
          No other contributors yet.
        </p>
      )}
    </section>
  );
}

function Crown() {
  return (
    <svg className="relative z-10 -mb-[5px]" aria-hidden width="42" height="22" viewBox="0 0 42 22" fill="none">
      <path d="M3 18.5 6.5 5.5l8 7L21 3l6.5 9.5 8-7 3.5 13H3Z" fill="#E8C547" stroke="#F5E6A3" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="6.5" cy="5.2" r="1.7" fill="#FFF4C2" />
      <circle cx="21" cy="2.8" r="2" fill="#FFF4C2" />
      <circle cx="35.5" cy="5.2" r="1.7" fill="#FFF4C2" />
    </svg>
  );
}

function Laurel({ side }: { side: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      width="36"
      height="88"
      viewBox="0 0 36 88"
      fill="none"
      className={side === "right" ? "-scale-x-100" : ""}
    >
      <path d="M22 84C8 68 6 48 14 8" stroke="#C4A35A" strokeWidth="1.6" strokeLinecap="round" />
      {[18, 30, 42, 54, 66].map((y, index) => (
        <ellipse
          key={y}
          cx={10 + (index % 2) * 2}
          cy={y}
          rx="8"
          ry="4.5"
          fill="#C4A35A"
          opacity={0.85 - index * 0.08}
          transform={`rotate(-28 ${10 + (index % 2) * 2} ${y})`}
        />
      ))}
    </svg>
  );
}

function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const colors = ["#f5d76e", "#ffffff", "#e8b4df", "#8b5cf6", "#22c55e", "#f59e0b"];
    const pieces = Array.from({ length: 100 }, () => ({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.5,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 1.8 + Math.random() * 2.5,
      width: 4 + Math.random() * 5,
      height: 7 + Math.random() * 8,
      rotation: Math.random() * Math.PI,
      rotationSpeed: (Math.random() - 0.5) * 0.18,
      color: colors[Math.floor(Math.random() * colors.length)]!,
    }));
    const started = performance.now();
    let frame = 0;

    function draw(now: number) {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        piece.vy += 0.035;
        piece.x += piece.vx;
        piece.y += piece.vy;
        piece.rotation += piece.rotationSpeed;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rotation);
        context.fillStyle = piece.color;
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      }
      if (now - started < 3300) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return active ? (
    <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" aria-hidden />
  ) : null;
}

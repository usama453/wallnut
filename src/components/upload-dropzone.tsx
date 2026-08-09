"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "uploading" | "proofing" | "done" | "error";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ assetId: string; score: number; issueCount: number } | null>(null);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const pasted = item?.getAsFile();
      if (pasted) acceptFile(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptFile = (f: File) => {
    const okImage = f.type.startsWith("image/");
    const okPdf = f.type === "application/pdf";
    if (!okImage && !okPdf) {
      setError("Unsupported file. Upload a PNG, JPEG, WebP, GIF, BMP, AVIF or PDF.");
      return;
    }
    setError(null);
    setFile(f);
    if (okImage) {
      setPreview(URL.createObjectURL(f));
    } else {
      setPreview(null);
    }
    setPhase("idle");
    setResult(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload() {
    if (!file) return;
    setPhase("uploading");
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(/\.[^/.]+$/, ""));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setPhase("proofing");
      setResult({ assetId: data.assetId, score: data.proof?.score ?? 0, issueCount: data.proof?.issueCount ?? 0 });

      setTimeout(() => router.push(`/assets/${data.assetId}`), 900);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-indigo-500 bg-indigo-500/5"
            : "border-slate-700 bg-slate-900/40 hover:border-slate-500"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) acceptFile(f);
          }}
        />
        <span className="text-3xl">📤</span>
        <p className="mt-3 font-medium">Drag &amp; drop your asset here</p>
        <p className="mt-1 text-sm text-slate-400">
          or click to browse, or paste from clipboard (<kbd>⌘V</kbd>)
        </p>
        <p className="mt-3 text-xs text-slate-500">PNG · JPEG · WebP · GIF · BMP · AVIF · PDF (max 20 MB)</p>
      </div>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Preview" className="max-h-64 rounded-xl border border-slate-800" />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {file && phase !== "done" && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">{file.name}</span>
          <button
            onClick={upload}
            disabled={phase === "uploading" || phase === "proofing"}
            className="ml-auto rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
          >
            {phase === "uploading"
              ? "Uploading…"
              : phase === "proofing"
                ? "Proofing…"
                : "Proof this asset"}
          </button>
        </div>
      )}

      {(phase === "uploading" || phase === "proofing") && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="size-4 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
          {phase === "uploading"
            ? "Uploading and storing…"
            : "Extracting text (OCR) and running AI review… this takes a few seconds."}
        </div>
      )}

      {result && (
        <p className="text-sm text-emerald-400">
          Proof complete — score {result.score}/100 · {result.issueCount} issue
          {result.issueCount === 1 ? "" : "s"}. Opening report…
        </p>
      )}
    </div>
  );
}

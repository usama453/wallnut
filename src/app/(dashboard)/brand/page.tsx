"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface BrandData {
  id: string | null;
  company_name: string;
  colors: { name: string; hex: string }[];
  fonts: string[];
  tone_of_voice: string;
  preferred_terminology: string[];
  banned_words: string[];
  style_guide: string;
}

const EMPTY: BrandData = {
  id: null,
  company_name: "",
  colors: [],
  fonts: [],
  tone_of_voice: "",
  preferred_terminology: [],
  banned_words: [],
  style_guide: "",
};

export default function BrandPage() {
  const router = useRouter();

  const [form, setForm] = useState<BrandData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState("#6366f1");
  const [fontName, setFontName] = useState("");
  const [termName, setTermName] = useState("");
  const [banName, setBanName] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("brand_profiles")
        .select("id, company_name, colors, fonts, tone_of_voice, preferred_terminology, banned_words, style_guide")
        .limit(1)
        .maybeSingle();
      if (data) {
        setForm({
          id: data.id,
          company_name: data.company_name ?? "",
          colors: data.colors ?? [],
          fonts: data.fonts ?? [],
          tone_of_voice: data.tone_of_voice ?? "",
          preferred_terminology: data.preferred_terminology ?? [],
          banned_words: data.banned_words ?? [],
          style_guide: data.style_guide ?? "",
        });
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    const payload = {
      company_name: form.company_name || null,
      colors: form.colors,
      fonts: form.fonts,
      tone_of_voice: form.tone_of_voice || null,
      preferred_terminology: form.preferred_terminology,
      banned_words: form.banned_words,
      style_guide: form.style_guide || null,
    };
    if (form.id) {
      await supabase.from("brand_profiles").update(payload).eq("id", form.id);
    } else {
      const { data: org } = await supabase.from("organizations").select("id").maybeSingle();
      await supabase.from("brand_profiles").insert({ ...payload, org_id: org?.id ?? null });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  const add = (
    list: keyof Pick<BrandData, "colors" | "fonts" | "preferred_terminology" | "banned_words">,
    value: any,
    clear: () => void,
  ) => {
    setForm((f) => ({ ...f, [list]: [...f[list], value] }));
    clear();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Brand profile</h1>
          <p className="text-sm text-slate-400">
            AI Proof flags anything on your artwork that breaks these rules.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save profile"}
        </button>
      </div>
      {saved && <p className="text-sm text-emerald-400">Saved.</p>}

      <Section title="Company">
        <label className="block">
          <span className="text-xs text-slate-400">Company name</span>
          <input
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="Acme Marketing"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
        </label>
      </Section>

      <Section title="Brand colors">
        <div className="flex flex-wrap gap-2">
          {form.colors.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-full bg-slate-800 py-1 pl-1.5 pr-2.5 text-xs">
              <span className="size-4 rounded-full border border-slate-600" style={{ background: c.hex }} />
              {c.name} {c.hex}
              <button
                onClick={() => setForm({ ...form, colors: form.colors.filter((_, j) => j !== i) })}
                className="ml-1 text-slate-500 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={colorName}
            onChange={(e) => setColorName(e.target.value)}
            placeholder="Name (e.g. Brand Red)"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <input
            type="color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-lg border border-slate-700 bg-slate-950"
          />
          <button
            onClick={() => {
              if (colorName) add("colors", { name: colorName, hex: colorHex }, () => setColorName(""));
            }}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
          >
            Add
          </button>
        </div>
      </Section>

      <Section title="Fonts">
        <div className="flex flex-wrap gap-2">
          {form.fonts.map((f, i) => (
            <span key={i} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs">
              {f}
              <button onClick={() => setForm({ ...form, fonts: form.fonts.filter((_, j) => j !== i) })} className="ml-1.5 text-slate-500 hover:text-red-400">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={fontName}
            onChange={(e) => setFontName(e.target.value)}
            placeholder="Font family (e.g. Inter)"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button onClick={() => add("fonts", fontName, () => setFontName(""))} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">
            Add
          </button>
        </div>
      </Section>

      <Section title="Tone of voice">
        <textarea
          value={form.tone_of_voice}
          onChange={(e) => setForm({ ...form, tone_of_voice: e.target.value })}
          rows={2}
          placeholder="e.g. Friendly but professional. Never salesy or pushy."
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
      </Section>

      <Section title="Preferred terminology">
        <div className="flex flex-wrap gap-2">
          {form.preferred_terminology.map((t, i) => (
            <span key={i} className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
              {t}
              <button
                onClick={() => setForm({ ...form, preferred_terminology: form.preferred_terminology.filter((_, j) => j !== i) })}
                className="ml-1.5 text-slate-500 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={termName}
            onChange={(e) => setTermName(e.target.value)}
            placeholder="e.g. 'flyer' instead of 'pamphlet'"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button onClick={() => add("preferred_terminology", termName, () => setTermName(""))} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">
            Add
          </button>
        </div>
      </Section>

      <Section title="Banned words">
        <div className="flex flex-wrap gap-2">
          {form.banned_words.map((b, i) => (
            <span key={i} className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
              {b}
              <button
                onClick={() => setForm({ ...form, banned_words: form.banned_words.filter((_, j) => j !== i) })}
                className="ml-1.5 text-slate-500 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={banName}
            onChange={(e) => setBanName(e.target.value)}
            placeholder="e.g. 'very', 'cheap', 'sale'"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          />
          <button onClick={() => add("banned_words", banName, () => setBanName(""))} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600">
            Add
          </button>
        </div>
      </Section>

      <Section title="Style guide">
        <textarea
          value={form.style_guide}
          onChange={(e) => setForm({ ...form, style_guide: e.target.value })}
          rows={3}
          placeholder="Paste links or notes: disclaimers required, logo minimum size, safe margins…"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

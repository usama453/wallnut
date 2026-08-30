import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import sharp from "sharp";

const URL = "https://iczutfmnixkhhdvlprtn.supabase.co";
const ANON = process.env.SUPABASE_ANON_KEY!;
const APP = process.env.WALLNUT_APP_URL ?? "https://wallnut.usama.fun";

const cookies: { name: string; value: string }[] = [];
const supabase = createServerClient(URL, ANON, {
  cookies: {
    getAll() {
      return cookies;
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => {
        const existing = cookies.findIndex((c) => c.name === name);
        if (existing >= 0) cookies.splice(existing, 1);
        cookies.push({ name, value });
      });
    },
  } as CookieMethodsServer,
});

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: "usama@getthenga.com",
    password: process.env.TEST_PASSWORD!,
  });
  if (error || !data.session) throw new Error("sign in failed: " + error?.message);
  console.log("cookies captured:", cookies.map((c) => c.name).join(", "));

  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const dash = await fetch(`${APP}/dashboard`, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });
  console.log("DASHBOARD STATUS", dash.status, dash.headers.get("location"));

  const svg = `<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="300" fill="#f8fafc"/><text x="40" y="80" font-family="Helvetica" font-size="40" font-weight="bold" fill="#0f172a">Grand Opening Sale</text><text x="40" y="140" font-family="Helvetica" font-size="24" fill="#334155">Feburary special, visit www.tehsite.com</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "test-flyer.png");
  form.append("name", "Prod Test Flyer");

  const res = await fetch(`${APP}/api/upload`, {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: form,
  });
  const body = await res.text();
  console.log("UPLOAD STATUS", res.status);
  console.log("UPLOAD BODY", body.slice(0, 1500));
}

main().catch((e) => {
  console.error("TEST FAILED:", e.message);
  process.exit(1);
});

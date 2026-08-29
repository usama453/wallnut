#!/usr/bin/env tsx
/**
 * Prints Wallnut email template HTML for manual paste into Supabase Dashboard.
 *
 * Free-tier projects using Supabase's default email provider cannot update
 * templates via `supabase config push`. Paste each block at:
 * https://supabase.com/dashboard/project/iczutfmnixkhhdvlprtn/auth/templates
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const templatesDir = join(process.cwd(), "supabase/templates");
const templates = [
  { key: "invite", subject: "You are invited to Wallnut", file: "invite.html" },
  {
    key: "confirmation",
    subject: "Confirm your Wallnut account",
    file: "confirmation.html",
  },
  {
    key: "magic_link",
    subject: "Your Wallnut sign-in link",
    file: "magic_link.html",
  },
  {
    key: "recovery",
    subject: "Reset your Wallnut password",
    file: "recovery.html",
  },
] as const;

for (const template of templates) {
  const html = readFileSync(join(templatesDir, template.file), "utf8");
  console.log(`\n=== ${template.key.toUpperCase()} ===`);
  console.log(`Subject: ${template.subject}`);
  console.log("--- HTML ---");
  console.log(html);
}

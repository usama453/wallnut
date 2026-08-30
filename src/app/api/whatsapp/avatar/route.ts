import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  cacheWhatsAppAvatar,
  findCachedAvatarForContact,
  readCachedAvatarFromStorage,
} from "@/lib/whatsapp/avatars";
import { whatsappAvatarContact } from "@/lib/whatsapp/jid";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = (profile?.org_id as string | null) ?? null;

  const params = request.nextUrl.searchParams;
  const contact =
    whatsappAvatarContact(params.get("contact")) ??
    whatsappAvatarContact(params.get("jid")) ??
    whatsappAvatarContact(params.get("phone"));
  if (!contact) return new NextResponse("Not found", { status: 404 });

  try {
    if (orgId) {
      const cached = await findCachedAvatarForContact(orgId, contact);
      if (cached?.avatar_path) {
        const stored = await readCachedAvatarFromStorage(cached.avatar_path);
        if (stored) {
          return new NextResponse(new Uint8Array(stored.buffer), {
            status: 200,
            headers: {
              "Content-Type": cached.avatar_mime || stored.mime,
              "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }
      }
    }

    if (!orgId) return new NextResponse("Not found", { status: 404 });

    const path = await cacheWhatsAppAvatar({ orgId, phone: contact });
    if (!path) return new NextResponse("Not found", { status: 404 });

    const stored = await readCachedAvatarFromStorage(path);
    if (!stored) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(new Uint8Array(stored.buffer), {
      status: 200,
      headers: {
        "Content-Type": stored.mime,
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

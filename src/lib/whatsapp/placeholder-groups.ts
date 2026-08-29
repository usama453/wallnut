import { randomInt } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";

export const PENDING_GROUP_PREFIX = "pending:";
const PLACEHOLDER_NAME = /^New whatsapp group (\d+)$/i;

export function pendingGroupExternalId(code: string) {
  return `${PENDING_GROUP_PREFIX}${code.toUpperCase()}`;
}

export function isPendingGroupExternalId(externalId?: string | null) {
  return Boolean(externalId?.startsWith(PENDING_GROUP_PREFIX));
}

export function codeFromPendingExternalId(externalId?: string | null) {
  if (!isPendingGroupExternalId(externalId)) return null;
  return externalId!.slice(PENDING_GROUP_PREFIX.length).toUpperCase();
}

export function nextNewWhatsAppGroupName(existingNames: string[]) {
  let max = 0;
  for (const name of existingNames) {
    const match = name.trim().match(PLACEHOLDER_NAME);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `New whatsapp group ${String(max + 1).padStart(2, "0")}`;
}

export function createWhatsAppAuthCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WN-";
  for (let i = 0; i < 6; i++) code += chars[randomInt(chars.length)];
  return code;
}

export async function allocateWhatsAppAuthCode(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
) {
  let code = createWhatsAppAuthCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await admin
      .from("whatsapp_group_auth_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!data) return code;
    code = createWhatsAppAuthCode();
  }
  return code;
}

export async function createPlaceholderWhatsAppGroup(orgId: string) {
  const admin = await createAdminClient();
  const { data: groups } = await admin
    .from("groups")
    .select("name")
    .eq("org_id", orgId)
    .eq("platform", "whatsapp");
  const name = nextNewWhatsAppGroupName((groups ?? []).map((group) => group.name));
  const code = await allocateWhatsAppAuthCode(admin);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const externalId = pendingGroupExternalId(code);

  const { data: group, error: groupError } = await admin
    .from("groups")
    .insert({
      org_id: orgId,
      name,
      platform: "whatsapp",
      external_id: externalId,
    })
    .select("id, name")
    .single();
  if (groupError || !group) {
    throw new Error(groupError?.message ?? "Failed to create group");
  }

  const { data: invite, error: codeError } = await admin
    .from("whatsapp_group_auth_codes")
    .insert({
      org_id: orgId,
      code,
      expires_at: expiresAt,
      group_name: name,
    })
    .select("id, code, expires_at")
    .single();
  if (codeError || !invite) {
    await admin.from("groups").delete().eq("id", group.id);
    throw new Error(codeError?.message ?? "Failed to create code");
  }

  return {
    groupId: group.id,
    groupName: group.name,
    id: invite.id,
    code: invite.code,
    expiresAt: invite.expires_at,
  };
}

/** Turn empty unlinked General groups into numbered placeholders with a code. */
export async function ensurePlaceholderWhatsAppGroups(orgId: string) {
  const admin = await createAdminClient();
  const [{ data: groups }, { data: codes }, { data: assets }] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, external_id")
      .eq("org_id", orgId)
      .eq("platform", "whatsapp"),
    admin
      .from("whatsapp_group_auth_codes")
      .select("id, code, status, expires_at, group_name")
      .eq("org_id", orgId)
      .eq("status", "pending"),
    admin.from("assets").select("group_id").eq("org_id", orgId),
  ]);

  const usedGroupIds = new Set(
    (assets ?? []).map((asset) => asset.group_id).filter(Boolean),
  );
  const now = Date.now();
  const liveCodes = (codes ?? []).filter(
    (code) => !code.expires_at || new Date(code.expires_at).getTime() > now,
  );
  const attachedCodes = new Set(
    (groups ?? [])
      .map((group) => codeFromPendingExternalId(group.external_id))
      .filter(Boolean),
  );

  const names = (groups ?? []).map((group) => group.name);
  const unusedCodes = liveCodes.filter((code) => !attachedCodes.has(code.code));

  for (const group of groups ?? []) {
    const empty =
      !usedGroupIds.has(group.id) &&
      (!group.external_id || isPendingGroupExternalId(group.external_id));
    if (!empty) continue;
    if (group.name !== "General" && !PLACEHOLDER_NAME.test(group.name)) continue;

    let name = group.name;
    if (name === "General") {
      name = nextNewWhatsAppGroupName(names);
      names.push(name);
    }

    let code = codeFromPendingExternalId(group.external_id);
    if (!code) {
      const reused = unusedCodes.shift();
      if (reused) {
        code = reused.code;
        await admin
          .from("whatsapp_group_auth_codes")
          .update({ group_name: name })
          .eq("id", reused.id);
      } else {
        code = await allocateWhatsAppAuthCode(admin);
        await admin.from("whatsapp_group_auth_codes").insert({
          org_id: orgId,
          code,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          group_name: name,
        });
      }
    }
    if (!code) continue;

    const externalId = pendingGroupExternalId(code);
    if (group.name !== name || group.external_id !== externalId) {
      await admin
        .from("groups")
        .update({ name, external_id: externalId })
        .eq("id", group.id);
    }
    attachedCodes.add(code);
  }

  for (const invite of unusedCodes) {
    if (attachedCodes.has(invite.code)) continue;
    const name = nextNewWhatsAppGroupName(names);
    names.push(name);
    const { error } = await admin.from("groups").insert({
      org_id: orgId,
      name,
      platform: "whatsapp",
      external_id: pendingGroupExternalId(invite.code),
    });
    if (!error) {
      await admin
        .from("whatsapp_group_auth_codes")
        .update({ group_name: name })
        .eq("id", invite.id);
      attachedCodes.add(invite.code);
    }
  }
}

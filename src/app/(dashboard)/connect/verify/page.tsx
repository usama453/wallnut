import { redirect } from "next/navigation";

export default function LegacyWhatsAppVerifyPage() {
  redirect("/connect");
}

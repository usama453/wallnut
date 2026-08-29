export const dynamic = "force-dynamic";

import LoginForm from "@/components/login-form";
import { AppHeader } from "@/components/wallnut/app-header";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black">
      <AppHeader />
      <LoginForm />
    </div>
  );
}

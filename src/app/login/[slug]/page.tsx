import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LoginForm from "@/components/login-form";
import { AppHeader } from "@/components/wallnut/app-header";
import { getOrganizationForLogin } from "@/lib/organizations";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const organization = await getOrganizationForLogin(slug);
  return { title: organization ? `Sign in to ${organization.name}` : "Organization not found" };
}

export default async function OrganizationLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const organization = await getOrganizationForLogin(slug);
  if (!organization) notFound();

  return (
    <div className="min-h-screen bg-black">
      <AppHeader />
      <LoginForm
        organization={{
          name: organization.name,
          slug: organization.slug,
          accentColor: organization.accentColor,
        }}
      />
    </div>
  );
}

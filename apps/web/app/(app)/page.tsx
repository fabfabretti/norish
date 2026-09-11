import type { SessionRoleUser } from "@/lib/auth/server-admin";
import { cookies, headers } from "next/headers";
import { Dashboard } from "@/components/dashboard/dashboard";
import { hasServerAdminRole } from "@/lib/auth/server-admin";
import { recipeViewModePreference } from "@/lib/recipe-view-mode";

import { auth } from "@norish/auth/auth";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) return null; // This should never happen due to proxy

  // Rendering the library in the stored layout server-side is what keeps a list
  // reader from watching a grid paint first.
  const cookieStore = await cookies();
  const isServerAdmin = hasServerAdminRole(session.user as SessionRoleUser | undefined);

  return (
    <Dashboard
      initialViewMode={recipeViewModePreference.readFrom(cookieStore)}
      isServerAdmin={isServerAdmin}
    />
  );
}

import { createCookbookHooks } from "@norish/shared-react/hooks";

import { useUserContext } from "@/context/user-context";
import { useTRPC } from "@/providers/trpc-provider";

export const sharedCookbookHooks = createCookbookHooks({
  useTRPC,
  // So a cookbook created Offline is shown as the reader's own rather than as
  // Orphaned, which would offer rename and delete to everyone (ADR-0027).
  useCurrentUserId: () => useUserContext().user?.id,
});
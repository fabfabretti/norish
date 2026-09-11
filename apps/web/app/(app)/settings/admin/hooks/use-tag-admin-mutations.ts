"use client";

import { useCallback } from "react";
import { useTRPC } from "@/app/providers/trpc-provider";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Tag administration writes.
 *
 * A rename and a delete are instance-wide claims, so each one invalidates both
 * the manager's own list and the household tag vocabulary — the recipe form's
 * picker and the library's autocomplete read the latter, and neither would
 * otherwise learn of the change.
 */
export function useTagAdminMutations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const adminListKey = trpc.admin.tags.list.queryKey();
  const vocabularyKey = trpc.config.tags.queryKey();

  const renameMutation = useMutation(trpc.admin.tags.rename.mutationOptions());
  const deleteMutation = useMutation(trpc.admin.tags.delete.mutationOptions());

  const invalidate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: adminListKey }),
        queryClient.invalidateQueries({ queryKey: vocabularyKey }),
      ]),
    [queryClient, adminListKey, vocabularyKey]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      await renameMutation.mutateAsync({ id, name });
      await invalidate();
    },
    [renameMutation, invalidate]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteMutation.mutateAsync({ id });
      await invalidate();
    },
    [deleteMutation, invalidate]
  );

  return {
    rename,
    remove,
    isPending: renameMutation.isPending || deleteMutation.isPending,
  };
}

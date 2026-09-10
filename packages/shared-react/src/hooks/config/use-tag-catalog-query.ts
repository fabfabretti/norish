import { useQuery } from "@tanstack/react-query";

import type { TagDto } from "@norish/shared/contracts/dto/tag";

import type { CreateConfigHooksOptions } from "./types";

export function createUseTagCatalogQuery({ useTRPC }: CreateConfigHooksOptions) {
  return function useTagCatalogQuery() {
    const trpc = useTRPC();

    const { data, error, isLoading } = useQuery({
      ...trpc.config.tagCatalog.queryOptions(),
      staleTime: 5 * 60 * 1000,
    });

    return {
      tags: (data?.tags ?? []) as TagDto[],
      error,
      isLoading,
    };
  };
}
"use client";

import type { LibraryGridItem } from "@/lib/library-items";
import { useCallback, useMemo, useState } from "react";
import CookbookCard from "@/components/cookbooks/cookbook-card";
import { SmartCookbookPanel } from "@/components/cookbooks/cookbook-smart-panel";
import LibraryGrid from "@/components/dashboard/library-grid";
import { useCookbooksQuery, useCookbooksMutations } from "@/hooks/cookbooks";
import { PlusIcon } from "@heroicons/react/16/solid";
import { Button, Card } from "@heroui/react";
import { useTranslations } from "next-intl";

import type { CookbookRuleDTO, CookbookSummaryDTO } from "@norish/shared/contracts";

/**
 * The Collections page: every cookbook, hand-curated and rule-driven together.
 *
 * One list, one card, the shared CookbookCard — the only difference from the
 * Library is that every row is a cookbook, so there is no All/Recipes lens to
 * filter on. "New collection" opens the rule panel: pick nothing and you get a
 * plain cookbook, pick tags and it is smart.
 */
export default function CollectionsPage() {
  const t = useTranslations("recipes.collections");
  const { cookbooks, isLoading, isValidating, loadMore } = useCookbooksQuery({ limit: 50 });
  const { createCookbook, updateRule, deleteCookbook } = useCookbooksMutations();
  const [createOpen, setCreateOpen] = useState(false);

  const items = useMemo(
    () => cookbooks.map((cookbook) => ({ kind: "cookbook" as const, id: cookbook.id, cookbook })),
    [cookbooks]
  );

  const emptyState = !isLoading ? (
    <Card className="border-border bg-surface mx-auto max-w-md rounded-2xl border p-8 text-center">
      <p className="text-foreground font-semibold">{t("title")}</p>
      <p className="text-muted mt-2 text-sm">{t("empty")}</p>
    </Card>
  ) : null;

  const onCreate = useCallback(
    ({ title, rule }: { title: string; rule: CookbookRuleDTO | null }) => {
      void createCookbook({ title, rule: rule ?? undefined });
    },
    [createCookbook]
  );

  const onUpdateRule = useCallback(
    (cookbook: CookbookSummaryDTO, rule: CookbookRuleDTO) => {
      updateRule({ id: cookbook.id, version: cookbook.version, rule });
    },
    [updateRule]
  );

  const renderItem = useCallback(
    (item: LibraryGridItem) => {
      if (item.kind !== "cookbook") return null;

      return (
        <CookbookCard
          allergies={[]}
          cookbook={item.cookbook}
          onDelete={deleteCookbook}
          onUpdateRule={(rule) => onUpdateRule(item.cookbook, rule)}
        />
      );
    },
    [deleteCookbook, onUpdateRule]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">{t("title")}</h1>
        <Button
          aria-label={t("createSmartTitle")}
          className="min-w-10 rounded-full font-medium md:min-w-20"
          data-testid="add-collection-button"
          size="md"
          variant="primary"
          onPress={() => setCreateOpen(true)}
        >
          <PlusIcon className="h-5 w-5" />
          <span className="hidden md:inline">{t("createSmartTitle")}</span>
        </Button>
      </div>

      <LibraryGrid
        emptyState={emptyState}
        isFetchingMore={isValidating && !isLoading}
        isLoading={isLoading}
        items={items}
        loadMore={loadMore}
        renderItem={renderItem}
        scrollKey="collections"
        variant="grid"
      />

      <SmartCookbookPanel
        open={createOpen}
        onCreate={onCreate}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
"use client";

import { useState } from "react";
import Panel from "@/components/Panel/Panel";
import { ActionButton, ActionButtonGroup } from "@/components/shared/action-button";
import TagInput from "@/components/shared/tag-input";
import { useRecipesMutations } from "@/hooks/recipes";
import { CheckIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";

type BulkSelectionBarProps = {
  selectedCount: number;
  selectedIds: string[];
  onExit: () => void;
};

type EditMode = "none" | "add" | "remove";

/**
 * The floating bar shown while the Library is in selection mode. "Add tags"
 * and "Remove tags" open the same tag picker; the picker's readiness is
 * applied to everything selected in one mutation.
 */
export default function BulkSelectionBar({
  selectedCount,
  selectedIds,
  onExit,
}: BulkSelectionBarProps) {
  const t = useTranslations("recipes.bulk");
  const { bulkTags } = useRecipesMutations();
  const [mode, setMode] = useState<EditMode>("none");
  const [draft, setDraft] = useState<string[]>([]);

  const openPanel = (next: "add" | "remove") => {
    setDraft([]);
    setMode(next);
  };

  const apply = () => {
    if (draft.length === 0 || mode === "none") return;

    if (mode === "add") bulkTags(selectedIds, { add: draft });
    else bulkTags(selectedIds, { remove: draft });

    setMode("none");
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="bg-surface/95 mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-3xl border border-(--field-border) px-4 py-3 shadow-lg backdrop-blur">
          <div className="text-foreground text-sm font-medium">
            {t("selected", { count: selectedCount })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              startContent={<CheckIcon className="size-4" />}
              onPress={() => openPanel("add")}
            >
              {t("addTags")}
            </Button>
            <Button
              size="sm"
              variant="flat"
              startContent={<XMarkIcon className="size-4" />}
              onPress={() => openPanel("remove")}
            >
              {t("removeTags")}
            </Button>
            <Button size="sm" variant="ghost" onPress={onExit}>
              {t("done")}
            </Button>
          </div>
        </div>
      </div>

      <Panel
        open={mode !== "none"}
        title={t(mode === "add" ? "addTitle" : mode === "remove" ? "removeTitle" : "")}
        onOpenChange={(open) => !open && setMode("none")}
      >
        <Panel.Body>
          <TagInput value={draft} onChange={setDraft} />
        </Panel.Body>
        <Panel.Footer>
          <ActionButtonGroup>
            <ActionButton
              action={mode === "add" ? "add" : "remove"}
              isDisabled={draft.length === 0}
              onPress={apply}
            >
              {t(mode === "add" ? "applyAdd" : "applyRemove")}
            </ActionButton>
          </ActionButtonGroup>
        </Panel.Footer>
      </Panel>
    </>
  );
}

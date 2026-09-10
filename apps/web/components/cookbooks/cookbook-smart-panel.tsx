"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Panel from "@/components/Panel/Panel";
import { ActionButton, ActionButtonGroup } from "@/components/shared/action-button";
import ChipSkeleton from "@/components/skeleton/chip-skeleton";
import { useTagCatalogQuery } from "@/hooks/config";
import { CheckIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { Button, Chip, Input, Label } from "@heroui/react";
import { useTranslations } from "next-intl";

import type { CookbookRuleDTO, CookbookSummaryDTO } from "@norish/shared/contracts";

/**
 * The rule behind a smart collection, asked for the same two ways the filters
 * ask: a tag picker and an AND/OR choice. A rule with no tags is not a rule —
 * it is the empty "manual" kind — so the same panel creates a plain cookbook
 * when nothing is picked and a smart one when something is.
 *
 * Create asks for a title too; edit only re-points the rule, because no other
 * panel writes the cookbook row in the same save and combining mutations would
 * race their versions.
 */
export function SmartCookbookPanel({
  open,
  onOpenChange,
  cookbook,
  onCreate,
  onUpdateRule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when given: the cookbook whose rule is being re-pointed. */
  cookbook?: CookbookSummaryDTO;
  /** Create mode: fired with the draft — `rule` is null for a plain cookbook. */
  onCreate: (draft: { title: string; rule: CookbookRuleDTO | null }) => void;
  /** Edit mode: fired with the new rule, manual included. */
  onUpdateRule: (rule: CookbookRuleDTO) => void;
}) {
  const t = useTranslations("recipes.collections");
  const tCookbooks = useTranslations("recipes.cookbooks");
  const tActions = useTranslations("common.actions");
  const editing = Boolean(cookbook);
  const { tags, isLoading } = useTagCatalogQuery();

  const [title, setTitle] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"AND" | "OR">("OR");
  const [tagFilter, setTagFilter] = useState("");

  // Seed the controls once per open; the rule is captured when the panel
  // opens, so a change from the card while it is closed does not stick.
  useEffect(() => {
    if (!open) return;

    const rule = cookbook?.rule;

    setTitle("");
    setTagIds(rule?.kind === "tags" ? rule.tagIds : []);
    setMatchMode(rule?.kind === "tags" ? rule.matchMode : "OR");
    setTagFilter("");
  }, [open, cookbook]);

  const filteredTags = useMemo(
    () =>
      tags.filter((tag) => tag.name.toLowerCase().includes(tagFilter.trim().toLowerCase())),
    [tags, tagFilter]
  );

  const toggleTag = useCallback((id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((tag) => tag !== id) : [...prev, id]));
  }, []);

  const trimmedTitle = title.trim();
  const canSubmit = editing || trimmedTitle.length > 0;

  const submit = () => {
    const rule: CookbookRuleDTO =
      tagIds.length === 0 ? { kind: "manual" } : { kind: "tags", tagIds, matchMode };

    if (editing) {
      onUpdateRule(rule);
    } else {
      onCreate({ title: trimmedTitle, rule: tagIds.length === 0 ? null : rule });
    }

    onOpenChange(false);
  };

  return (
    <Panel
      open={open}
      panelClassName="min-h-[70dvh]"
      title={editing ? t("editSmartTitle") : t("createSmartTitle")}
      onOpenChange={onOpenChange}
    >
      {open ? (
        <Panel.Body className="flex min-h-0 flex-1 flex-col">
          {!editing ? (
            <>
              <Label className="text-muted mb-2 text-[11px] font-medium tracking-wide uppercase">
                {tCookbooks("titleLabel")}
              </Label>
              <Input
                fullWidth
                data-testid="cookbook-title-input"
                placeholder={tCookbooks("titlePlaceholder")}
                style={{ fontSize: "16px" }}
                value={title}
                variant="secondary"
                onChange={(event) => setTitle(event.target.value)}
              />
              <div className="py-3" />
            </>
          ) : (
            <p className="text-foreground mb-4 truncate text-lg font-semibold">
              {cookbook?.title}
            </p>
          )}

          <Label className="text-muted mb-2 text-[11px] font-medium tracking-wide uppercase">
            {t("tagsLabel")}
          </Label>

          <div className="relative mb-3">
            <MagnifyingGlassIcon className="text-muted pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
            <Input
              fullWidth
              className="h-9 text-sm"
              placeholder={t("searchTags")}
              style={{ paddingLeft: "2.25rem", paddingRight: "2.25rem" }}
              value={tagFilter}
              variant="secondary"
              onChange={(event) => setTagFilter(event.target.value)}
            />
            {tagFilter.length > 0 && (
              <button
                aria-label="Clear"
                className="text-muted hover:bg-surface-secondary hover:text-foreground absolute top-1/2 right-1.5 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
                type="button"
                onClick={() => setTagFilter("")}
                onMouseDown={(event) => event.preventDefault()}
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          {isLoading ? (
            <ChipSkeleton />
          ) : filteredTags.length === 0 ? (
            <p className="text-muted px-1 text-sm">{t("emptyTags")}</p>
          ) : (
            <div className="flex max-h-[220px] flex-wrap gap-1 overflow-y-auto pr-1">
              {filteredTags.map((tag) => {
                const active = tagIds.includes(tag.id);

                return (
                  <Chip
                    key={tag.id}
                    className="h-7 cursor-pointer px-2 text-[11px]"
                    color={active ? "accent" : "default"}
                    variant={active ? "primary" : "tertiary"}
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Chip>
                );
              })}
            </div>
          )}

          {tagIds.length > 0 && (
            <>
              <Label className="text-muted mt-4 mb-2 text-[11px] font-medium tracking-wide uppercase">
                {t("matchLabel")}
              </Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "AND", label: t("matchesAnd") },
                    { value: "OR", label: t("matchesOr") },
                  ] as const
                ).map(({ value, label }) => {
                  const active = matchMode === value;

                  return (
                    <Button
                      key={value}
                      className="h-9 min-w-16 rounded-full px-3 text-xs"
                      size="sm"
                      variant={active ? "primary" : "tertiary"}
                      onPress={() => setMatchMode(value)}
                    >
                      {active ? <CheckIcon className="size-3.5" /> : null}
                      {label}
                    </Button>
                  );
                })}
              </div>
            </>
          )}

          <p className="text-muted mt-4 text-sm">
            {tagIds.length > 0 ? t("ruleHint") : tCookbooks("emptyHint")}
          </p>
        </Panel.Body>
      ) : null}

      {open ? (
        <Panel.Footer>
          <ActionButtonGroup>
            <ActionButton action="save" isDisabled={!canSubmit} onPress={submit}>
              {tActions("save")}
            </ActionButton>
          </ActionButtonGroup>
        </Panel.Footer>
      ) : null}
    </Panel>
  );
}
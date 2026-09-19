"use client";

import { useState } from "react";
import { useTRPC } from "@/app/providers/trpc-provider";
import { CheckIcon, PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { TagIcon } from "@heroicons/react/24/outline";
import { Button, Card, Checkbox, Input, Modal, ScrollShadow, TextField } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useTagAdminMutations } from "../hooks/use-tag-admin-mutations";

/**
 * Tag administration.
 *
 * Tags are an open folksonomy, but rename, merge and delete are instance-wide
 * claims, so they are admin-only. Renaming a tag into an existing name merges
 * them; deleting refuses tags some household lists as an allergy, because
 * removing those would delete safety data. Tags can also be selected in bulk
 * to merge them into one name or delete them together.
 */
export default function TagsCard() {
  const t = useTranslations("settings.admin.tags");
  const tActions = useTranslations("common.actions");
  const trpc = useTRPC();
  const { data: tags = [], isLoading } = useQuery(trpc.admin.tags.list.queryOptions());
  const { rename, remove, isPending } = useTagAdminMutations();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetName, setMergeTargetName] = useState("");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [error, setError] = useState<"allergy" | "saveFailed" | null>(null);

  const selected = tags.filter((tag) => selectedIds.includes(tag.id));

  const editingTarget = (() => {
    const name = editingName.trim();

    if (!editingId || !name) return undefined;

    return tags.find(
      (tag) => tag.id !== editingId && tag.name.toLowerCase() === name.toLowerCase()
    );
  })();

  const toggleSelected = (id: string, isSelected: boolean) => {
    setError(null);
    setSelectedIds((current) =>
      isSelected ? [...current, id] : current.filter((selectedId) => selectedId !== id)
    );
  };

  const handleRemove = async (tagId: string) => {
    try {
      await remove(tagId);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "data" in err
          ? (err as { data?: { code?: string } }).data?.code
          : undefined;

      setError(code === "CONFLICT" ? "allergy" : "saveFailed");

      throw err;
    }
  };

  const handleDelete = async (target: { id: string; name: string }) => {
    setError(null);

    try {
      await handleRemove(target.id);
      setPendingDelete(null);
    } catch {
      // error already surfaced via setError
    }
  };

  const handleBulkDelete = async () => {
    setError(null);

    if (selected.some((tag) => tag.allergyUsage > 0)) {
      setError("allergy");
      return;
    }

    try {
      for (const tag of selected) {
        await handleRemove(tag.id);
      }

      setBulkDeleteOpen(false);
      setSelectedIds([]);
    } catch {
      // error already surfaced via setError
    }
  };

  const handleRename = () => {
    const name = editingName.trim();

    if (!editingId || !name) return;

    setError(null);

    void (async () => {
      try {
        await rename(editingId, name);
        setEditingId(null);
        setEditingName("");
      } catch {
        setError("saveFailed");
      }
    })();
  };

  const handleBulkMerge = () => {
    const target = mergeTargetName.trim();

    if (!target) return;

    setError(null);

    void (async () => {
      try {
        for (const tag of selected) {
          if (tag.name.toLowerCase() === target.toLowerCase()) continue;

          await rename(tag.id, target);
        }

        setMergeOpen(false);
        setMergeTargetName("");
        setSelectedIds([]);
      } catch {
        setError("saveFailed");
      }
    })();
  };

  return (
    <Card>
      <Card.Header>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <TagIcon className="h-5 w-5" />
          {t("title")}
        </h2>
      </Card.Header>
      <Card.Content className="flex flex-col gap-6">
        <p className="text-muted text-base">{t("description")}</p>

        {error && <p className="text-danger text-sm">{t(error)}</p>}

        {!isLoading && tags.length === 0 && <p className="text-muted text-base">{t("empty")}</p>}

        {selected.length > 0 && (
          <div className="bg-primary-foreground border-border flex items-center justify-between gap-2 rounded-lg border p-2">
            <span className="text-sm">{t("selectedCount", { count: selected.length })}</span>
            <div className="flex items-center gap-1">
              <Button onPress={() => setMergeOpen(true)} variant="secondary">
                {t("mergeSelected")}
              </Button>
              <Button onPress={() => setBulkDeleteOpen(true)} variant="danger">
                {tActions("delete")}
              </Button>
              <Button onPress={() => setSelectedIds([])} variant="tertiary">
                {tActions("cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* The vocabulary grows without bound, so the list scrolls inside a fixed
          height rather than pushing every row off the top of the card. */}
        <ScrollShadow className="max-h-80" size={24}>
          <ul className="divide-border divide-y">
            {tags.map((tag) =>
              editingId === tag.id ? (
                <li key={tag.id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center gap-2">
                    <TextField
                      aria-label={t("renameLabel", { name: tag.name })}
                      className="flex-1"
                      value={editingName}
                      onChange={setEditingName}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRename();
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    >
                      <Input variant="secondary" />
                    </TextField>
                    <Button
                      aria-label={tActions("save")}
                      isDisabled={editingName.trim().length === 0 || isPending}
                      variant="primary"
                      onPress={handleRename}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={tActions("cancel")}
                      onPress={() => setEditingId(null)}
                      variant="tertiary"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </Button>
                  </div>

                  {editingTarget && (
                    <p className="text-primary text-sm">
                      {t("willMerge", { name: editingTarget.name })}
                    </p>
                  )}
                </li>
              ) : (
                <li key={tag.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Checkbox
                      aria-label={t("selectLabel", { name: tag.name })}
                      className="shrink-0"
                      isSelected={selectedIds.includes(tag.id)}
                      onChange={(isSelected) => toggleSelected(tag.id, isSelected)}
                      variant="secondary"
                    />
                    <span className="truncate text-base">{tag.name}</span>
                    <span className="text-muted shrink-0 text-sm">
                      {t("usage", { count: tag.usage })}
                    </span>
                    {tag.allergyUsage > 0 && (
                      <span className="text-danger shrink-0 text-xs">{t("allergyBadge")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      aria-label={t("renameLabel", { name: tag.name })}
                      onPress={() => {
                        setError(null);
                        setEditingId(tag.id);
                        setEditingName(tag.name);
                      }}
                      variant="tertiary"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={t("deleteLabel", { name: tag.name })}
                      onPress={() => setPendingDelete({ id: tag.id, name: tag.name })}
                      variant="tertiary"
                    >
                      <TrashIcon className="text-danger h-4 w-4" />
                    </Button>
                  </div>
                </li>
              )
            )}
          </ul>
        </ScrollShadow>

        <Modal.Backdrop isOpen={pendingDelete !== null} onOpenChange={() => setPendingDelete(null)}>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="text-danger">{tActions("delete")}</Modal.Header>
                  <Modal.Body>
                    <p>{t("deleteConfirm", { name: pendingDelete?.name ?? "" })}</p>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button onPress={close} variant="tertiary">
                      {tActions("cancel")}
                    </Button>
                    <Button
                      onPress={() => {
                        const target = pendingDelete;

                        if (!target) return;

                        void handleDelete(target);
                      }}
                      variant="danger"
                    >
                      {tActions("delete")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

        <Modal.Backdrop isOpen={mergeOpen} onOpenChange={setMergeOpen}>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header>{t("mergeTitle")}</Modal.Header>
                  <Modal.Body>
                    <TextField
                      aria-label={t("mergeTargetLabel")}
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- modal-in-focus, not a page-load steal
                      autoFocus
                      value={mergeTargetName}
                      onChange={setMergeTargetName}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleBulkMerge();
                        if (event.key === "Escape") close();
                      }}
                    >
                      <Input label={t("mergeTargetLabel")} variant="secondary" />
                    </TextField>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button onPress={close} variant="tertiary">
                      {tActions("cancel")}
                    </Button>
                    <Button
                      isDisabled={mergeTargetName.trim().length === 0 || isPending}
                      onPress={handleBulkMerge}
                      variant="primary"
                    >
                      {tActions("save")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>

        <Modal.Backdrop isOpen={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
          <Modal.Container>
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="text-danger">{tActions("delete")}</Modal.Header>
                  <Modal.Body>
                    <p>{t("deleteSelectedConfirm", { count: selected.length })}</p>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button onPress={close} variant="tertiary">
                      {tActions("cancel")}
                    </Button>
                    <Button onPress={() => void handleBulkDelete()} variant="danger">
                      {tActions("delete")}
                    </Button>
                  </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Card.Content>
    </Card>
  );
}

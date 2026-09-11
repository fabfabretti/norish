"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/app/providers/trpc-provider";
import { CheckIcon, PencilIcon, TrashIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { TagIcon } from "@heroicons/react/24/outline";
import { Button, Card, Input, Modal, ScrollShadow, TextField } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useTagAdminMutations } from "../hooks/use-tag-admin-mutations";

/**
 * Tag administration.
 *
 * Tags are an open folksonomy, but rename and delete are instance-wide claims,
 * so they are admin-only (ADR-0012). A rename that collides with an existing
 * tag merges them; a delete refuses tags some household lists as an allergy,
 * because removing those would delete safety data. The usage count tells the
 * admin what a rename or delete will actually touch.
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
  const [error, setError] = useState<"allergy" | "saveFailed" | null>(null);

  const handleDelete = async (target: { id: string; name: string }) => {
    setError(null);

    try {
      await remove(target.id);
      setPendingDelete(null);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "data" in err
          ? (err as { data?: { code?: string } }).data?.code
          : undefined;

      setError(code === "CONFLICT" ? "allergy" : "saveFailed");
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

        {/* The vocabulary grows without bound, so the list scrolls inside a fixed
          height rather than pushing every row off the top of the card. */}
        <ScrollShadow className="max-h-80" size={24}>
          <ul className="divide-border divide-y">
            {tags.map((tag) =>
              editingId === tag.id ? (
                <li key={tag.id} className="flex items-center gap-2 py-2">
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
                </li>
              ) : (
                <li key={tag.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-base">{tag.name}</span>
                    <span className="text-muted shrink-0 text-sm">
                      {t("usage", { count: tag.usage })}
                    </span>
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
      </Card.Content>
    </Card>
  );
}

import type { CookbookRuleDTO, CookbookSummaryDTO } from "@norish/shared/contracts";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ShellSheet } from "@/components/shell/sheet";
import { useCookbooksMutations, useCookbooksQuery } from "@/hooks/cookbooks";
import { useTagCatalogQuery } from "@/hooks/config";
import { Ionicons } from "@expo/vector-icons";
import { Button, useThemeColor } from "heroui-native";
import { useIntl } from "react-intl";

/**
 * The Collections tab: every cookbook, hand-curated and rule-driven together.
 *
 * A smart cookbook (badged "Auto") re-points its rule from here; filing and
 * renaming stay on the web card for now.
 */
export default function CollectionsScreen() {
  const intl = useIntl();
  const { cookbooks, isLoading, hasMore, loadMore } = useCookbooksQuery({ limit: 50 });
  const { createCookbook, updateRule } = useCookbooksMutations();
  const [editing, setEditing] = useState<CookbookSummaryDTO | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [foregroundColor, mutedColor, accentColor, accentForegroundColor, separatorColor] =
    useThemeColor([
      "foreground",
      "muted",
      "accent",
      "accent-foreground",
      "separator",
    ] as const);

  const onOpenRule = useCallback((cookbook: CookbookSummaryDTO) => setEditing(cookbook), []);

  const onSave = useCallback(
    (rule: CookbookRuleDTO) => {
      if (editing) {
        updateRule({ id: editing.id, version: editing.version, rule });
        setEditing(null);
      }
    },
    [editing, updateRule]
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={cookbooks}
        keyExtractor={(cookbook) => cookbook.id}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="always"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { borderColor: separatorColor }]} />
        )}
        renderItem={({ item }) => {
          const isSmart = item.rule.kind === "tags";

          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              onPress={() => (isSmart ? onOpenRule(item) : undefined)}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: foregroundColor }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.rowSubtitle, { color: mutedColor }]}>
                  {intl.formatMessage({ id: "recipes.cookbooks.recipeCount" }, { count: item.memberCount })}
                  {isSmart
                    ? ` · ${intl.formatMessage({ id: "recipes.collections.smartBadge" })}`
                    : ""}
                </Text>
              </View>
              {isSmart ? <Ionicons name="options-outline" size={18} color={mutedColor} /> : null}
            </Pressable>
          );
        }}
        ListFooterComponent={
          isLoading ? null : hasMore ? (
            <Button
              variant="tertiary"
              size="sm"
              className="mt-4 self-center"
              onPress={loadMore}
            >
              <Button.Label>{intl.formatMessage({ id: "recipes.cookbooks.showMore" })}</Button.Label>
            </Button>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.headerButtons}>
            <Button
              variant="primary"
              size="md"
              className="rounded-full"
              onPress={() => setIsCreateOpen(true)}
            >
              <Ionicons name="add" size={18} color={accentForegroundColor} />
              <Button.Label>
                {intl.formatMessage({ id: "recipes.collections.createSmartTitle" })}
              </Button.Label>
            </Button>
          </View>
        }
      />

      <RuleSheet
        isPresented={isCreateOpen || editing !== null}
        cookbook={editing}
        accentColor={accentColor}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onIsPresentedChange={(open) => {
          setIsCreateOpen(open);
          if (!open) setEditing(null);
        }}
        onCreate={(title, rule) => {
          void createCookbook({ title, rule: rule ?? undefined });
          setIsCreateOpen(false);
        }}
        onSave={onSave}
      />
    </View>
  );
}

function RuleSheet({
  isPresented,
  cookbook,
  accentColor,
  foregroundColor,
  mutedColor,
  onIsPresentedChange,
  onCreate,
  onSave,
}: {
  isPresented: boolean;
  cookbook: CookbookSummaryDTO | null;
  accentColor: string;
  foregroundColor: string;
  mutedColor: string;
  onIsPresentedChange: (open: boolean) => void;
  onCreate: (title: string, rule: CookbookRuleDTO | null) => void;
  onSave: (rule: CookbookRuleDTO) => void;
}) {
  const intl = useIntl();
  const { tags } = useTagCatalogQuery();
  const [title, setTitle] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"AND" | "OR">("OR");
  const editing = cookbook !== null;

  useEffect(() => {
    if (!isPresented) return;
    if (!cookbook) {
      setTitle("");
      setTagIds([]);
      setMatchMode("OR");
      return;
    }
    const rule = cookbook.rule;
    setTitle(cookbook.title);
    setTagIds(rule.kind === "tags" ? rule.tagIds : []);
    setMatchMode(rule.kind === "tags" ? rule.matchMode : "OR");
  }, [isPresented, cookbook]);

  const toggleTag = useCallback((id: string) => {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((tag) => tag !== id) : [...prev, id]));
  }, []);

  const rule: CookbookRuleDTO =
    tagIds.length === 0 ? { kind: "manual" } : { kind: "tags", tagIds, matchMode };
  const canSubmit = editing || title.trim().length > 0;

  return (
    <ShellSheet
      isPresented={isPresented}
      onIsPresentedChange={onIsPresentedChange}
      detents={["large"]}
      initialDetent="large"
    >
      <View style={styles.sheetContent}>
        <Text style={[styles.sheetTitle, { color: foregroundColor }]}>
          {intl.formatMessage({
            id: editing ? "recipes.collections.editSmartTitle" : "recipes.collections.createSmartTitle",
          })}
        </Text>

        {!editing ? (
          <>
            <Text style={[styles.fieldLabel, { color: mutedColor }]}>
              {intl.formatMessage({ id: "recipes.cookbooks.titleLabel" })}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={intl.formatMessage({ id: "recipes.cookbooks.titlePlaceholder" })}
              placeholderTextColor={mutedColor}
              style={[styles.input, { color: foregroundColor, backgroundColor: accentColor, borderColor: accentColor }]}
            />
          </>
        ) : null}

        <Text style={[styles.fieldLabel, { color: mutedColor }]}>
          {intl.formatMessage({ id: "recipes.collections.tagsLabel" })}
        </Text>
        <View style={styles.tagWrap}>
          {tags.length === 0 ? (
            <Text style={[styles.emptyHint, { color: mutedColor }]}>
              {intl.formatMessage({ id: "recipes.collections.emptyTags" })}
            </Text>
          ) : (
            tags.map((tag) => {
              const active = tagIds.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  style={[
                    styles.tagPill,
                    { backgroundColor: active ? accentColor : undefined, borderColor: accentColor },
                  ]}
                  onPress={() => toggleTag(tag.id)}
                >
                  <Text style={{ color: active ? foregroundColor : mutedColor }}>{tag.name}</Text>
                </Pressable>
              );
            })
          )}
        </View>

        {tagIds.length > 0 ? (
          <>
            <Text style={[styles.fieldLabel, { color: mutedColor }]}>
              {intl.formatMessage({ id: "recipes.collections.matchLabel" })}
            </Text>
            <View style={styles.matchRow}>
              {(["AND", "OR"] as const).map((value) => {
                const active = matchMode === value;
                return (
                  <Button
                    key={value}
                    variant={active ? "primary" : "tertiary"}
                    size="sm"
                    className="rounded-full"
                    onPress={() => setMatchMode(value)}
                  >
                    <Button.Label>
                      {intl.formatMessage({
                        id: value === "AND" ? "recipes.collections.matchesAnd" : "recipes.collections.matchesOr",
                      })}
                    </Button.Label>
                  </Button>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.hint, { color: mutedColor }]}>
          {intl.formatMessage({
            id: tagIds.length > 0 ? "recipes.collections.ruleHint" : "recipes.cookbooks.emptyHint",
          })}
        </Text>

        <View style={styles.footer}>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            isDisabled={!canSubmit}
            onPress={() => {
              if (editing) {
                onSave(rule);
              } else {
                onCreate(title.trim(), tagIds.length === 0 ? null : rule);
              }
            }}
          >
            <Button.Label>{intl.formatMessage({ id: "common.actions.save" })}</Button.Label>
          </Button>
        </View>
      </View>
    </ShellSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 },
  headerButtons: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSubtitle: { fontSize: 13 },
  separator: { borderTopWidth: 1 },
  sheetContent: { paddingHorizontal: 16, gap: 6 },
  sheetTitle: { fontSize: 20, fontWeight: "700", marginTop: 4, marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: "500", marginTop: 10 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 4,
  },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  matchRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  emptyHint: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 13, marginTop: 14 },
  footer: { marginTop: 24 },
});
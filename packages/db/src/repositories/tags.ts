import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import z from "zod";

import type { TagDto } from "@norish/shared/contracts/dto/tag";
import { db } from "@norish/db/drizzle";
import { recipes, recipeTags, tags, userAllergies } from "@norish/db/schema";
import { TagSelectBaseSchema } from "@norish/shared/contracts/zod";
import { stripHtmlTags } from "@norish/shared/lib/helpers";
import { normalizeEnrichmentTagNames } from "@norish/shared/lib/recipe-enrichment";

const TagArraySchema = z.array(TagSelectBaseSchema);

export async function listAllTagNames(): Promise<string[]> {
  // Only return tags that are actually used by at least one recipe
  // NOTE: PostgreSQL's SELECT DISTINCT requires ORDER BY expressions to be in the select list
  const lowerName = sql<string>`lower(${tags.name})`.as("lower_name");
  const rows = await db
    .selectDistinct({ name: tags.name, lowerName })
    .from(tags)
    .innerJoin(recipeTags, eq(tags.id, recipeTags.tagId))
    .orderBy(lowerName);

  return rows.map((r) => r.name).filter(Boolean);
}

/**
 * List tag names used by recipes owned by the given users (typically the
 * requesting user plus their household members).
 */
export async function listTagNamesForUsers(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];

  const lowerName = sql<string>`lower(${tags.name})`.as("lower_name");
  const rows = await db
    .selectDistinct({ name: tags.name, lowerName })
    .from(tags)
    .innerJoin(recipeTags, eq(tags.id, recipeTags.tagId))
    .innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
    .where(inArray(recipes.userId, userIds))
    .orderBy(lowerName);

  return rows.map((r) => r.name).filter(Boolean);
}

/**
 * Every tag used by at least one recipe, id included — the smart cookbook
 * rule editor's vocabulary (rules are written in ids, not names).
 */
export async function listAllTags(): Promise<TagDto[]> {
  // Distinct: a tag used by several recipes joins once per recipe, and the
  // editor should offer each tag once.
  const rows = await db
    .selectDistinct()
    .from(tags)
    .innerJoin(recipeTags, eq(tags.id, recipeTags.tagId))
    .orderBy(sql`lower(${tags.name})`)
    .then((joined) => joined.map((r) => r.tags));

  const parsed = TagArraySchema.safeParse(rows);

  return parsed.success ? parsed.data : [];
}

/**
 * Tags used by recipes owned by the given users — the same scope as the
 * names-only read, with the ids the rule editor stores.
 */
export async function listTagsForUsers(userIds: string[]): Promise<TagDto[]> {
  if (!userIds.length) return [];

  const rows = await db
    .selectDistinct()
    .from(tags)
    .innerJoin(recipeTags, eq(tags.id, recipeTags.tagId))
    .innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
    .where(inArray(recipes.userId, userIds))
    .orderBy(sql`lower(${tags.name})`)
    .then((joined) => joined.map((r) => r.tags));

  const parsed = TagArraySchema.safeParse(rows);

  return parsed.success ? parsed.data : [];
}

function ensureNonEmptyName(name: string): string {
  const cleaned = stripHtmlTags(name);

  if (cleaned.length === 0) throw new Error("Tag name cannot be empty");

  return cleaned;
}

export async function findTagById(id: string): Promise<TagDto | null> {
  const rows = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  const parsed = TagSelectBaseSchema.safeParse(rows[0]);

  return parsed.success ? parsed.data : null;
}

export async function findTagByName(name: string): Promise<TagDto | null> {
  const cleaned = ensureNonEmptyName(name);
  const rows = await db
    .select()
    .from(tags)
    // Compare case-insensitively; stored value remains original case
    .where(eq(sql`lower(${tags.name})`, cleaned.toLowerCase()))
    .limit(1);

  const parsed = TagSelectBaseSchema.safeParse(rows[0]);

  return parsed.success ? parsed.data : null;
}

export async function createTag(name: string): Promise<TagDto> {
  const cleaned = ensureNonEmptyName(name);

  await db.insert(tags).values({ name: cleaned }).onConflictDoNothing();

  const after = await findTagByName(cleaned);

  if (!after) throw new Error("Failed to create or fetch tag");

  return after;
}

export async function getOrCreateTagByName(name: string): Promise<TagDto> {
  const cleaned = ensureNonEmptyName(name);

  const existing = await findTagByName(cleaned);

  if (existing) return existing;

  return createTag(cleaned);
}

export async function getOrCreateManyTags(names: string[]): Promise<TagDto[]> {
  const cleaned = names.map(stripHtmlTags).filter((n) => n.length > 0);

  if (cleaned.length === 0) return [];

  return await db.transaction(async (tx) => {
    await tx
      .insert(tags)
      .values(cleaned.map((name) => ({ name })))
      .onConflictDoNothing();

    const lowers = Array.from(new Set(cleaned.map((n) => n.toLowerCase())));
    const rows = await tx
      .select()
      .from(tags)
      .where(inArray(sql`lower(${tags.name})`, lowers));

    const parsed = TagArraySchema.safeParse(rows);

    if (!parsed.success) throw new Error("Failed to parse tags");

    return parsed.data;
  });
}

export async function getOrCreateManyTagsTx(tx: any, names: string[]): Promise<TagDto[]> {
  const cleaned = names.map(stripHtmlTags).filter((n) => n.length > 0);

  if (cleaned.length === 0) return [];

  await tx
    .insert(tags)
    .values(cleaned.map((name: string) => ({ name })))
    .onConflictDoNothing();

  const lowers = Array.from(new Set(cleaned.map((n) => n.toLowerCase())));
  const rows = await tx
    .select()
    .from(tags)
    .where(inArray(sql`lower(${tags.name})`, lowers));

  const parsed = TagArraySchema.safeParse(rows);

  if (!parsed.success) throw new Error("Failed to parse tags (tx)");

  return parsed.data;
}

export async function deleteOrphanedTagsTx(tx: any): Promise<void> {
  // A tag is only orphaned when neither recipes nor allergy settings use it.
  // Deleting an allergy-linked tag would cascade through user_allergies and
  // silently erase safety data.
  const orphanedTagIds = await tx
    .select({ id: tags.id })
    .from(tags)
    .leftJoin(recipeTags, eq(tags.id, recipeTags.tagId))
    .leftJoin(userAllergies, eq(tags.id, userAllergies.tagId))
    .where(and(isNull(recipeTags.tagId), isNull(userAllergies.tagId)))
    .then((rows: any[]) => rows.map((r) => r.id));

  if (orphanedTagIds.length === 0) return;

  await tx.delete(tags).where(inArray(tags.id, orphanedTagIds));
}

export async function attachTagsToRecipeTx(
  tx: any,
  recipeId: string,
  tagIds: string[],
  startOrder: number = 0
): Promise<void> {
  if (!tagIds.length) return;

  const rows = tagIds.map((tagId: string, index: number) => ({
    recipeId,
    tagId,
    order: startOrder + index,
  }));

  await tx.insert(recipeTags).values(rows).onConflictDoNothing();
}

export async function attachTagsToRecipeByInputTx(
  tx: any,
  recipeId: string,
  tagNames: string[]
): Promise<void> {
  // Delete existing tags for this recipe first
  await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));

  if (!tagNames.length) {
    // Clean up any orphaned tags created by removing all tags from this recipe
    await deleteOrphanedTagsTx(tx);
    return;
  }

  const created = await getOrCreateManyTagsTx(tx, tagNames);

  // Build a map from lowercase tag name to tag id for matching
  const tagNameToId = new Map<string, string>();

  for (const tag of created) {
    tagNameToId.set(tag.name.toLowerCase(), tag.id);
  }

  // Create rows preserving the original order from tagNames
  const rows = tagNames
    .map((name, index) => {
      const tagId = tagNameToId.get(name.toLowerCase());

      if (!tagId) return null;

      return { recipeId, tagId, order: index };
    })
    .filter((row): row is { recipeId: string; tagId: string; order: number } => row !== null);

  if (rows.length > 0) {
    await tx.insert(recipeTags).values(rows).onConflictDoNothing();
  }

  // Clean up any orphaned tags (tags that were removed from all recipes)
  await deleteOrphanedTagsTx(tx);
}

/**
 * Add tags to many recipes at once, creating missing tags as needed.
 * Returns the recipe ids that actually changed (each bumped one version).
 */
export async function bulkAddTagsToRecipes(
  recipeIds: string[],
  names: readonly string[]
): Promise<string[]> {
  const cleaned = names.map((n) => stripHtmlTags(n).trim()).filter((n) => n.length > 0);

  if (recipeIds.length === 0 || cleaned.length === 0) return [];

  const uniqueIds = Array.from(new Set(recipeIds));

  return await db.transaction(async (tx) => {
    const tagIds = (await getOrCreateManyTagsTx(tx, cleaned)).map((t) => t.id);
    const affected: string[] = [];

    for (const recipeId of uniqueIds) {
      const existing = await tx
        .select({ tagId: recipeTags.tagId })
        .from(recipeTags)
        .where(and(eq(recipeTags.recipeId, recipeId), inArray(recipeTags.tagId, tagIds)));

      const present = new Set(existing.map((r) => r.tagId));
      const missing = tagIds.filter((id) => !present.has(id));

      if (missing.length === 0) continue;

      const maxOrder = await tx
        .select({ max: sql<number>`max(${recipeTags.order})` })
        .from(recipeTags)
        .where(eq(recipeTags.recipeId, recipeId))
        .then((rows) => rows[0]?.max ?? -1);

      await tx
        .insert(recipeTags)
        .values(missing.map((tagId, index) => ({ recipeId, tagId, order: maxOrder + 1 + index })));

      await tx
        .update(recipes)
        .set({ updatedAt: new Date(), version: sql`${recipes.version} + 1` })
        .where(eq(recipes.id, recipeId));

      affected.push(recipeId);
    }

    return affected;
  });
}

/**
 * Remove tags from many recipes at once, cleaning up any tags left unused.
 * Returns the recipe ids that actually changed (each bumped one version).
 */
export async function bulkRemoveTagsFromRecipes(
  recipeIds: string[],
  names: readonly string[]
): Promise<string[]> {
  const cleaned = names.map((n) => stripHtmlTags(n).trim()).filter((n) => n.length > 0);

  if (recipeIds.length === 0 || cleaned.length === 0) return [];

  const uniqueIds = Array.from(new Set(recipeIds));

  return await db.transaction(async (tx) => {
    const lowers = Array.from(new Set(cleaned.map((n) => n.toLowerCase())));
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(sql`lower(${tags.name})`, lowers));

    if (rows.length === 0) return [];

    const tagIds = rows.map((r) => r.id);
    const affected: string[] = [];

    for (const recipeId of uniqueIds) {
      const deleted = await tx
        .delete(recipeTags)
        .where(and(eq(recipeTags.recipeId, recipeId), inArray(recipeTags.tagId, tagIds)));

      if ((deleted.rowCount ?? 0) === 0) continue;

      await tx
        .update(recipes)
        .set({ updatedAt: new Date(), version: sql`${recipes.version} + 1` })
        .where(eq(recipes.id, recipeId));

      affected.push(recipeId);
    }

    await deleteOrphanedTagsTx(tx);

    return affected;
  });
}

export type TagWithUsage = { id: string; name: string; usage: number };

/** Every tag with the number of recipes carrying it, for the tag manager. */
export async function listTagsWithUsage(): Promise<TagWithUsage[]> {
  return await db
    .select({
      id: tags.id,
      name: tags.name,
      usage: sql<number>`count(${recipeTags.tagId})::int`,
    })
    .from(tags)
    .leftJoin(recipeTags, eq(recipeTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(sql`lower(${tags.name})`);
}

/**
 * Delete a tag everywhere. Refuses tags referenced as a household allergy —
 * deleting those would cascade safety data (user_allergies onDelete cascade).
 * Returns the recipe ids that lost the tag.
 */
export async function deleteTagCompletely(tagId: string): Promise<string[]> {
  return await db.transaction(async (tx) => {
    const allergyRefs = await tx
      .select({ tagId: userAllergies.tagId })
      .from(userAllergies)
      .where(eq(userAllergies.tagId, tagId))
      .limit(1);

    if (allergyRefs.length > 0) {
      throw new Error("A tag used as a household allergy cannot be deleted");
    }

    const affected = await tx
      .select({ recipeId: recipeTags.recipeId })
      .from(recipeTags)
      .where(eq(recipeTags.tagId, tagId))
      .orderBy(recipeTags.recipeId)
      .then((rows) => rows.map((r) => r.recipeId));

    await tx.delete(recipeTags).where(eq(recipeTags.tagId, tagId));
    await tx.delete(tags).where(eq(tags.id, tagId));

    for (const recipeId of affected) {
      await tx
        .update(recipes)
        .set({ updatedAt: new Date(), version: sql`${recipes.version} + 1` })
        .where(eq(recipes.id, recipeId));
    }

    return affected;
  });
}

export async function getRecipeTagNames(recipeId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(eq(recipeTags.recipeId, recipeId))
    .orderBy(asc(recipeTags.order));

  return rows.map((r) => r.name);
}

export async function getRecipeTagNamesTx(tx: any, recipeId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: tags.name })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(eq(recipeTags.recipeId, recipeId))
    .orderBy(asc(recipeTags.order));

  return rows.map((r: { name: string }) => r.name);
}

/**
 * Update a tag's name. Returns the updated tag or null if not found.
 * If the new name conflicts with an existing tag (case-insensitive), merge them.
 */
export async function updateTagName(
  oldName: string,
  newName: string
): Promise<{ merged: boolean; newName: string } | null> {
  const cleanedOld = stripHtmlTags(oldName);
  const cleanedNew = ensureNonEmptyName(newName);

  if (cleanedOld.toLowerCase() === cleanedNew.toLowerCase()) {
    // Same name (case-insensitive), just update the casing
    await db
      .update(tags)
      .set({ name: cleanedNew, version: sql`${tags.version} + 1` })
      .where(eq(sql`lower(${tags.name})`, cleanedOld.toLowerCase()));

    return { merged: false, newName: cleanedNew };
  }

  return await db.transaction(async (tx) => {
    // Find the old tag
    const oldTag = await tx
      .select()
      .from(tags)
      .where(eq(sql`lower(${tags.name})`, cleanedOld.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0]);

    if (!oldTag) return null;

    // Check if target name already exists
    const existingTag = await tx
      .select()
      .from(tags)
      .where(eq(sql`lower(${tags.name})`, cleanedNew.toLowerCase()))
      .limit(1)
      .then((rows) => rows[0]);

    if (existingTag) {
      // Merge: update all recipe_tags to point to existing tag, delete old tag
      await tx
        .update(recipeTags)
        .set({ tagId: existingTag.id, version: sql`${recipeTags.version} + 1` })
        .where(eq(recipeTags.tagId, oldTag.id));

      await tx.delete(tags).where(eq(tags.id, oldTag.id));

      return { merged: true, newName: existingTag.name };
    } else {
      // Simple rename
      await tx
        .update(tags)
        .set({ name: cleanedNew, version: sql`${tags.version} + 1` })
        .where(eq(tags.id, oldTag.id));

      return { merged: false, newName: cleanedNew };
    }
  });
}

/**
 * Remove a tag from a specific recipe (not globally).
 */
export async function removeTagFromRecipe(recipeId: string, tagName: string): Promise<boolean> {
  const cleaned = stripHtmlTags(tagName);

  const tag = await findTagByName(cleaned);

  if (!tag) return false;

  const result = await db
    .delete(recipeTags)
    .where(sql`${recipeTags.recipeId} = ${recipeId} AND ${recipeTags.tagId} = ${tag.id}`);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Append Recipe Enrichment findings to a recipe's tags.
 *
 * Inserts only the links that are missing and never deletes an existing one, so
 * supplied tags survive and auto-tagging and allergy detection can finish in any
 * order — or concurrently — without losing each other's findings. The composite
 * primary key on (recipe, tag) makes a retried job a no-op rather than an error.
 *
 * @returns the tags this call actually added, and the resulting full tag list
 */
export async function appendRecipeTags(
  recipeId: string,
  incomingTagNames: readonly string[]
): Promise<{ added: string[]; allTags: string[] }> {
  const normalized = normalizeEnrichmentTagNames(incomingTagNames);

  if (normalized.length === 0) {
    return { added: [], allTags: await getRecipeTagNames(recipeId) };
  }

  return await db.transaction(async (tx) => {
    const existingTags = await getRecipeTagNamesTx(tx, recipeId);
    const existingLower = new Set(existingTags.map((name) => name.toLowerCase()));
    const added = normalized.filter((name) => !existingLower.has(name.toLowerCase()));

    if (added.length === 0) {
      return { added, allTags: existingTags };
    }

    const created = await getOrCreateManyTagsTx(tx, added);
    const tagIdByName = new Map(created.map((tag) => [tag.name.toLowerCase(), tag.id]));

    const rows = added
      .map((name, index) => {
        const tagId = tagIdByName.get(name.toLowerCase());

        if (!tagId) return null;

        return { recipeId, tagId, order: existingTags.length + index };
      })
      .filter((row): row is { recipeId: string; tagId: string; order: number } => row !== null);

    if (rows.length > 0) {
      await tx.insert(recipeTags).values(rows).onConflictDoNothing();
    }

    return { added, allTags: [...existingTags, ...added] };
  });
}

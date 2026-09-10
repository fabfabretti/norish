import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import type { CookbookRuleDTO, CookbookSummaryDTO } from "@norish/shared/contracts";
import type { SortOrder } from "@norish/shared/contracts/store-types";
import { db } from "@norish/db/drizzle";

import type { MutationOutcome } from "./mutation-outcomes";
import type { RecipeListContext } from "./recipes";
import { cookbookRecipes, cookbooks, recipes, recipeTags, tags } from "../schema";
import { COOKBOOK_DESCRIPTION_TITLE_LIMIT, CookbookSummarySchema } from "../zodSchemas";
import { appliedOutcome, staleOutcome } from "./mutation-outcomes";
import {
  buildOwnerPolicyCondition,
  matchTagRuleRecipeIds,
  PRIMARY_IMAGE_SQL,
} from "./recipes";

/** How many member images the derived cover mosaic asks for. */
const COVER_TILE_COUNT = 4;

/**
 * What a card can say about a cookbook without the cookbook storing any of it.
 *
 * Derived from the members the reader can see, at read time, exactly as the
 * cover is — so none of it can go stale and none of it is a field anyone has
 * to maintain.
 */
type MemberSummary = {
  memberCount: number;
  coverImages: string[];
  memberTitles: string[];
  memberTags: string[];
  totalMinutes: number | null;
  minServings: number | null;
};

function emptyMemberSummary(): MemberSummary {
  return {
    memberCount: 0,
    coverImages: [],
    memberTitles: [],
    memberTags: [],
    totalMinutes: null,
    minServings: null,
  };
}

/**
 * One member's cooking time, read the way every recipe surface reads it:
 * the stated total when there is one, otherwise prep and cook added up. A
 * recipe that states none of the three contributes nothing rather than zero,
 * so a cookbook of untimed recipes says nothing instead of saying "0m".
 */
const MEMBER_MINUTES_SQL = sql<number | null>`CASE
  WHEN ${recipes.totalMinutes} IS NOT NULL THEN ${recipes.totalMinutes}
  WHEN ${recipes.prepMinutes} IS NOT NULL OR ${recipes.cookMinutes} IS NOT NULL
    THEN COALESCE(${recipes.prepMinutes}, 0) + COALESCE(${recipes.cookMinutes}, 0)
  ELSE NULL
END`;

type CookbookRow = {
  id: string;
  userId: string | null;
  title: string;
  rule: CookbookRuleDTO;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

const COOKBOOK_COLUMNS = {
  id: cookbooks.id,
  userId: cookbooks.userId,
  title: cookbooks.title,
  rule: cookbooks.rule,
  createdAt: cookbooks.createdAt,
  updatedAt: cookbooks.updatedAt,
  version: cookbooks.version,
} as const;

/** The four sorts both kinds of Library row can answer. */
export function cookbookOrderBy(sortMode: SortOrder) {
  switch (sortMode) {
    case "titleAsc":
      return asc(cookbooks.title);
    case "titleDesc":
      return desc(cookbooks.title);
    case "dateAsc":
      return asc(cookbooks.createdAt);
    case "none":
      return undefined;
    default:
      return desc(cookbooks.createdAt);
  }
}

/**
 * A cookbook title matches on its title alone — a cookbook has nothing else
 * to offer a search, which is why it can never be found by its members'
 * names (ADR-0026). Plain prefix matching rather than a tsvector: one short
 * field, and a rank that could not be compared with a recipe's anyway.
 */
export function cookbookTitleMatch(search: string) {
  const terms = search
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  if (terms.length === 0) return undefined;

  const patterns = terms.map(
    (term) => `%${term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
  );

  return sql.join(
    patterns.map((pattern) => sql`${cookbooks.title} ILIKE ${pattern}`),
    sql` OR `
  );
}

/**
 * Every distinct tag name across the members this reader can see.
 *
 * The reader's allergy list lives on the client — it is their household's
 * list, or their own — so the server cannot answer "which allergens are in
 * here" and answers "which tags are in here" instead. Every one of them: a
 * cap drops whichever tags it orders last, and the whole point of this field
 * is a warning that must not go missing.
 *
 * Reads the members of both kinds of cookbook through one `recipeTags` pass,
 * so a smart cookbook gathers the tags its derived members carry exactly as a
 * manual one gathers its filed members' tags.
 */
async function memberTags(
  members: Map<string, string[]>,
  policyCondition: SQL | undefined
): Promise<Map<string, string[]>> {
  const byCookbook = new Map<string, string[]>();
  const allRecipeIds = Array.from(new Set(Array.from(members.values()).flat()));

  if (allRecipeIds.length === 0) return byCookbook;

  const rows = await db
    .selectDistinct({ recipeId: recipeTags.recipeId, name: tags.name })
    .from(recipeTags)
    .innerJoin(recipes, eq(recipeTags.recipeId, recipes.id))
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(
      policyCondition
        ? and(inArray(recipeTags.recipeId, allRecipeIds), policyCondition)
        : inArray(recipeTags.recipeId, allRecipeIds)
    )
    .orderBy(asc(tags.name));

  const namesByRecipe = new Map<string, string[]>();

  for (const row of rows) {
    const names = namesByRecipe.get(row.recipeId) ?? [];

    names.push(row.name);
    namesByRecipe.set(row.recipeId, names);
  }

  for (const [cookbookId, recipeIds] of members) {
    const seen = new Set<string>();

    for (const recipeId of recipeIds) {
      for (const name of namesByRecipe.get(recipeId) ?? []) {
        seen.add(name);
      }
    }

    byCookbook.set(cookbookId, [...seen].sort());
  }

  return byCookbook;
}

/**
 * The viewer-scoped read model each card needs: how many members this reader
 * can see, the first few of their primary images for the derived cover, and
 * the handful of derived facts a card states about the set as a whole.
 *
 * Both membership sources route through one policy-conditioned recipe read,
 * so the count and the list agree by construction and two readers may
 * honestly see two different counts (ADR-0027). Manual cookbooks read the
 * join table; a smart cookbook's members are the recipes its tag rule matches
 * at read time. Images resolve through the same gallery-first SQL recipes
 * use, so the deprecated scalar is never read directly. Ordered by the
 * member's own creation time so the mosaic and the derived description are
 * stable between reads.
 */
async function memberSummaries(
  ctx: RecipeListContext,
  rows: CookbookRow[]
): Promise<Map<string, MemberSummary>> {
  const summaries = new Map<string, MemberSummary>();

  if (rows.length === 0) return summaries;

  const policyCondition = await buildOwnerPolicyCondition(ctx, recipes.userId, "view");
  const manualIds = rows.filter((row) => row.rule.kind === "manual").map((row) => row.id);
  const smartRows = rows.filter(
    (row): row is CookbookRow & { rule: Extract<CookbookRuleDTO, { kind: "tags" }> } =>
      row.rule.kind === "tags"
  );

  // cookbookId -> member recipe ids, gathered from whichever source the rule
  // says a cookbook is made of.
  const members = new Map<string, string[]>();

  for (const id of manualIds) members.set(id, []);
  for (const row of smartRows) members.set(row.id, []);

  if (manualIds.length > 0) {
    const membership = inArray(cookbookRecipes.cookbookId, manualIds);

    const rows = await db
      .select({
        cookbookId: cookbookRecipes.cookbookId,
        recipeId: cookbookRecipes.recipeId,
      })
      .from(cookbookRecipes)
      // The policy condition reads the recipe's owner, so the join stays even
      // though only the pair is selected (ADR-0027).
      .innerJoin(recipes, eq(cookbookRecipes.recipeId, recipes.id))
      .where(policyCondition ? and(membership, policyCondition) : membership);

    for (const row of rows) {
      members.get(row.cookbookId)?.push(row.recipeId);
    }
  }

  if (smartRows.length > 0) {
    // Derived, not stored: matching the whole recipe-to-tag map once serves
    // every smart cookbook on the page. (ponytail: in-memory over a pure-SQL
    // GROUP BY ... HAVING count; a per-tag EXISTS query is the upgrade if a
    // household grows into thousands of recipes.)
    for (const row of smartRows) {
      members.set(row.id, await matchTagRuleRecipeIds(row.rule));
    }
  }

  const allRecipeIds = Array.from(new Set(Array.from(members.values()).flat()));
  const detailRows =
    allRecipeIds.length > 0
      ? await db
          .select({
            recipeId: recipes.id,
            image: PRIMARY_IMAGE_SQL,
            name: recipes.name,
            servings: recipes.servings,
            minutes: MEMBER_MINUTES_SQL,
          })
          .from(recipes)
          .where(
            policyCondition
              ? and(inArray(recipes.id, allRecipeIds), policyCondition)
              : inArray(recipes.id, allRecipeIds)
          )
          .orderBy(asc(recipes.createdAt), asc(recipes.id))
      : [];

  const detailById = new Map(detailRows.map((row) => [row.recipeId, row]));

  const [tagsByCookbook] = await Promise.all([memberTags(members, policyCondition)]);

  for (const [cookbookId, recipeIds] of members) {
    const entry = emptyMemberSummary();

    for (const recipeId of recipeIds) {
      const row = detailById.get(recipeId);

      if (!row) continue;

      entry.memberCount += 1;

      if (row.image && entry.coverImages.length < COVER_TILE_COUNT) {
        entry.coverImages.push(row.image);
      }

      if (entry.memberTitles.length < COOKBOOK_DESCRIPTION_TITLE_LIMIT) {
        entry.memberTitles.push(row.name);
      }

      const minutes = row.minutes === null ? null : Number(row.minutes);

      if (minutes !== null && Number.isFinite(minutes)) {
        entry.totalMinutes = (entry.totalMinutes ?? 0) + minutes;
      }

      if (row.servings > 0) {
        entry.minServings =
          entry.minServings === null ? row.servings : Math.min(entry.minServings, row.servings);
      }
    }

    summaries.set(cookbookId, entry);
  }

  for (const [cookbookId, names] of tagsByCookbook) {
    const entry = summaries.get(cookbookId);

    if (entry) entry.memberTags = names;
  }

  return summaries;
}

function toCookbookSummary(
  row: CookbookRow,
  members: MemberSummary | undefined
): CookbookSummaryDTO {
  const parsed = CookbookSummarySchema.safeParse({
    ...row,
    ...(members ?? emptyMemberSummary()),
  });

  if (!parsed.success) throw new Error("CookbookSummaryDTO parse failed");

  return parsed.data;
}

export async function withMemberSummaries(
  ctx: RecipeListContext,
  rows: CookbookRow[]
): Promise<CookbookSummaryDTO[]> {
  const members = await memberSummaries(ctx, rows);

  return rows.map((row) => toCookbookSummary(row, members.get(row.id)));
}

/**
 * The cookbook's owner, or `null` when it is Orphaned — distinguished from a
 * cookbook that is not there at all, which returns `null` for the whole row.
 */
export async function getCookbookRow(id: string): Promise<CookbookRow | null> {
  const [row] = await db
    .select(COOKBOOK_COLUMNS)
    .from(cookbooks)
    .where(eq(cookbooks.id, id))
    .limit(1);

  return row ?? null;
}

/** One cookbook, as its own page reads it, or null when out of view. */
export async function getCookbookForViewer(
  ctx: RecipeListContext,
  id: string
): Promise<CookbookSummaryDTO | null> {
  const policyCondition = await buildOwnerPolicyCondition(ctx, cookbooks.userId, "view");
  const [row] = await db
    .select(COOKBOOK_COLUMNS)
    .from(cookbooks)
    .where(policyCondition ? and(eq(cookbooks.id, id), policyCondition) : eq(cookbooks.id, id))
    .limit(1);

  if (!row) return null;

  const [summary] = await withMemberSummaries(ctx, [row]);

  return summary ?? null;
}

export async function createCookbook(input: {
  id?: string;
  userId: string;
  title: string;
  rule?: CookbookRuleDTO;
}): Promise<CookbookSummaryDTO> {
  const [row] = await db
    .insert(cookbooks)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId: input.userId,
      title: input.title,
      rule: input.rule ?? { kind: "manual" },
    })
    .returning(COOKBOOK_COLUMNS);

  if (!row) throw new Error("Failed to create cookbook");

  return toCookbookSummary(row, undefined);
}

export async function renameCookbook(
  id: string,
  title: string,
  version: number
): Promise<MutationOutcome<CookbookRow>> {
  const [row] = await db
    .update(cookbooks)
    .set({ title, updatedAt: new Date(), version: sql`${cookbooks.version} + 1` })
    .where(and(eq(cookbooks.id, id), eq(cookbooks.version, version)))
    .returning(COOKBOOK_COLUMNS);

  if (!row) return staleOutcome();

  return appliedOutcome(row);
}

/**
 * Turn a cookbook's rule into a new one under the same optimistic
 * concurrency a rename uses.
 *
 * A smart cookbook is rule-editable and nothing else: this is what replaces
 * the membership panel for it, and "manual" here means an empty set until it
 * is filed into by hand.
 */
export async function updateCookbookRule(
  id: string,
  version: number,
  rule: CookbookRuleDTO
): Promise<MutationOutcome<CookbookRow>> {
  const [row] = await db
    .update(cookbooks)
    .set({ rule, updatedAt: new Date(), version: sql`${cookbooks.version} + 1` })
    .where(and(eq(cookbooks.id, id), eq(cookbooks.version, version)))
    .returning(COOKBOOK_COLUMNS);

  if (!row) return staleOutcome();

  return appliedOutcome(row);
}

/**
 * Delete a cookbook. Its members' rows go with it through the membership
 * cascade; the recipes themselves are never touched.
 */
export async function deleteCookbookById(
  id: string,
  version?: number
): Promise<MutationOutcome<void>> {
  const conditions = [eq(cookbooks.id, id)];

  if (version) conditions.push(eq(cookbooks.version, version));

  const deleted = await db
    .delete(cookbooks)
    .where(and(...conditions))
    .returning({ id: cookbooks.id });

  if (deleted.length === 0 && version) return staleOutcome();

  return appliedOutcome(undefined);
}

/** Every cookbook this reader may see, under the active sort. */
export async function listCookbooks(
  ctx: RecipeListContext,
  {
    limit,
    offset = 0,
    search,
    sortMode = "dateDesc",
  }: { limit: number; offset?: number; search?: string; sortMode?: SortOrder }
): Promise<{ cookbooks: CookbookSummaryDTO[]; total: number }> {
  const conditions: SQL[] = [];
  const policyCondition = await buildOwnerPolicyCondition(ctx, cookbooks.userId, "view");

  if (policyCondition) conditions.push(policyCondition);

  if (search) {
    const titleMatch = cookbookTitleMatch(search);

    if (titleMatch) conditions.push(sql`(${titleMatch})`);
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;
  const orderBy = cookbookOrderBy(sortMode);

  const [rows, totals] = await Promise.all([
    orderBy
      ? db
          .select(COOKBOOK_COLUMNS)
          .from(cookbooks)
          .where(whereClause)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset)
      : db.select(COOKBOOK_COLUMNS).from(cookbooks).where(whereClause).limit(limit).offset(offset),
    db.select({ total: count() }).from(cookbooks).where(whereClause),
  ]);

  return {
    cookbooks: await withMemberSummaries(ctx, rows),
    total: Number(totals[0]?.total ?? 0),
  };
}

/** A known set of cookbooks, in the order the caller asked for them. */
export async function listCookbooksByIds(
  ctx: RecipeListContext,
  ids: string[]
): Promise<CookbookSummaryDTO[]> {
  if (ids.length === 0) return [];

  const policyCondition = await buildOwnerPolicyCondition(ctx, cookbooks.userId, "view");
  const idCondition = inArray(cookbooks.id, ids);

  const rows = await db
    .select(COOKBOOK_COLUMNS)
    .from(cookbooks)
    .where(policyCondition ? and(idCondition, policyCondition) : idCondition);

  const summaries = await withMemberSummaries(ctx, rows);
  const byId = new Map(summaries.map((summary) => [summary.id, summary]));

  return ids.flatMap((id) => {
    const summary = byId.get(id);

    return summary ? [summary] : [];
  });
}

/** The cookbooks holding a recipe, as its own page lists them. */
export async function listCookbooksForRecipe(
  ctx: RecipeListContext,
  recipeId: string
): Promise<CookbookSummaryDTO[]> {
  const policyCondition = await buildOwnerPolicyCondition(ctx, cookbooks.userId, "view");
  const membership = eq(cookbookRecipes.recipeId, recipeId);

  const rows = await db
    .select(COOKBOOK_COLUMNS)
    .from(cookbookRecipes)
    .innerJoin(cookbooks, eq(cookbookRecipes.cookbookId, cookbooks.id))
    .where(policyCondition ? and(membership, policyCondition) : membership)
    .orderBy(asc(cookbooks.title));

  return withMemberSummaries(ctx, rows);
}

/**
 * Every cookbook this reader may edit — the membership panel's whole list.
 *
 * Deliberately not scoped to a recipe: which cookbooks a reader may edit is
 * the same answer whatever they are filing, so one read serves every recipe
 * page and the Warm Set has one thing to guarantee rather than one per
 * recipe (ADR-0009). Whether a given cookbook already holds the recipe comes
 * from the recipe's own membership read.
 */
export async function listEditableCookbooks(ctx: RecipeListContext): Promise<CookbookSummaryDTO[]> {
  const policyCondition = await buildOwnerPolicyCondition(ctx, cookbooks.userId, "edit");

  const rows = await db
    .select(COOKBOOK_COLUMNS)
    .from(cookbooks)
    .where(policyCondition)
    .orderBy(asc(cookbooks.title));

  // Only a hand-curated cookbook can hold a filed recipe: a smart one derives
  // its members from its rule, so offering it in the file-in panel would let
  // a choice fight the tag match.
  const manualRows = rows.filter((row) => row.rule.kind === "manual");

  return withMemberSummaries(ctx, manualRows);
}

/**
 * File a recipe into a cookbook. Idempotent by the unique pair, so a double
 * tap changes nothing, and the recipe row is never written (ADR-0027).
 */
export async function addRecipeToCookbook(cookbookId: string, recipeId: string): Promise<void> {
  await db.insert(cookbookRecipes).values({ cookbookId, recipeId }).onConflictDoNothing();
}

/** Take a recipe out of a cookbook. Removing what is not there is a no-op. */
export async function removeRecipeFromCookbook(
  cookbookId: string,
  recipeId: string
): Promise<void> {
  await db
    .delete(cookbookRecipes)
    .where(and(eq(cookbookRecipes.cookbookId, cookbookId), eq(cookbookRecipes.recipeId, recipeId)));
}

/** Which of these recipes this cookbook holds — the membership toggles. */
export async function listCookbookMemberIds(
  cookbookId: string,
  rule: CookbookRuleDTO = { kind: "manual" }
): Promise<string[]> {
  // A smart cookbook has no filed members: the ids are what its rule matches
  // right now, so a bulk-fill reader sees the same set the page would.
  if (rule.kind === "tags") {
    return matchTagRuleRecipeIds(rule);
  }

  const rows = await db
    .select({ recipeId: cookbookRecipes.recipeId })
    .from(cookbookRecipes)
    .where(eq(cookbookRecipes.cookbookId, cookbookId));

  return rows.map((row) => row.recipeId);
}

export type { CookbookRow };

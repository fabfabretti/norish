import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { recipes } from "./recipes";
import { mutableRowColumns } from "./shared";

/**
 * What makes a cookbook automatic rather than hand-filed.
 *
 * `"manual"` is the default and every cookbook pre-dating this column; a
 * smart cookbook carries the tag rule its members are derived from. The same
 * `matchMode` the recipe list already understands (AND/OR) decides whether a
 * recipe needs every chosen tag or any of them.
 */
export type CookbookRule =
  | { kind: "manual" }
  | { kind: "tags"; tagIds: string[]; matchMode: "AND" | "OR" };

/**
 * A Cookbook: a titled set of recipes, and nothing else.
 *
 * It carries a `userId` like a recipe and is seen, edited and deleted under
 * the instance's `RECIPE_PERMISSION_POLICY` rather than a rule of its own
 * (ADR-0027); deleting an account detaches the cookbooks it made instead of
 * destroying them, and an orphaned row is visible to everyone under every
 * policy exactly as an orphaned recipe is.
 *
 * There is deliberately no cover column and no description. The cover is
 * derived at read time from the members' own images, so it can never go
 * stale and there is nothing to upload.
 */
export const cookbooks = pgTable(
  "cookbooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    /**
     * NULL-free: every cookbook is described by a rule, and `"manual"` is the
     * rule a hand-curated set carries. Smart membership is derived from this
     * at read time, so recipe or tag edits update the set with no backfill.
     */
    rule: jsonb("rule").$type<CookbookRule>().notNull().default({ kind: "manual" }),
    ...mutableRowColumns,
  },
  (t) => [
    index("idx_cookbooks_user_id").on(t.userId),
    index("idx_cookbooks_title").on(t.title),
    index("idx_cookbooks_created_at_desc").on(t.createdAt.desc()),
  ]
);

/**
 * Membership: which recipes are in which cookbook.
 *
 * Unique on the pair, so filing the same recipe twice changes nothing, and
 * cascading from both sides — deleting a recipe takes it out of every
 * cookbook it was in and leaves those cookbooks standing, deleting a
 * cookbook leaves every recipe it held untouched.
 *
 * There is no order column: a Cookbook is a set, not a sequence. The row's
 * own `createdAt` costs nothing and leaves "recently added" available as a
 * future sort.
 */
export const cookbookRecipes = pgTable(
  "cookbook_recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cookbookId: uuid("cookbook_id")
      .notNull()
      .references(() => cookbooks.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_cookbook_recipes_cookbook_recipe").on(t.cookbookId, t.recipeId),
    index("idx_cookbook_recipes_cookbook_id").on(t.cookbookId),
    index("idx_cookbook_recipes_recipe_id").on(t.recipeId),
  ]
);

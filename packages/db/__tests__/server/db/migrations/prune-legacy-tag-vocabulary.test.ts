// @vitest-environment node
/**
 * Legacy vocabulary leaves the tag pool.
 *
 * Tested through the migration runner the server actually uses, against a
 * database seeded with recipes as they existed before it: a one-time data
 * migration is only correct if it is correct against real prior state, and
 * only safe if running it again changes nothing.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestDatabase,
  generateTestDbName,
  teardownTestDatabase,
} from "../../../helpers/db-setup";

const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../src/migrations"
);
const PRUNE_MIGRATION = resolve(MIGRATIONS_FOLDER, "0046_prune_legacy_tag_vocabulary.sql");

/** Tags the migration must remove (associations and rows); `tofu` is allergy-guarded and asserted separately below. */
const RETIRED = [
  "kid-friendly",
  "chicken",
  "rice",
  "ricettavuna",
  "airfryer",
  "appetizer",
  "seitan",
  "shrimp",
];

describe("the legacy tag vocabulary leaving the pool", () => {
  const testDbName = generateTestDbName("test_prune_legacy_vocabulary");
  let pool: pg.Pool;
  let userId: string;

  const recipes = {
    legacy: randomUUID(),
    clean: randomUUID(),
    untagged: randomUUID(),
  };

  async function applyPruneMigration(): Promise<void> {
    const sql = await readFile(PRUNE_MIGRATION, "utf8");

    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() === "") continue;

      await pool.query(statement);
    }
  }

  async function tagNames(recipeId: string): Promise<string[]> {
    const result = await pool.query<{ name: string }>(
      `SELECT t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
       WHERE rt.recipe_id = $1 ORDER BY rt."order"`,
      [recipeId]
    );

    return result.rows.map((row) => row.name);
  }

  async function allTagNames(): Promise<string[]> {
    const result = await pool.query<{ name: string }>("SELECT name FROM tags ORDER BY name");

    return result.rows.map((row) => row.name);
  }

  async function tagRecipe(recipeId: string, names: string[]): Promise<void> {
    for (const [order, name] of names.entries()) {
      const tag = await pool.query<{ id: string }>(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT DO NOTHING RETURNING id`,
        [name]
      );
      const tagId =
        tag.rows[0]?.id ??
        (
          await pool.query<{ id: string }>("SELECT id FROM tags WHERE lower(name) = lower($1)", [
            name,
          ])
        ).rows[0]!.id;

      await pool.query(`INSERT INTO recipe_tags (recipe_id, tag_id, "order") VALUES ($1, $2, $3)`, [
        recipeId,
        tagId,
        order,
      ]);
    }
  }

  beforeAll(async () => {
    const testDbUrl = await createTestDatabase(testDbName);

    pool = new pg.Pool({ connectionString: testDbUrl });

    const journal = JSON.parse(
      await readFile(resolve(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")
    );

    const prior = journal.entries.filter(
      (entry: { tag: string }) => entry.tag !== "0046_prune_legacy_tag_vocabulary"
    );

    for (const entry of prior) {
      const sql = await readFile(resolve(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");

      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim() === "") continue;

        await pool.query(statement);
      }
    }

    userId = `user-${randomUUID()}`;
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, 'Test', $2, false, now(), now())`,
      [userId, `${userId}@example.com`]
    );

    for (const [role, id] of Object.entries(recipes)) {
      await pool.query("INSERT INTO recipes (id, user_id, name) VALUES ($1, $2, $3)", [
        id,
        userId,
        `Recipe ${role}`,
      ]);
    }

    // A recipe carrying pruned vocabulary and tags that must survive.
    await tagRecipe(recipes.legacy, [
      "kid-friendly",
      "tofu",
      "chicken",
      "rice",
      "ricettavuna",
      "vegetarian",
      "dairy-free",
    ]);
    // A recipe with only kept nutrition tags.
    await tagRecipe(recipes.clean, ["gluten-free", "low-carb", "vegetarian"]);

    // An allergy pinned to pruned vocabulary must protect that tag from removal.
    const allergyTagId = (
      await pool.query<{ id: string }>("SELECT id FROM tags WHERE lower(name) = 'tofu'")
    ).rows[0]!.id;
    await pool.query("INSERT INTO user_allergies (user_id, tag_id) VALUES ($1, $2)", [
      userId,
      allergyTagId,
    ]);

    await applyPruneMigration();
  }, 300_000);

  afterAll(async () => {
    await pool.end();
    await teardownTestDatabase(testDbName);
  });

  it("removes the pruned tags from the recipes that carried them", async () => {
    expect(await tagNames(recipes.legacy)).toEqual(["tofu", "vegetarian", "dairy-free"]);
  });

  it("deletes the pruned tag rows, not just the associations", async () => {
    const names = await allTagNames();

    for (const retired of RETIRED) {
      expect(names, retired).not.toContain(retired);
    }
  });

  it("keeps the nutrition tags that preceded the kit", async () => {
    const names = await allTagNames();

    expect(names).toEqual(expect.arrayContaining(["gluten-free", "dairy-free", "low-carb"]));
    expect(await tagNames(recipes.clean)).toEqual(["gluten-free", "low-carb", "vegetarian"]);
  });

  it("preserves a pruned tag someone recorded as an allergy", async () => {
    const names = await allTagNames();

    expect(names).toContain("tofu");
    expect(await tagNames(recipes.legacy)).toEqual(["tofu", "vegetarian", "dairy-free"]);
  });

  it("leaves a recipe with no pruned tags alone", async () => {
    expect(await tagNames(recipes.untagged)).toEqual([]);
  });

  it("is a no-op when it runs again", async () => {
    const before = {
      tags: await allTagNames(),
      legacy: await tagNames(recipes.legacy),
      clean: await tagNames(recipes.clean),
    };

    await applyPruneMigration();

    expect(await allTagNames()).toEqual(before.tags);
    expect(await tagNames(recipes.legacy)).toEqual(before.legacy);
    expect(await tagNames(recipes.clean)).toEqual(before.clean);
  });
});

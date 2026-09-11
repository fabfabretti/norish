// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@norish/db/drizzle";
import {
  attachTagsToRecipeByInputTx,
  bulkAddTagsToRecipes,
  bulkRemoveTagsFromRecipes,
  deleteTagCompletely,
  findTagById,
  findTagByName,
  getRecipeTagNames,
  listAllTagNames,
  listTagsWithUsage,
} from "@norish/db/repositories/tags";
import { recipes, userAllergies } from "@norish/db/schema";

import { createTestRecipe, createTestUser } from "../../../helpers/db-test-helpers";
import { RepositoryTestBase } from "../../../helpers/repository-test-base";

const testBase = new RepositoryTestBase("test_tags");
let testRecipe: Awaited<ReturnType<typeof createTestRecipe>>;

describe("Tags Repository", () => {
  beforeAll(async () => {
    await testBase.setup();
  });

  beforeEach(async () => {
    const [, recipe] = await testBase.beforeEachTest();
    testRecipe = recipe;
  });

  afterAll(async () => {
    await testBase.teardown();
  });

  it("removes unused tags and keeps the new casing when recreating them", async () => {
    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, ["JavaScript"]);
    });

    expect(await getRecipeTagNames(testRecipe.id)).toEqual(["JavaScript"]);
    expect(await listAllTagNames()).toContain("JavaScript");

    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, []);
    });

    expect(await getRecipeTagNames(testRecipe.id)).toEqual([]);
    expect(await listAllTagNames()).not.toContain("JavaScript");

    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, ["javascript"]);
    });

    expect(await getRecipeTagNames(testRecipe.id)).toEqual(["javascript"]);
  });

  it("keeps tags that are still used by another recipe", async () => {
    const user = await createTestUser();
    const secondRecipe = await createTestRecipe(user.id, { name: "Recipe 2" });

    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, ["Python"]);
      await attachTagsToRecipeByInputTx(tx, secondRecipe.id, ["Python"]);
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, []);
    });

    expect(await listAllTagNames()).toContain("Python");
    expect(await getRecipeTagNames(secondRecipe.id)).toEqual(["Python"]);
  });

  it("keeps tags that are still used as an allergy", async () => {
    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, ["Italian"]);
    });

    const tag = await findTagByName("Italian");

    expect(tag).not.toBeNull();
    await db.insert(userAllergies).values({ userId: testRecipe.userId, tagId: tag!.id });

    await db.transaction(async (tx) => {
      await attachTagsToRecipeByInputTx(tx, testRecipe.id, []);
    });

    expect(await findTagByName("Italian")).not.toBeNull();

    const allergies = await db
      .select({ tagId: userAllergies.tagId })
      .from(userAllergies)
      .where(eq(userAllergies.userId, testRecipe.userId));

    expect(allergies).toEqual([{ tagId: tag!.id }]);
  });

  it("bulk adds tags to many recipes and bumps version", async () => {
    const user = await createTestUser();
    const r1 = await createTestRecipe(user.id, { name: "R1" });
    const r2 = await createTestRecipe(user.id, { name: "R2" });

    const affected = await bulkAddTagsToRecipes([r1.id, r2.id], ["vegan", "quick"]);

    expect(affected.sort()).toEqual([r1.id, r2.id].sort());
    expect(await getRecipeTagNames(r1.id)).toEqual(["vegan", "quick"]);
    expect(await getRecipeTagNames(r2.id)).toEqual(["vegan", "quick"]);

    const v1 = await db
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.id, r1.id));
    const v2 = await db
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.id, r2.id));
    expect(v1[0].version).toBe(2);
    expect(v2[0].version).toBe(2);
  });

  it("bulk removes tags from many recipes and cleans orphans", async () => {
    const user = await createTestUser();
    const r1 = await createTestRecipe(user.id, { name: "R1" });
    const r2 = await createTestRecipe(user.id, { name: "R2" });

    await bulkAddTagsToRecipes([r1.id, r2.id], ["vegan", "quick", "spicy"]);
    expect(await listAllTagNames()).toContain("spicy");

    const affected = await bulkRemoveTagsFromRecipes([r1.id], ["spicy"]);

    expect(affected).toEqual([r1.id]);
    expect(await getRecipeTagNames(r1.id)).toEqual(["vegan", "quick"]);
    expect(await getRecipeTagNames(r2.id)).toEqual(["vegan", "quick", "spicy"]);
    expect(await listAllTagNames()).toContain("spicy");

    await bulkRemoveTagsFromRecipes([r2.id], ["spicy"]);
    expect(await listAllTagNames()).not.toContain("spicy");
  });

  it("listTagsWithUsage returns count per tag", async () => {
    const user = await createTestUser();
    const r1 = await createTestRecipe(user.id, { name: "R1" });
    const r2 = await createTestRecipe(user.id, { name: "R2" });

    await bulkAddTagsToRecipes([r1.id, r2.id], ["vegan", "quick"]);
    await bulkAddTagsToRecipes([r1.id], ["spicy"]);

    const tags = await listTagsWithUsage();
    const byName = Object.fromEntries(tags.map((t) => [t.name, t.usage]));

    expect(byName.vegan).toBe(2);
    expect(byName.quick).toBe(2);
    expect(byName.spicy).toBe(1);
  });

  it("deleteTagCompletely refuses allergy-linked tag and deletes others", async () => {
    const user = await createTestUser();
    const r1 = await createTestRecipe(user.id, { name: "R1" });
    const r2 = await createTestRecipe(user.id, { name: "R2" });

    await bulkAddTagsToRecipes([r1.id, r2.id], ["vegan"]);
    await bulkAddTagsToRecipes([r1.id], ["nuts"]);

    const nutsTag = await findTagByName("nuts");
    expect(nutsTag).not.toBeNull();
    await db.insert(userAllergies).values({ userId: r1.userId, tagId: nutsTag!.id });

    await expect(deleteTagCompletely(nutsTag!.id)).rejects.toThrow("household allergy");

    const veganTag = await findTagByName("vegan");
    const affected = await deleteTagCompletely(veganTag!.id);
    expect(affected.sort()).toEqual([r1.id, r2.id].sort());

    expect(await findTagByName("vegan")).toBeNull();
    expect(await getRecipeTagNames(r1.id)).toEqual(["nuts"]);
    expect(await getRecipeTagNames(r2.id)).toEqual([]);

    const v1 = await db
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.id, r1.id));
    const v2 = await db
      .select({ version: recipes.version })
      .from(recipes)
      .where(eq(recipes.id, r2.id));
    expect(v1[0].version).toBe(4); // create, add vegan, add nuts, delete vegan
    expect(v2[0].version).toBe(3); // create, add vegan, delete vegan
  });
});

/**
 * Mock for @norish/db/repositories/recipes
 */
import { vi } from "vitest";

export const listRecipes = vi.fn();
export const getRecipeFull = vi.fn();
export const getRecipeOwnerId = vi.fn();
export const createRecipeWithRefs = vi.fn();
export const updateRecipeWithRefs = vi.fn();
export const updateRecipeCategories = vi.fn();
export const deleteRecipeById = vi.fn();
export const dashboardRecipe = vi.fn();
export const getRecipeByUrl = vi.fn();

// tags repo mocks
export const bulkAddTagsToRecipes = vi.fn();
export const bulkRemoveTagsFromRecipes = vi.fn();
export const listTagsWithUsage = vi.fn();
export const findTagById = vi.fn();
export const updateTagName = vi.fn();
export const deleteTagCompletely = vi.fn();

export function resetRecipesMocks() {
  listRecipes.mockReset();
  getRecipeFull.mockReset();
  getRecipeOwnerId.mockReset();
  createRecipeWithRefs.mockReset();
  updateRecipeWithRefs.mockReset();
  updateRecipeCategories.mockReset();
  deleteRecipeById.mockReset();
  dashboardRecipe.mockReset();
  getRecipeByUrl.mockReset();
  bulkAddTagsToRecipes.mockReset();
  bulkRemoveTagsFromRecipes.mockReset();
  listTagsWithUsage.mockReset();
  findTagById.mockReset();
  updateTagName.mockReset();
  deleteTagCompletely.mockReset();
}

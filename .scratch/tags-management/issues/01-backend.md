# Backend: bulk tag operations and admin tag manager

Status: ready-for-agent

Implements the db layer and both routers.

## Done when

- `packages/db/src/repositories/tags.ts` gains `bulkAddTagsToRecipes`, `bulkRemoveTagsFromRecipes`, `listTagsWithUsage`, `deleteTagCompletely` (all bumping affected `recipes.version`; delete refuses allergy-linked tags) — covered by tests in `packages/db/__tests__/server/db/repositories/tags.test.ts`.
- `recipes.bulkTags` mutation accepts `{ recipeIds, add?, remove? }`, skips recipes without edit access, emits one "updated" per affected recipe.
- `admin.tags.list|rename|delete` registered under `routers/admin/index.ts`; rename merges via `updateTagName`, delete emits "updated" for affected recipes.

## Comments

- `updateTagName` and `removeTagFromRecipe` were dead code; the bulk/admin paths wire them in.
- No categories change; `Dessert` remains a tag.
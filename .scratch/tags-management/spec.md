# Bulk tag editing and tag management

Status: ready-for-agent

## Problem Statement

Two gaps around tags.

First, tagging is one-recipe-at-a-time. A library of a few hundred recipes accumulates a tag like `weeknight` on twenty recipes added over months, and there is no way to say "these twelve are all quick" in one action because nothing on the dashboard selects more than one recipe. Karakeep-style bulk editing — select several, then add or remove a tag on all of them — is the missing primitive.

Second, tags are a shared folksonomy but nothing manages them. `updateTagName` and `removeTagFromRecipe` exist in the tags repository but are wired to nothing (only tests use them). A rename or a delete is an instance-wide claim, so it belongs to the existing **Settings => Admin** surface (same tier as cuisines, ADR-0012), not to any household.

## Solution

**Feature A — bulk tag editing on the Library.** Selection is a mode on the dashboard:

- The toolbar gains a **Select** button; once active it becomes **Cancel**. Cards show a pick-once checkbox and tapping a card toggles it instead of navigating.
- Touch: a **long-press** on a card enters selection with that card already picked (450ms, cancelled on movement).
- A floating bar over the list shows `{count} selected` and two actions, **Add tags** and **Remove tags**, each opening the usual tag picker (reuses `TagInput`) in a Panel; applying commits one `recipes.bulkTags` mutation (`add` and/or `remove`). **Done** exits selection.
- Selection state lives in the web `RecipesContext` (selectionMode + a `Set<string>` of ids); the shared `createUseRecipesMutations` gains `bulkTags`.

**Feature B — admin tag manager.** A **Tags** card under Settings => Admin lists every tag with its usage count, with rename and delete per row. Rename merges onto an existing name (existing `updateTagName` semantics); delete removes the tag everywhere and refuses tags referenced by `user_allergies` (deleting would cascade safety data). Rename/delete exist only on `admin ` procedures — household members can still tag freely on recipes.

The bulk and admin write paths are the first real callers of the existing
`updateTagName`, `removeTagFromRecipe`, `getOrCreateManyTagsTx` and
`deleteOrphanedTagsTx` helpers.

## User Stories

1. As a reader, I want to pick several recipes in the library at once, so that I can act on a set rather than one by one.
2. As a reader, I want a visible Select entry point and a long-press on touch, so that starting a selection matches how I hold the app.
3. As a reader, I want picked cards to show they are picked, so that I can see what will be acted on.
4. As a reader, I want one action that tags every picked recipe, so that a set is tagged in a single pass.
5. As a reader, I want the same action to remove tags, so that I can un-tag a set too.
6. As a reader, I want to type new tags or pick ones the household already uses in the bulk picker, so that it behaves like every other tag field.
7. As a reader, I want recipes I cannot edit to be skipped rather than the whole batch failing.
8. As an admin, I want a tag manager under Settings => Admin, so that rename/merge/delete are instance-wide claims only an admin can make.
9. As an admin, I want each tag's usage count, so that I know what a change will touch.
10. As an admin, I want to rename a tag everywhere at once, and merging when the new name already exists, so that I can tidy the vocabulary.
11. As an admin, I want to delete a tag everywhere and clean up tags left unused, so that the vocabulary reflects reality.
12. As an admin, I want allergy-linked tags to be undeletable, so that I cannot erase a household's safety data.
13. As an admin, I want a Manage tags link in the library toolbar, so that the manager is reachable where tags are used.

## Non-Goals

- **Categories** stay the fixed 4-slot enum (Breakfast/Lunch/Dinner/Snack); `Dessert` stays a tag.
- Tags stay instance-global rows, not per-user or per-household.
- No editing of a tag on *household* members' behalf — it is admin-only, matching ADR-0012's cuisine tier.
- No per-recipe tag editing changes (recipe page already does this).

## Files to touch

- `packages/db/src/repositories/tags.ts` — `bulkAddTagsToRecipes`, `bulkRemoveTagsFromRecipes`, `listTagsWithUsage`, `deleteTagCompletely`.
- `packages/trpc/src/routers/recipes/recipes.ts` — `bulkTags` mutation (filters ids by edit access, emits "updated" for affected recipes).
- `packages/trpc/src/routers/admin/tags.ts` — `list` / `rename` / `delete`; registered in `routers/admin/index.ts`.
- `apps/web/context/recipes-context.tsx` — selection state.
- `apps/web/components/dashboard/recipe-card.tsx` — selection checkbox + long-press.
- `apps/web/components/dashboard/library-view.tsx` — thread selection through cards, render bulk bar.
- `apps/web/components/dashboard/bulk-selection-bar.tsx` — new bar + tag panels.
- `apps/web/components/dashboard/dashboard.tsx` — Select/Cancel toggle + admin Manage tags button (`isServerAdmin` threaded from `app/(app)/page.tsx`).
- `apps/web/app/(app)/settings/admin/components/tags-card.tsx` + `hooks/use-tag-admin-mutations.ts`.
- `packages/i18n` catalogs (14 locales): `recipes.dashboard.selection.*`, `recipes.bulk.*`, `settings.admin.tags.*`.
- `apps/docs/docs/recipes/tags.md` + release notes `0.22.0-beta.md`.
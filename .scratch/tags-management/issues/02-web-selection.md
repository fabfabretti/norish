# Web: library selection + UI for bulk tagging

Status: ready-for-agent

Wires selection mode into the dashboard and libraries the tag edits against the
web RecipesContext and shared recipes mutations.

## Done when

- `RecipesContext` exposes `selectionMode`, `selectedIds`, `enterSelectionMode`, `toggleSelect`, `exitSelectionMode`.
- `RecipeCard` shows a checkbox in selection mode, toggles instead of navigating, and long-press (450ms, movement-cancelled) enters selection on touch.
- Toolbar gains **Select** (→ Cancel when active); admins additionally see **Manage tags** linking to `/settings?tab=admin`.
- `BulkSelectionBar` floats over the list with count and Add/Remove tag panels (reusing `TagInput`), committing `recipes.bulkTags` via `useRecipesMutations().bulkTags`, then refreshing the library.
- `isServerAdmin` threaded from `app/(app)/page.tsx` (optional prop; offline bootstrap renders `<Dashboard />` with none).

## Comments

- Selection state is intentionally in web RecipesContext, not shared-react — the Library tab is the only consumer.
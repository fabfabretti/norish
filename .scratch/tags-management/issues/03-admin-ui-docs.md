# Admin tag manager UI, i18n, docs

Status: ready-for-agent

The Settings => Admin Tags card, translations across all locales, and the
release-notes + docs payload.

## Done when

- `tags-card.tsx` (mirrors `cuisine-vocabulary-form.tsx`) lists tags with usage counts, inline rename (merge semantics), delete with confirm modal, and an "allergy" error state on CONFLICT; `use-tag-admin-mutations.ts` invalidates both `admin.tags.list` and `config.tags`.
- All 14 i18n locales carry `recipes.dashboard.selection.*`, `recipes.bulk.*`, `settings.admin.tags.*` (`pnpm i18n:check` clean).
- `apps/docs/docs/recipes/tags.md` documents both features; screenshots added under `apps/docs/static/img/screenshots/` (`tags-selection.png`, `tags-bulk-bar.png`, `tags-admin.png`).
- Release notes under `apps/docs/docs/release-notes/0.22.0-beta.md` describe **Bulk tag editing** and **Managing tags**.

## Comments

- Screenshots are captured manually outside the browser gate (docs convention), the page references them already.
---
sidebar_position: 8
title: Tags
description: Tag recipes in your library and bulk-edit tags on many recipes at once; administrators can rename, merge, or delete tags everywhere.
---

# Tags

A tag is a label that travels with a recipe: quick, vegetarian, or anything else
your household invents together. Tags are the same for everyone on the server —
an admin manages them, every household reads them.

## Tagging many recipes at once

Turn the library into a picker with the **Select** button in the toolbar. Each
card shows a checkbox; tap it to pick or unpick that recipe.

![Selection enabled: each card shows a checkbox](/img/screenshots/tags-selection.png)

On touch screens, a **long-press** on a card also starts a selection and already
has that card picked.

While recipes are picked, a bar at the bottom shows the count and two actions:

- **Add tags** — add one or more tags to everything picked.
- **Remove tags** — take one or more tags off everything picked.

Both open the same tag picker a recipe's page uses: type a new tag and press
space, or choose one the household already uses. Tags are applied to every
picked recipe in one go, and the change streams back to every device. When you
are done, use **Done** to leave selection.

![The bulk bar: how many are picked, and the add/remove actions](/img/screenshots/tags-bulk-bar.png)

A recipe you cannot edit is skipped rather than failing the whole operation.

## Managing tags

Server administrators manage the whole vocabulary under **Settings => Admin =>
Tags**, which lists every tag with the number of recipes carrying it.

![The tag manager: each tag with its usage count](/img/screenshots/tags-admin.png)

- **Rename** edits the name everywhere at once. Renaming a tag onto a name that
  already exists **merges** the two tags and their recipes.
- **Delete** removes a tag from every recipe, and cleans up any tag left unused.
  A tag that a household lists as an **allergy cannot be deleted** — removing it
  would erase safety data.

Anyone without server admin can add tags to their own recipes freely; the admin
manager only governs renaming, merging, and deleting across the whole server.

## From the library toolbar

Administrators also get a **Manage tags** button in the library toolbar that
opens the same tag manager, so the most common place to change tags is one tap
away.

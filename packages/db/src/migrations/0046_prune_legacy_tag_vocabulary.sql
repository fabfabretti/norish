-- Prune the legacy tag vocabulary kept alive by the `predefined_db` strategy.
--
-- The ALLOWED TAGS kit replaced the old, wider predefined list in code, but the
-- old list's names had already been minted as tag rows, and `predefined_db`
-- feeds every existing tag back to the model as an allowed tag. A name that
-- left the kit therefore stayed in circulation: "kid-friendly" kept appearing
-- though it was dropped, and a Vegan Tuna made of chickpeas picked up "tofu"
-- straight from the pool.
--
-- This removes the names that lost their kit slot and were never part of a
-- household's own vocabulary: the old difficulty/audience words, the food-noun
-- leftovers, and the junk Italian phrases that survived the earlier cleanup.
-- The same nouns are still reachable through the ingredient tier: the model may
-- name a main ingredient and the tag is re-created then, only on recipes that
-- actually contain it, as an English tag either way.
--
-- Tags a household lists as an allergy are left alone: `user_allergies`
-- cascades on delete, so removing such a tag would silently drop that person's
-- allergy. The nutrition tags that preceded the kit (gluten-free, dairy-free,
-- low-carb) are kept intentionally.

--> statement-breakpoint
DELETE FROM "recipe_tags" rt
USING "tags" t
WHERE rt."tag_id" = t."id"
	AND lower(t."name") IN (
		-- audience and difficulty words that left the kit
		'kid-friendly', 'healthy',
		-- food-noun leftovers from the old predefined list
		'airfryer', 'appetizer', 'bacon', 'beef', 'burger', 'cabbage',
		'cheese', 'chicken', 'chocolate', 'cookies', 'eggs', 'eggplant',
		'olive', 'orange', 'pork', 'potatoes', 'prawns', 'raspberries',
		'rice', 'salad', 'seafood', 'seitan', 'shrimp', 'stew', 'tofu',
		-- junk phrase that escaped the first cleanup
		'ricettavuna'
	)
	AND NOT EXISTS (SELECT 1 FROM "user_allergies" ua WHERE ua."tag_id" = t."id");--> statement-breakpoint
DELETE FROM "tags" t
WHERE NOT EXISTS (SELECT 1 FROM "recipe_tags" rt WHERE rt."tag_id" = t."id")
	AND NOT EXISTS (SELECT 1 FROM "user_allergies" ua WHERE ua."tag_id" = t."id")
	AND lower(t."name") IN (
		'kid-friendly', 'healthy',
		'airfryer', 'appetizer', 'bacon', 'beef', 'burger', 'cabbage',
		'cheese', 'chicken', 'chocolate', 'cookies', 'eggs', 'eggplant',
		'olive', 'orange', 'pork', 'potatoes', 'prawns', 'raspberries',
		'rice', 'salad', 'seafood', 'seitan', 'shrimp', 'stew', 'tofu',
		'ricettavuna'
	);
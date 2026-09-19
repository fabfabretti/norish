-- Clean up tags auto-tagging minted before enforcement landed.
--
-- Until the ALLOWED TAGS kit and its code check shipped, auto-tagging trusted a
-- prompt line nobody enforced, so the model minted arbitrary new tags: glued
-- word compounds, Italian phrases, source/channel names (a supermarket, a
-- YouTube channel), and names that belong to the structured Categories field
-- instead of Tags. Removal is complete (associations and rows) because under
-- the `predefined_db` tag strategy the auto-tagging prompt injects every
-- existing tag name back in as an allowed tag; a surviving orphan would keep
-- the garbage in circulation after the cleanup meant to end it.
--
-- Tags are always English, so a non-English name is removed too.
--
-- A tag someone recorded as an allergy is left alone: `user_allergies` cascades
-- on delete, so removing it would silently drop that person's allergy.

--> statement-breakpoint
DELETE FROM "recipe_tags" rt
USING "tags" t
WHERE rt."tag_id" = t."id"
	AND lower(t."name") IN (
		-- glued-word compounds and AI phrases
		'arrosticini', 'arrosticiniveg', 'bananabread', 'carnevegana',
		'chickpeacookiedough', 'comfortfood', 'cookiedough', 'easyrecipe',
		'friggitriceadaria', 'healthydesserts', 'japanesecooking',
		'japaneserecipes', 'lemillericettedivale', 'pastasfoglia',
		'pranzoleggero', 'pranzosano', 'ricette', 'ricettefacili',
		'ricettevegane', 'secondivegani', 'senzafarina', 'senzaglutine',
		'tesco', 'tonnoveg', 'tonnovegan', 'tonnovegano', 'vunarecipe',
		-- non-English names (Tags are always English)
		'patate',
		-- structured-field overlaps: Categories and difficulty own these
		'breakfast', 'lunch', 'dinner', 'snack', 'easy'
	)
	AND NOT EXISTS (SELECT 1 FROM "user_allergies" ua WHERE ua."tag_id" = t."id");--> statement-breakpoint
DELETE FROM "tags" t
WHERE NOT EXISTS (SELECT 1 FROM "recipe_tags" rt WHERE rt."tag_id" = t."id")
	AND NOT EXISTS (SELECT 1 FROM "user_allergies" ua WHERE ua."tag_id" = t."id")
	AND lower(t."name") IN (
		'arrosticini', 'arrosticiniveg', 'bananabread', 'carnevegana',
		'chickpeacookiedough', 'comfortfood', 'cookiedough', 'easyrecipe',
		'friggitriceadaria', 'healthydesserts', 'japanesecooking',
		'japaneserecipes', 'lemillericettedivale', 'pastasfoglia',
		'pranzoleggero', 'pranzosano', 'ricette', 'ricettefacili',
		'ricettevegane', 'secondivegani', 'senzafarina', 'senzaglutine',
		'tesco', 'tonnoveg', 'tonnovegan', 'tonnovegano', 'vunarecipe',
		'patate',
		'breakfast', 'lunch', 'dinner', 'snack', 'easy'
	);
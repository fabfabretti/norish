/**
 * Auto-tagging input sections.
 *
 * The administrator-editable auto-tagging prompt carries the tagging rules;
 * these sections — the allowed tag kit, the strategy addition, and the recipe
 * under analysis — are appended after it by the AI Runtime.
 *
 * The ALLOWED TAGS list is deliberately code-owned and not part of the prompt
 * file: the list is what code enforces after the model replies, so prompt text
 * and enforcement can never drift apart (the prompt once promised a predefined
 * list no code ever checked).
 */

import { listAllTagNames } from "@norish/db/repositories/tags";
import { getTagStrategy } from "@norish/shared-server/config/server-config-loader";

/**
 * The curated auto-tagging kit. Closed list: the only non-ingredient tags a
 * model may emit. English-only. Governed from code; administrators grow the
 * vocabulary through the Tags manager under the `predefined_db` strategy.
 */
export const AUTO_TAGGING_KIT_TAGS = [
  // Dietary
  "Vegetarian",
  "Vegan",
  "High-Protein",
  // Methods
  "Air Fryer",
  "Slow Cooker",
  "One-Pot",
  "Grilled",
  "Baked",
  "Fried",
  "Raw",
  "Roasted",
  "Steamed",
  // Dish type
  "Main Dish",
  "Side Dish",
  "Dessert",
  "Snack",
  "Other",
  // Qualities
  "Budget-Friendly",
  "Meal-Prep",
  "Quick Meal",
] as const;

/**
 * Seasonings and kitchen staples that never qualify as a main-ingredient tag.
 * The ingredient tier accepts any English ingredient name a model proposes;
 * this denylist is the code check that salt-scale items do not become tags.
 */
export const SEASONING_DENYLIST = [
  "salt",
  "pepper",
  "black pepper",
  "oil",
  "olive oil",
  "vegetable oil",
  "butter",
  "water",
  "sugar",
  "brown sugar",
  "honey",
  "vinegar",
  "white vinegar",
  "apple cider vinegar",
  "soy sauce",
  "stock",
  "broth",
  "lemon juice",
] as const;

const KIT_LOWERCASE = new Set(AUTO_TAGGING_KIT_TAGS.map((tag) => tag.toLowerCase()));
const DENYLIST_LOWERCASE = new Set(SEASONING_DENYLIST);

export function isKitTagName(name: string): boolean {
  return KIT_LOWERCASE.has(name.trim().toLowerCase());
}

export function isSeasoningName(name: string): boolean {
  return DENYLIST_LOWERCASE.has(name.trim().toLowerCase());
}

export interface AutoTaggingSectionOptions {
  /**
   * Pre-fetched database tags (for predefined_db mode).
   * If not provided and mode is predefined_db, will be fetched automatically.
   */
  existingDbTags?: string[];
}

export interface RecipeForTagging {
  title: string;
  description?: string | null;
  ingredients: string[];
}

/**
 * Build the sections appended to the auto-tagging prompt: the allowed-tag kit
 * (code-owned, enforced after the reply), the tag strategy's addition (when it
 * has one) and finally the recipe under analysis.
 */
export async function buildAutoTaggingSections(
  options: AutoTaggingSectionOptions = {},
  recipe: RecipeForTagging
): Promise<string[]> {
  const { existingDbTags: providedTags } = options;
  const strategy = await getTagStrategy();

  // Fetch DB tags if needed and not provided
  let dbTags: string[] | undefined = providedTags;

  if (strategy === "predefined_db" && !dbTags) {
    dbTags = await listAllTagNames();
  }

  const sections: string[] = [];

  sections.push(
    `ALLOWED TAGS:
${AUTO_TAGGING_KIT_TAGS.join(", ")}

Use ONLY these tags, except one more kind: you may add a tag naming a single main
ingredient of the recipe, in English (e.g. "shrimp", "chicken", "tofu").
Ingredient tags never name seasonings, condiments, oil, butter, sugar, water, or
other kitchen staples; never glue words together ("honeypeppershrimp"); never add
adjectives or phrases ("deliciousshrimp", "comfort food chicken"); and never tag
something that is not an ingredient.`
  );

  if (strategy === "predefined_db" && dbTags && dbTags.length > 0) {
    sections.push(
      `ADDITIONAL ALLOWED TAGS (from existing recipes):
${dbTags.join(", ")}

You may use tags from both the ALLOWED TAGS list AND this additional list.`
    );
  } else if (strategy === "freeform") {
    sections.push(
      "Note: While you should prefer using allowed tags, you may create new relevant tags if needed."
    );
  }

  const recipeLines = [`RECIPE TO ANALYZE:`, `Title: ${recipe.title}`];

  if (recipe.description) {
    recipeLines.push(`Description: ${recipe.description}`);
  }

  recipeLines.push("Ingredients:", ...recipe.ingredients.map((i) => `- ${i}`));
  recipeLines.push(
    "",
    'Return ONLY a JSON object with a "tags" array, e.g.: { "tags": ["high-protein", "baked", "vegetarian"] }'
  );

  sections.push(recipeLines.join("\n"));

  return sections;
}

// @vitest-environment node
/**
 * The auto-tagging vocabulary lives in code now, not in the prompt.
 *
 * The shipped prompt rules no longer carry a tag list — the ALLOWED TAGS kit is
 * a code constant appended as a section and enforced after the model replies,
 * so the two can never drift apart (the prompt once promised a predefined list
 * no code ever checked).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUTO_TAGGING_KIT_TAGS } from "@norish/shared-server/ai/enrichment/auto-tagging-prompt";
import { resolveExistingWorkspacePath } from "@norish/shared-server/lib/workspace-paths";

const AUTO_TAGGING_PROMPT = readFileSync(
  join(
    resolveExistingWorkspacePath(join("packages", "shared-server", "src", "ai", "prompts")),
    "auto-tagging.txt"
  ),
  "utf-8"
);

/** The cuisines the predefined Tag list used to carry. */
const FORMER_CUISINE_TAGS = [
  "italian",
  "mexican",
  "asian",
  "american",
  "mediterranean",
  "indian",
  "french",
  "thai",
  "japanese",
  "chinese",
];

describe("the auto-tagging kit", () => {
  const kitLower = AUTO_TAGGING_KIT_TAGS.join(" ").toLowerCase();

  it("no longer offers any former cuisine as a tag", () => {
    for (const cuisine of FORMER_CUISINE_TAGS) {
      expect(kitLower).not.toContain(cuisine);
    }
  });

  it("keeps the tags that were never cuisines", () => {
    for (const tag of ["vegetarian", "slow cooker", "snack", "quick meal"]) {
      expect(kitLower).toContain(tag);
    }
  });

  it("never offers meal occasions that belong to the Categories field", () => {
    for (const tag of ["breakfast", "lunch", "dinner"]) {
      expect(kitLower).not.toContain(tag);
    }
  });
});

describe("the shipped auto-tagging prompt", () => {
  it("no longer embeds a tag list — the ALLOWED TAGS kit is appended as a section", () => {
    expect(AUTO_TAGGING_PROMPT).not.toContain("PREDEFINED TAGS:");
    expect(AUTO_TAGGING_PROMPT).not.toContain("Do NOT create new tags outside this list");
  });

  it("tells the model where cuisine lives instead", () => {
    // Without this the model reaches for a cuisine anyway and mints a free-form
    // tag, which is exactly the folksonomy the vocabulary exists to replace.
    expect(AUTO_TAGGING_PROMPT).toMatch(/Cuisines/);
  });

  it("tells the model that meal occasions live in Categories, not Tags", () => {
    expect(AUTO_TAGGING_PROMPT).toMatch(/Categories/);
  });
});

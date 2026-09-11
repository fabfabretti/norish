/**
 * Tag administration.
 *
 * Tags are an open folksonomy, but a rename and a delete are instance-wide
 * claims, so only an administrator may make them (ADR-0012). Everything
 * delegates to the tags repository rather than composing queries here.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  deleteTagCompletely,
  findTagById,
  getRecipeFull,
  listTagsWithUsage,
  updateTagName,
} from "@norish/db/repositories";
import { getRecipePermissionPolicy } from "@norish/shared-server/config/server-config-loader";
import { trpcLogger as log } from "@norish/shared-server/logger";

import { emitByPolicy } from "../../helpers";
import { adminProcedure } from "../../middleware";
import { router } from "../../trpc";
import { recipeEmitter } from "../recipes/emitter";

const list = adminProcedure.query(async () => {
  return await listTagsWithUsage();
});

const rename = adminProcedure
  .input(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(50) }))
  .mutation(async ({ ctx, input }) => {
    log.info({ userId: ctx.user.id, tagId: input.id }, "Renaming a Tag");

    const tag = await findTagById(input.id);

    if (!tag) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    let result;

    try {
      // updateTagName merges a rename that collides with an existing tag.
      result = await updateTagName(tag.name, input.name);
    } catch (err) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A Tag with that name already exists",
        cause: err,
      });
    }

    if (!result) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
    }

    return result;
  });

const remove = adminProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
  log.info({ userId: ctx.user.id, tagId: input.id }, "Deleting a Tag");

  const tag = await findTagById(input.id);

  if (!tag) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });
  }

  let affected: string[];

  try {
    affected = await deleteTagCompletely(input.id);
  } catch (err) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This Tag is used as a household allergy and cannot be deleted",
      cause: err,
    });
  }

  const policy = await getRecipePermissionPolicy();

  for (const recipeId of affected) {
    const updatedRecipe = await getRecipeFull(recipeId);

    if (updatedRecipe) {
      emitByPolicy(
        recipeEmitter,
        policy.view,
        { userId: ctx.user.id, householdKey: ctx.householdKey },
        "updated",
        { recipe: updatedRecipe }
      );
    }
  }

  return { success: true };
});

export const tagsProcedures = router({
  list,
  rename,
  delete: remove,
});

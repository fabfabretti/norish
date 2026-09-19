// @vitest-environment node
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { getRecipePermissionPolicy } from "@norish/shared-server/config/server-config-loader";

import {
  deleteTagCompletely,
  findTagById,
  getRecipeFull,
  listTagsWithUsage,
  updateTagName,
} from "../mocks/recipes-repository";
import { isUserServerAdmin } from "../mocks/users";
import { createMockAdminContext, createMockAuthedContext, createMockUser } from "./test-utils";

// The tags admin router reads its dependencies from @norish/db/repositories,
// the recipes emitter, and the shared config loader. Mock all three so the
// router logic — gating, merge, and the allergy guard — is what is under test.
vi.mock("@norish/db/repositories", async () => {
  const recipes = await import("../mocks/recipes-repository");

  return {
    getRecipeFull: recipes.getRecipeFull,
    findTagById: recipes.findTagById,
    listTagsWithUsage: recipes.listTagsWithUsage,
    updateTagName: recipes.updateTagName,
    deleteTagCompletely: recipes.deleteTagCompletely,
  };
});
vi.mock("@norish/trpc/routers/recipes/emitter", () => import("../mocks/recipe-emitter"));
vi.mock("@norish/shared-server/config/server-config-loader", () => ({
  getRecipePermissionPolicy: vi.fn().mockResolvedValue({
    view: "everyone",
    edit: "household",
    delete: "household",
  }),
  isAIEnabled: vi.fn().mockResolvedValue(false),
}));
vi.mock("@norish/db/repositories/users", () => import("../mocks/users"));
vi.mock("@norish/auth/connection-tests", () => import("../mocks/connection-tests"));
vi.mock("@norish/db/repositories/server-config", () => import("../mocks/server-config"));

const t = initTRPC.context<ReturnType<typeof createMockAuthedContext>>().create({
  transformer: superjson,
});

// Same admin gate the real middleware applies: server admin, or FORBIDDEN.
const adminMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const isAdmin = await isUserServerAdmin(ctx.user.id);

  if (!isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Server admin access required" });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

const adminProcedure = t.procedure.use(adminMiddleware);

// Mirror of the real admin/tags router body, so the test focuses on the
// behaviour of each procedure rather than the tRPC wiring.
const tagsRouter = t.router({
  list: adminProcedure.query(async () => listTagsWithUsage()),

  rename: adminProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ input }) => {
      const tag = await findTagById(input.id);

      if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

      let result;

      try {
        result = await updateTagName(tag.name, input.name);
      } catch (err) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A Tag with that name already exists",
          cause: err,
        });
      }

      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

      return result;
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
    const tag = await findTagById(input.id);

    if (!tag) throw new TRPCError({ code: "NOT_FOUND", message: "Tag not found" });

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

    for (const recipeId of affected) {
      // The real router emits an "updated" event per affected recipe after
      // reading it back; here the read is what the test asserts happened.
      await getRecipeFull(recipeId);
    }

    return { success: true };
  }),
});

describe("admin tags procedures", () => {
  const mockAdminUserId = "test-admin-id";

  beforeEach(() => {
    vi.clearAllMocks();
    isUserServerAdmin.mockImplementation((userId: string) => {
      return Promise.resolve(userId === mockAdminUserId);
    });
    getRecipePermissionPolicy.mockResolvedValue({
      view: "everyone",
      edit: "household",
      delete: "household",
    });
  });

  it("list returns every tag with its usage count", async () => {
    listTagsWithUsage.mockResolvedValue([
      { id: "tag-1", name: "vegan", usage: 3 },
      { id: "tag-2", name: "quick", usage: 1 },
    ]);

    const caller = tagsRouter.createCaller(await createMockAdminContext());

    await expect(caller.list()).resolves.toEqual([
      { id: "tag-1", name: "vegan", usage: 3 },
      { id: "tag-2", name: "quick", usage: 1 },
    ]);
    expect(listTagsWithUsage).toHaveBeenCalledTimes(1);
  });

  it("renames through updateTagName (merge semantics)", async () => {
    findTagById.mockResolvedValue({ id: "tag-1", name: "vegan" });
    updateTagName.mockResolvedValue({ merged: true, newName: "plant-based" });

    const caller = tagsRouter.createCaller(await createMockAdminContext());

    const result = await caller.rename({ id: "55555555-5555-4555-8555-555555555555", name: "plant-based" });

    expect(result).toEqual({ merged: true, newName: "plant-based" });
    expect(updateTagName).toHaveBeenCalledWith("vegan", "plant-based");
  });

  it("throws NOT_FOUND for a tag that does not exist", async () => {
    findTagById.mockResolvedValue(null);

    const caller = tagsRouter.createCaller(await createMockAdminContext());

    await expect(caller.rename({ id: "55555555-5555-4555-8555-555555555555", name: "other" })).rejects.toThrow("Tag not found");
    await expect(caller.delete({ id: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow("Tag not found");
  });

  it("refuses deleting an allergy-linked tag with CONFLICT", async () => {
    findTagById.mockResolvedValue({ id: "tag-1", name: "nuts" });
    deleteTagCompletely.mockRejectedValue(
      new Error("A tag used as a household allergy cannot be deleted")
    );

    const caller = tagsRouter.createCaller(await createMockAdminContext());

    await expect(caller.delete({ id: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow(
      "This Tag is used as a household allergy and cannot be deleted"
    );
  });

  it("deletes a non-allergy tag and reads the affected recipes for emitting", async () => {
    findTagById.mockResolvedValue({ id: "tag-1", name: "vegan" });
    deleteTagCompletely.mockResolvedValue(["recipe-1", "recipe-2"]);
    getRecipeFull
      .mockResolvedValueOnce({ id: "recipe-1", name: "Recipe 1", tags: [], version: 2 })
      .mockResolvedValueOnce({ id: "recipe-2", name: "Recipe 2", tags: [], version: 2 });

    const caller = tagsRouter.createCaller(await createMockAdminContext());

    await expect(caller.delete({ id: "55555555-5555-4555-8555-555555555555" })).resolves.toEqual({ success: true });
    expect(deleteTagCompletely).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555");
    expect(getRecipeFull).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-admin caller with FORBIDDEN", async () => {
    listTagsWithUsage.mockResolvedValue([]);

    const nonAdmin = await createMockAuthedContext(createMockUser());

    const caller = tagsRouter.createCaller(nonAdmin);

    await expect(caller.list()).rejects.toThrow("Server admin access required");
  });
});

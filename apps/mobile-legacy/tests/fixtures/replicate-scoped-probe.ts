// Test-only protocol adapter. Never exported from the deployed convex/ directory.
import { ConvexError, v } from "convex/values";
import { applyUpdateV2, Doc, encodeStateAsUpdateV2 } from "yjs";
import { api, components } from "../../convex/_generated/api";
import { mutation, query } from "../../convex/_generated/server";
import { requireUserId } from "../../convex-lib/auth";

export const delta = query({
  args: {
    seq: v.optional(v.number()),
    limit: v.optional(v.number()),
    document: v.optional(v.string()),
    vector: v.optional(v.bytes()),
  },
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const collection = `shifts:${ownerId}`;
    if (args.document !== undefined) {
      const row = await ctx.db
        .query("shifts")
        .withIndex("by_doc_id", (q) => q.eq("id", args.document!))
        .unique();
      if (row && row.ownerId !== ownerId) {
        throw new ConvexError("Unauthorized document");
      }
      if (!args.vector) {
        throw new ConvexError("Missing vector");
      }
      const recovered = await ctx.runQuery(
        components.replicate.mutations.recovery,
        {
          collection,
          document: args.document,
          vector: args.vector,
        }
      );
      return { mode: "recovery", ...recovered };
    }
    const result = await ctx.runQuery(components.replicate.mutations.stream, {
      collection,
      seq: args.seq ?? 0,
      limit: Math.min(args.limit ?? 100, 1000),
    });
    const changes = await Promise.all(
      result.changes.map(async (change) => {
        const row = await ctx.db
          .query("shifts")
          .withIndex("by_doc_id", (q) => q.eq("id", change.document))
          .unique();
        return {
          ...change,
          exists: !!row && !row.deleted && row.ownerId === ownerId,
        };
      })
    );
    return { mode: "stream", ...result, changes };
  },
});

export const replicate = mutation({
  args: {
    document: v.string(),
    bytes: v.bytes(),
    material: v.optional(v.any()),
    type: v.union(
      v.literal("insert"),
      v.literal("update"),
      v.literal("delete")
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean; seq: number }> => {
    const ownerId = await requireUserId(ctx);
    // Existing application writer validates ownership from merged CRDT bytes.
    // Translate only the library's deletion marker for this compatibility probe.
    const doc = new Doc();
    let bytes = args.bytes;
    try {
      if (args.type === "delete") {
        applyUpdateV2(doc, new Uint8Array(bytes));
        doc.getMap("meta").set("deleted", true);
        bytes = encodeStateAsUpdateV2(doc).buffer as ArrayBuffer;
      }
      await ctx.runMutation(api.shifts.replicate, {
        document: args.document,
        bytes,
      });
    } finally {
      doc.destroy();
    }
    const result = await ctx.runQuery(components.replicate.mutations.stream, {
      collection: `shifts:${ownerId}`,
      seq: 0,
      limit: 1,
    });
    return { success: true, seq: result.seq };
  },
});

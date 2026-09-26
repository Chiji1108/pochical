import { ConvexError, v } from "convex/values";
import {
  applyUpdateV2,
  encodeStateAsUpdateV2,
  encodeStateVector,
  Doc as YDoc,
} from "yjs";
import { requireUserId } from "../convex-lib/auth";
import { type MemberRecord, memberShape } from "../shared/work-schema";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("shiftMembers")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    return await Promise.all(
      rows.map(async (row) => {
        const state = await ctx.runQuery(
          components.replicate.mutations.getDocumentState,
          { collection: `shiftMembers:${ownerId}`, document: row.id }
        );
        return { id: row.id, bytes: state?.bytes ?? null };
      })
    );
  },
});

// A separate internal function applies Convex's validator to decoded CRDT data.
export const materialize = internalMutation({
  args: { record: memberShape, deleted: v.boolean() },
  handler: async (ctx, { record, deleted }) => {
    const existing = await ctx.db
      .query("shiftMembers")
      .withIndex("by_doc_id", (q) => q.eq("id", record.id))
      .unique();
    if (existing && existing.ownerId !== record.ownerId) {
      throw new ConvexError("Unauthorized document");
    }
    const value = { ...record, deleted, timestamp: Date.now() };
    if (existing) {
      await ctx.db.replace(existing._id, value);
    } else {
      await ctx.db.insert("shiftMembers", value);
    }
  },
});

export const replicate = mutation({
  args: { document: v.string(), bytes: v.bytes() },
  handler: async (ctx, args): Promise<null> => {
    const ownerId = await requireUserId(ctx);
    if (args.bytes.byteLength > 256 * 1024) {
      throw new ConvexError("Document too large");
    }
    const existing = await ctx.db
      .query("shiftMembers")
      .withIndex("by_doc_id", (q) => q.eq("id", args.document))
      .unique();
    if (existing && existing.ownerId !== ownerId) {
      throw new ConvexError("Unauthorized document");
    }
    const collection = `shiftMembers:${ownerId}`;
    const doc = new YDoc();
    try {
      const previous = await ctx.runQuery(
        components.replicate.mutations.recovery,
        {
          collection,
          document: args.document,
          vector: encodeStateVector(doc).buffer as ArrayBuffer,
        }
      );
      if (previous.diff) {
        applyUpdateV2(doc, new Uint8Array(previous.diff));
      }
      applyUpdateV2(doc, new Uint8Array(args.bytes));
      const record = doc.getMap("fields").toJSON() as MemberRecord;
      if (record.id !== args.document || record.ownerId !== ownerId) {
        throw new ConvexError("Invalid document owner");
      }
      const deleted =
        existing?.deleted === true ||
        doc.getMap("meta").get("deleted") === true;
      if (deleted) {
        doc.getMap("meta").set("deleted", true);
      }
      await ctx.runMutation(internal.shiftMembers.materialize, {
        record,
        deleted,
      });
      await ctx.runMutation(components.replicate.mutations.updateDocument, {
        collection,
        document: args.document,
        bytes: encodeStateAsUpdateV2(doc).buffer as ArrayBuffer,
      });
      return null;
    } finally {
      doc.destroy();
    }
  },
});

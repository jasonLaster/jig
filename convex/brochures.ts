import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const dimensions = v.object({
  height: v.number(),
  length: v.number(),
  topThickness: v.number(),
  width: v.number(),
});
const params = v.record(v.string(), v.number());
const brochureAssetKind = v.union(
  v.literal("room-hero"),
  v.literal("room-alternate"),
  v.literal("table-three-quarter"),
  v.literal("table-profile"),
);
const brochureAsset = v.object({
  kind: brochureAssetKind,
  storageId: v.id("_storage"),
  mediaType: v.string(),
});
const brochureAssetKinds = [
  "room-hero",
  "room-alternate",
  "table-three-quarter",
  "table-profile",
] as const;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const create = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    modelKey: v.string(),
    modelName: v.string(),
    imageModel: v.string(),
    promptVersion: v.string(),
    params,
    dimensions,
    referenceCount: v.number(),
    outputCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (existing) {
      if (existing.clientId !== args.clientId) {
        throw new Error("Brochure generation ID already exists");
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("brochures", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const complete = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    mediaType: v.optional(v.string()),
    assets: v.optional(v.array(brochureAsset)),
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (!brochure || brochure.clientId !== args.clientId) {
      throw new Error("Brochure generation not found");
    }
    if (
      args.assets &&
      (args.assets.length !== brochureAssetKinds.length ||
        brochureAssetKinds.some(
          (kind, index) => args.assets?.[index]?.kind !== kind,
        ))
    ) {
      throw new Error("A complete ordered brochure asset set is required");
    }

    const assets =
      args.assets?.length
        ? args.assets
        : args.imageStorageId && args.mediaType
          ? [
              {
                kind: "room-hero" as const,
                storageId: args.imageStorageId,
                mediaType: args.mediaType,
              },
            ]
          : [];
    if (assets.length === 0) {
      throw new Error("Brochure assets are required");
    }
    const nextStorageIds = new Set(assets.map((asset) => asset.storageId));
    const previousStorageIds = new Set([
      ...(brochure.assets?.map((asset) => asset.storageId) ?? []),
      ...(brochure.imageStorageId ? [brochure.imageStorageId] : []),
    ]);
    await Promise.all(
      [...previousStorageIds]
        .filter((storageId) => !nextStorageIds.has(storageId))
        .map((storageId) => ctx.storage.delete(storageId)),
    );
    const primaryAsset = assets[0];
    await ctx.db.patch(brochure._id, {
      status: "complete",
      assets,
      outputCount: assets.length,
      imageStorageId: primaryAsset.storageId,
      mediaType: primaryAsset.mediaType,
      warnings: args.warnings,
      errorMessage: undefined,
      updatedAt: Date.now(),
    });
    const assetUrls = await Promise.all(
      assets.map(async (asset) => ({
        kind: asset.kind,
        mediaType: asset.mediaType,
        imageUrl: await ctx.storage.getUrl(asset.storageId),
      })),
    );
    if (assetUrls.some((asset) => !asset.imageUrl)) {
      throw new Error("A stored brochure image URL is unavailable");
    }
    return {
      brochureId: brochure._id,
      imageUrl: assetUrls[0].imageUrl!,
      assets: assetUrls.map((asset) => ({
        ...asset,
        imageUrl: asset.imageUrl!,
      })),
    };
  },
});

export const fail = mutation({
  args: {
    generationId: v.string(),
    clientId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (!brochure || brochure.clientId !== args.clientId) return;
    await ctx.db.patch(brochure._id, {
      status: "error",
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: Date.now(),
    });
  },
});

export const listByClient = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const brochures = await ctx.db
      .query("brochures")
      .withIndex("by_client_updated", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(60);
    return await Promise.all(
      brochures
        .filter(
          (brochure) =>
            brochure.status === "complete" &&
            (brochure.imageStorageId || brochure.assets?.length),
        )
        .map(async (brochure) => {
          const assets =
            brochure.assets?.length
              ? brochure.assets
              : brochure.imageStorageId && brochure.mediaType
                ? [
                    {
                      kind: "room-hero" as const,
                      storageId: brochure.imageStorageId,
                      mediaType: brochure.mediaType,
                    },
                  ]
                : [];
          const assetUrls = await Promise.all(
            assets.map(async (asset) => ({
              kind: asset.kind,
              mediaType: asset.mediaType,
              imageUrl: await ctx.storage.getUrl(asset.storageId),
            })),
          );
          return {
            ...brochure,
            imageUrl: assetUrls[0]?.imageUrl ?? null,
            assets: assetUrls.filter(
              (asset): asset is typeof asset & { imageUrl: string } =>
                Boolean(asset.imageUrl),
            ),
          };
        }),
    );
  },
});

export const getByGenerationId = query({
  args: { generationId: v.string() },
  handler: async (ctx, args) => {
    const brochure = await ctx.db
      .query("brochures")
      .withIndex("by_generation", (q) =>
        q.eq("generationId", args.generationId),
      )
      .unique();
    if (
      !brochure ||
      brochure.status !== "complete" ||
      (!brochure.imageStorageId && !brochure.assets?.length)
    ) {
      return null;
    }
    const assets =
      brochure.assets?.length
        ? brochure.assets
        : brochure.imageStorageId && brochure.mediaType
          ? [
              {
                kind: "room-hero" as const,
                storageId: brochure.imageStorageId,
                mediaType: brochure.mediaType,
              },
            ]
          : [];
    const assetUrls = await Promise.all(
      assets.map(async (asset) => ({
        kind: asset.kind,
        mediaType: asset.mediaType,
        imageUrl: await ctx.storage.getUrl(asset.storageId),
      })),
    );
    return {
      ...brochure,
      imageUrl: assetUrls[0]?.imageUrl ?? null,
      assets: assetUrls.filter(
        (asset): asset is typeof asset & { imageUrl: string } =>
          Boolean(asset.imageUrl),
      ),
    };
  },
});

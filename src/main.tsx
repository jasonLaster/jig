import React from "react";
import ReactDOM from "react-dom/client";
import {
  ConvexProvider,
  ConvexReactClient,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import App, {
  type BrochureAsset,
  type BrochureAssetKind,
  getBrochureClientId,
  type BrochurePersistence,
  type SavedBrochure,
} from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convexEnabled =
  Boolean(convexUrl) && import.meta.env.VITE_DISABLE_CONVEX !== "true";
function ConnectedApp() {
  const [clientId] = React.useState(getBrochureClientId);
  const createBrochure = useMutation(api.brochures.create);
  const completeBrochure = useMutation(api.brochures.complete);
  const failBrochure = useMutation(api.brochures.fail);
  const generateUploadUrl = useMutation(api.brochures.generateUploadUrl);
  const listedBrochures = useQuery(api.brochures.listByClient, { clientId });
  const requestedGenerationId = new URLSearchParams(window.location.search).get(
    "brochure",
  );
  const requestedBrochure = useQuery(
    api.brochures.getByGenerationId,
    requestedGenerationId
      ? { generationId: requestedGenerationId }
      : "skip",
  );

  const brochures = React.useMemo<SavedBrochure[] | undefined>(() => {
    if (listedBrochures === undefined && requestedBrochure === undefined) {
      return undefined;
    }
    const unique = new Map<string, SavedBrochure>();
    for (const brochure of [
      ...(listedBrochures ?? []),
      ...(requestedBrochure ? [requestedBrochure] : []),
    ]) {
      const assets = (brochure.assets ?? []).filter(
        (asset): asset is typeof asset & { imageUrl: string } =>
          Boolean(asset.imageUrl),
      ) as BrochureAsset[];
      if (assets.length === 0 && brochure.imageUrl) {
        assets.push({
          kind: "room-hero",
          imageUrl: brochure.imageUrl,
          mediaType: brochure.mediaType ?? "image/png",
        });
      }
      if (assets.length > 0) {
        unique.set(brochure.generationId, {
          ...brochure,
          assets,
          imageUrl: assets[0].imageUrl,
        } as SavedBrochure);
      }
    }
    return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [listedBrochures, requestedBrochure]);

  const persistence = React.useMemo<BrochurePersistence>(
    () => ({
      create: async (input) => {
        await createBrochure(input);
      },
      createUploadUrls: async (kinds) =>
        await Promise.all(
          kinds.map(async (kind) => ({
            kind,
            url: await generateUploadUrl({}),
          })),
        ),
      complete: async ({
        assets,
        clientId: ownerClientId,
        generationId,
        warnings,
      }) =>
        (await completeBrochure({
          assets: assets.map((asset) => ({
            kind: asset.kind as BrochureAssetKind,
            mediaType: asset.mediaType,
            storageId: asset.storageId as Id<"_storage">,
          })),
          clientId: ownerClientId,
          generationId,
          warnings,
        })) as { assets: BrochureAsset[]; imageUrl: string },
      fail: async (input) => {
        await failBrochure(input);
      },
    }),
    [completeBrochure, createBrochure, failBrochure, generateUploadUrl],
  );

  return (
    <App
      brochureClientId={clientId}
      brochurePersistence={persistence}
      convexEnabled
      savedBrochures={brochures}
    />
  );
}

const app = convexEnabled ? (
  <ConnectedApp />
) : (
  <App brochureClientId={getBrochureClientId()} convexEnabled={false} />
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {convexEnabled && convexUrl ? (
      <ConvexProvider client={new ConvexReactClient(convexUrl)}>
        {app}
      </ConvexProvider>
    ) : (
      app
    )}
  </React.StrictMode>,
);

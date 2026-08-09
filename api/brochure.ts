import {
  APICallError,
  NoImageGeneratedError,
  generateImage,
  gateway,
} from "ai";

const IMAGE_MODEL = "openai/gpt-image-2";
const MAX_REFERENCE_COUNT = 4;
const MAX_REQUEST_BYTES = 6_000_000;
const MAX_REFERENCE_BYTES = 1_500_000;
const SUPPORTED_MODEL_IDS = new Set([
  "dining-table",
  "hover-dining-table",
  "wave-dining-table",
  "whisperer",
]);

export const BROCHURE_ASSET_SPECS = [
  { kind: "room-hero", label: "Room · hero" },
  { kind: "room-alternate", label: "Room · alternate" },
  { kind: "table-three-quarter", label: "Table · three-quarter" },
  { kind: "table-profile", label: "Table · profile" },
] as const;
export type BrochureAssetKind = (typeof BROCHURE_ASSET_SPECS)[number]["kind"];

type BrochureUpload = {
  kind: BrochureAssetKind;
  url: string;
};

type BrochureRequest = {
  clientId: string;
  generationId: string;
  dimensions: {
    height: number;
    length: number;
    topThickness: number;
    width: number;
  };
  images: string[];
  modelId: string;
  modelName: string;
  assetSet?: boolean;
  uploads?: BrochureUpload[];
};

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isConvexUploadUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".convex.cloud") &&
      url.pathname === "/api/storage/upload" &&
      url.searchParams.has("token")
    );
  } catch {
    return false;
  }
}

export function parseRequest(value: unknown): BrochureRequest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BrochureRequest>;
  const generationId =
    candidate.generationId === undefined
      ? globalThis.crypto.randomUUID()
      : candidate.generationId;
  const uploads = candidate.uploads;
  const uploadsAreValid =
    uploads === undefined ||
    (Array.isArray(uploads) &&
      uploads.length === BROCHURE_ASSET_SPECS.length &&
      BROCHURE_ASSET_SPECS.every(
        (spec, index) =>
          uploads[index]?.kind === spec.kind &&
          isConvexUploadUrl(uploads[index]?.url),
      ));
  if (
    typeof candidate.modelId !== "string" ||
    !SUPPORTED_MODEL_IDS.has(candidate.modelId) ||
    typeof candidate.modelName !== "string" ||
    candidate.modelName.length > 80 ||
    typeof candidate.clientId !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(candidate.clientId) ||
    typeof generationId !== "string" ||
    !/^[a-zA-Z0-9-]{20,64}$/.test(generationId) ||
    (candidate.assetSet !== undefined && candidate.assetSet !== true) ||
    !uploadsAreValid ||
    !Array.isArray(candidate.images) ||
    candidate.images.length !== MAX_REFERENCE_COUNT ||
    !candidate.dimensions ||
    !isFinitePositive(candidate.dimensions.length) ||
    !isFinitePositive(candidate.dimensions.width) ||
    !isFinitePositive(candidate.dimensions.height) ||
    !isFinitePositive(candidate.dimensions.topThickness)
  ) {
    return null;
  }
  return { ...candidate, generationId } as BrochureRequest;
}

function decodeReferenceImage(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  );
  if (!match) {
    throw new Error("Reference images must be base64 JPEG, PNG, or WebP data URLs.");
  }
  const binary = atob(match[2]);
  if (binary.length > MAX_REFERENCE_BYTES) {
    throw new Error("A reference image exceeded the 1.5 MB limit.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function inches(millimeters: number) {
  return (millimeters / 25.4).toFixed(3).replace(/\.0+$/, "");
}

export function buildBrochurePrompt(
  request: BrochureRequest,
  assetKind: BrochureAssetKind = "room-hero",
) {
  const { dimensions } = request;
  const geometryInstructions = (() => {
    switch (request.modelId) {
      case "wave-dining-table":
        return `Critical geometry invariants: thin rectilinear solid-oak top with straight plan corners and a soft rolled long edge; no apron; two open end frames, each formed by two full-height legs joined by one sculpted wave-curve top rail; two straight lengthwise upper stretchers; four short triangular corner braces between the leg frames and upper structure; no floor-level stretcher or diagonal X-members; four small adjustable feet. Reconcile hidden geometry from all four references. Do not close the end frames or reinterpret the design as a trestle table.
Avoid: live edge, thick slab top, rounded plan corners, closed end boxes, diagonal X-supports, floor-level connector, central box stretcher, missing corner braces, altered proportions, warped wide-angle perspective, rustic farmhouse styling.`;
      case "dining-table":
        return `Critical geometry invariants: solid-oak rounded-rectangle top with visibly rounded plan corners, matching top and bottom edge roundovers, and a substantial flat edge band; no apron; four stout square corner posts with softened vertical corners and a subtle optional groove immediately below the top; four small adjustable feet. The corner mounting plates and three recessed widthwise C-channels belong flush under the tabletop and should not become visible decorative elements. Reconcile hidden geometry from all four references and preserve the direct post-to-top composition.
Avoid: sharp tabletop corners, splayed or tapered legs, apron rails, trestle frames, diagonal braces, exposed steel plates, visible C-channels, altered proportions, warped wide-angle perspective, rustic farmhouse styling.`;
      case "whisperer":
        return `Critical geometry invariants: mid-century solid-oak top with a deep centered underside bevel that leaves a thin perimeter edge; four legs splayed 15 degrees lengthwise and tapered from broad tops to narrow feet; a complete recessed four-apron frame with two long aprons and two side aprons; chamfered apron lower edges; four small adjustable feet. Reconcile the leg splay, taper, apron setbacks, bevel, and hidden connections from all four references. Preserve the light floating-top silhouette.
Avoid: slab-like vertical tabletop edges, straight or cylindrical legs, missing aprons, flush aprons, trestle frames, diagonal X-supports, exposed metal plates, altered proportions, warped wide-angle perspective, rustic farmhouse styling.`;
      default:
        return `Critical geometry invariants: thin rectilinear solid-oak top with straight plan corners and a soft rolled long edge; no apron; two matching sculpted rounded-rectangular end frames; low paired diagonal members crossing between the end frames; four small adjustable feet. Reconcile hidden geometry from all four references. Do not reinterpret the design as a generic trestle table.
Avoid: live edge, thick slab top, rounded plan corners, four independent legs, central box stretcher, missing or extra diagonals, altered proportions, warped wide-angle perspective, rustic farmhouse styling.`;
    }
  })();
  const compositionInstructions: Record<BrochureAssetKind, string> = {
    "room-hero":
      "Scene/backdrop: warm contemporary dining room with ivory limewash walls, pale limestone floor, linen-curtained windows, restrained artwork, and a sculptural pendant. Add exactly six slim pale-oak dining chairs with woven natural seats: four long-side chairs neatly tucked under the tabletop and one chair at each short end slightly pulled out. Keep the base readable through the chairs. Composition/framing: generous eye-level three-quarter hero view showing the full table and all six chairs in a 3:2 landscape catalog photograph.",
    "room-alternate":
      "Scene/backdrop: the same warm contemporary dining-room language—ivory limewash, pale limestone, linen curtains, restrained artwork, and a sculptural pendant—but photographed from the opposite diagonal. Add exactly six slim pale-oak dining chairs with woven natural seats: four long-side chairs neatly tucked under the tabletop and one chair at each short end slightly pulled out. Keep the base readable through the chairs. Composition/framing: a distinct wider architectural perspective that shows the full table, chair layout, and room context without repeating the hero camera angle.",
    "table-three-quarter":
      "Scene/backdrop: seamless warm-white photography cyclorama with a pale neutral floor and no room architecture. Subject: the table alone—no chairs, people, props, or tabletop objects. Composition/framing: full-object eye-level three-quarter product photograph with comfortable margin around every edge, revealing the top, base geometry, supports, and feet.",
    "table-profile":
      "Scene/backdrop: seamless warm-white photography cyclorama with a pale neutral floor and no room architecture. Subject: the table alone—no chairs, people, props, or tabletop objects. Composition/framing: full-object long-side profile with only a slight elevated three-quarter offset to reveal tabletop thickness and support connections while preserving near-orthographic proportions.",
  };
  return `Use case: product-mockup
Asset type: one image in a coordinated premium furniture brochure set
Primary request: Reconstruct one exact ${request.modelName} from the four supplied CAD views. The four images are equal-priority geometry references of the same object, not design variations. Produce only the requested single photograph, not a collage or contact sheet.
Exact dimensions: ${inches(dimensions.length)} in long × ${inches(dimensions.width)} in wide × ${inches(dimensions.height)} in high; tabletop thickness ${inches(dimensions.topThickness)} in. Preserve the resulting length-to-width ratio, tabletop overhangs, and member scale.
${geometryInstructions}
${compositionInstructions[assetKind]}
Style: ultra-photorealistic premium European furniture catalog photography, natural late-morning light, physically plausible contact shadows, 3:2 landscape composition, high material fidelity.
Constraints: every visible table dimension, member count, connection point, edge profile, frame, support member, and foot must match the CAD references. Do not add or remove structural members or hardware. No decor on the tabletop, typography, logo, or watermark.
`;
}

async function generateBrochureAsset(
  request: BrochureRequest,
  references: Uint8Array[],
  assetKind: BrochureAssetKind,
) {
  const result = await generateImage({
    model: gateway.image(IMAGE_MODEL),
    prompt: {
      text: buildBrochurePrompt(request, assetKind),
      images: references,
    },
    size: "1536x1024",
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(52_000),
    providerOptions: {
      gateway: {
        user: request.clientId,
        tags: [
          "feature:brochure",
          `model:${request.modelId}`,
          "prompt:v4",
          `asset:${assetKind}`,
          `generation:${request.generationId}`,
        ],
      },
    },
  });
  return { assetKind, result };
}

async function uploadBrochureAsset(
  upload: BrochureUpload,
  generated: Awaited<ReturnType<typeof generateBrochureAsset>>,
) {
  const image = generated.result.image;
  const imageBytes = new Uint8Array(image.uint8Array.byteLength);
  imageBytes.set(image.uint8Array);
  const response = await fetch(upload.url, {
    method: "POST",
    headers: { "content-type": image.mediaType },
    body: new Blob([imageBytes.buffer], { type: image.mediaType }),
  });
  if (!response.ok) {
    throw new Error(`Brochure image upload failed (${response.status}).`);
  }
  const payload = (await response.json()) as { storageId?: unknown };
  if (typeof payload.storageId !== "string" || payload.storageId.length < 8) {
    throw new Error("Brochure image upload returned an invalid storage ID.");
  }
  return {
    kind: generated.assetKind,
    storageId: payload.storageId,
    mediaType: image.mediaType,
  };
}

async function handleBrochureRequest(request: Request) {
  if (request.method !== "POST") {
    return json(
      { error: "Method not allowed." },
      405,
      { allow: "POST" },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "The reference image payload is too large." }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "The request body must be valid JSON." }, 400);
  }

  const brochureRequest = parseRequest(body);
  if (!brochureRequest) {
    return json({ error: "The brochure request is incomplete or invalid." }, 400);
  }

  let references: Uint8Array[];
  try {
    references = brochureRequest.images.map(decodeReferenceImage);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid reference image." },
      400,
    );
  }

  try {
    if (brochureRequest.assetSet) {
      if (!brochureRequest.uploads) {
        return json(
          { error: "Brochure storage is required for the four-image set." },
          503,
        );
      }
      const generatedAssets = await Promise.all(
        BROCHURE_ASSET_SPECS.map((spec) =>
          generateBrochureAsset(brochureRequest, references, spec.kind),
        ),
      );
      const assets = await Promise.all(
        generatedAssets.map((generated, index) =>
          uploadBrochureAsset(brochureRequest.uploads![index], generated),
        ),
      );
      return json({
        assets,
        generationId: brochureRequest.generationId,
        model: IMAGE_MODEL,
        warnings: generatedAssets.flatMap(({ assetKind, result }) =>
          result.warnings.map((warning) => `${assetKind}:${warning.type}`),
        ),
      });
    }

    const { result } = await generateBrochureAsset(
      brochureRequest,
      references,
      "room-hero",
    );

    return json({
      imageDataUrl: `data:${result.image.mediaType};base64,${result.image.base64}`,
      generationId: brochureRequest.generationId,
      model: IMAGE_MODEL,
      warnings: result.warnings.map((warning) => warning.type),
    });
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      return json(
        {
          error: "Brochure generation is temporarily rate limited. Try again shortly.",
        },
        429,
        error.responseHeaders?.["retry-after"]
          ? { "retry-after": error.responseHeaders["retry-after"] }
          : undefined,
      );
    }
    if (APICallError.isInstance(error) && error.statusCode === 402) {
      return json(
        { error: "The brochure generation budget is currently unavailable." },
        503,
      );
    }
    if (NoImageGeneratedError.isInstance(error)) {
      return json(
        { error: "The image model did not return a usable brochure image." },
        502,
      );
    }
    console.error("Brochure generation failed", error);
    return json(
      { error: "Brochure generation failed. Please try again." },
      500,
    );
  }
}

export default {
  fetch: handleBrochureRequest,
};

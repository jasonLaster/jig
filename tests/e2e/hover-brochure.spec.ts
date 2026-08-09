import { expect, test } from "@playwright/test";
import {
  BROCHURE_ASSET_SPECS,
  buildBrochurePrompt,
  parseRequest,
} from "../../api/brochure";

const MOCK_BROCHURE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const MOCK_BROCHURE_ASSETS = BROCHURE_ASSET_SPECS.map(({ kind }) => ({
  imageDataUrl: MOCK_BROCHURE_IMAGE,
  kind,
  mediaType: "image/png",
}));

test("accepts brochure requests from tabs opened before generation IDs shipped", () => {
  const request = parseRequest({
    clientId: "legacy-client-123",
    dimensions: {
      height: 749.3,
      length: 1905,
      topThickness: 31.75,
      width: 901.7,
    },
    images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
    modelId: "hover-dining-table",
    modelName: "X-Hover Dining Table",
  });

  expect(request?.generationId).toMatch(/^[a-zA-Z0-9-]{20,64}$/);
});

test("accepts Wave brochure requests with model-specific geometry guidance", () => {
  const request = parseRequest({
    clientId: "wave-client-123",
    dimensions: {
      height: 749.3,
      length: 1905,
      topThickness: 31.75,
      width: 901.7,
    },
    generationId: "wave-generation-1234567890",
    images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
    modelId: "wave-dining-table",
    modelName: "The Wave",
  });

  expect(request).not.toBeNull();
  const prompt = buildBrochurePrompt(request!);
  expect(prompt).toContain("two open end frames");
  expect(prompt).toContain("four short triangular corner braces");
  expect(prompt).toContain("no floor-level stretcher or diagonal X-members");
});

test("validates the four signed Convex upload destinations", () => {
  const baseRequest = {
    assetSet: true,
    clientId: "asset-client-123",
    dimensions: {
      height: 749.3,
      length: 1905,
      topThickness: 31.75,
      width: 901.7,
    },
    generationId: "asset-generation-1234567890",
    images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
    modelId: "hover-dining-table",
    modelName: "X-Hover Dining Table",
  };
  const uploads = BROCHURE_ASSET_SPECS.map(({ kind }, index) => ({
    kind,
    url: `https://example-${index}.convex.cloud/api/storage/upload?token=signed-${index}`,
  }));

  expect(parseRequest({ ...baseRequest, uploads })).not.toBeNull();
  expect(
    parseRequest({
      ...baseRequest,
      uploads: uploads.map((upload, index) =>
        index === 2 ? { ...upload, url: "https://example.com/upload" } : upload,
      ),
    }),
  ).toBeNull();
});

test("builds distinct room and table-only brochure compositions", () => {
  const request = parseRequest({
    clientId: "composition-client-123",
    dimensions: {
      height: 749.3,
      length: 1905,
      topThickness: 31.75,
      width: 901.7,
    },
    generationId: "composition-generation-1234567890",
    images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
    modelId: "hover-dining-table",
    modelName: "X-Hover Dining Table",
  })!;

  expect(buildBrochurePrompt(request, "room-alternate")).toContain(
    "opposite diagonal",
  );
  expect(buildBrochurePrompt(request, "table-three-quarter")).toContain(
    "table alone—no chairs",
  );
  expect(buildBrochurePrompt(request, "table-profile")).toContain(
    "near-orthographic proportions",
  );
});

for (const model of [
  {
    id: "dining-table",
    name: "Plate Table",
    promptDetails: ["four stout square corner posts", "no apron"],
  },
  {
    id: "whisperer",
    name: "Whisperer",
    promptDetails: ["splayed 15 degrees", "complete recessed four-apron frame"],
  },
]) {
  test(`accepts ${model.name} brochure requests with model-specific geometry guidance`, () => {
    const request = parseRequest({
      clientId: `${model.id}-client-123`,
      dimensions: {
        height: 762,
        length: 1905,
        topThickness: 38.1,
        width: 965.2,
      },
      generationId: `${model.id}-generation-1234567890`,
      images: Array.from({ length: 4 }, () => MOCK_BROCHURE_IMAGE),
      modelId: model.id,
      modelName: model.name,
    });

    expect(request).not.toBeNull();
    const prompt = buildBrochurePrompt(request!);
    for (const detail of model.promptDetails) {
      expect(prompt).toContain(detail);
    }
  });
}

for (const model of [
  { id: "dining-table", name: "Plate Table" },
  { id: "whisperer", name: "Whisperer" },
  { id: "wave-dining-table", name: "The Wave" },
]) {
  test(`${model.name} captures four CAD angles for brochure generation`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    let requestPayload: {
      generationId: string;
      images: string[];
      modelId: string;
    } | null = null;

    await page.route("**/api/brochure", async (route) => {
      requestPayload = route.request().postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          assets: MOCK_BROCHURE_ASSETS,
          generationId: requestPayload!.generationId,
          model: "openai/gpt-image-2",
          warnings: [],
        }),
      });
    });

    await page.goto(`/?model=${model.id}&unit=in`);
    await expect(page.locator(".scene-panel canvas")).toBeVisible();
    await page.getByRole("button", { name: "Brochures", exact: true }).click();
    await page.getByRole("button", { name: "Generate brochure" }).click();
    await expect
      .poll(() => requestPayload, { message: `${model.name} brochure payload` })
      .not.toBeNull();

    expect(requestPayload!.modelId).toBe(model.id);
    expect(requestPayload!.images).toHaveLength(4);
    expect(
      requestPayload!.images.every((image) =>
        image.startsWith("data:image/jpeg;base64,"),
      ),
    ).toBe(true);
    await expect(page.getByTestId("hover-brochure-panel")).toHaveAttribute(
      "data-status",
      "success",
    );
  });
}

test("brochure mode captures four CAD angles and presents the generated image", async ({
  page,
}) => {
  test.setTimeout(60_000);
  let requestPayload: {
    clientId: string;
    dimensions: Record<string, number>;
    generationId: string;
    images: string[];
    modelId: string;
    modelName: string;
  } | null = null;
  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });

  await page.route("**/api/brochure", async (route) => {
    requestPayload = route.request().postDataJSON();
    await responseGate;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        assets: MOCK_BROCHURE_ASSETS,
        generationId: requestPayload!.generationId,
        model: "openai/gpt-image-2",
        warnings: [],
      }),
    });
  });

  await page.goto("/?model=hover-dining-table&unit=in");
  const viewer = page.locator(".viewer");
  const canvas = page.locator(".scene-panel canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Center view" }).click();
  const orientationBefore = await page
    .locator(".orientation-cube")
    .getAttribute("style");

  await expect(
    page
      .locator('[aria-label="X-Hover assembly view"]')
      .getByRole("button", { name: /brochure/i }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Brochures", exact: true }).click();
  await page.getByRole("button", { name: "Generate brochure" }).click();
  const brochure = page.getByTestId("hover-brochure-panel");
  await expect(viewer).toHaveAttribute("data-assembly-mode", "brochure");
  await expect(brochure).toHaveAttribute("data-status", "generating");
  await expect
    .poll(() => requestPayload, { message: "brochure request payload" })
    .not.toBeNull();

  expect(requestPayload!.modelId).toBe("hover-dining-table");
  expect(requestPayload!.modelName).toBe("X-Hover Dining Table");
  expect(requestPayload!.clientId).toMatch(/^[a-zA-Z0-9-]{8,64}$/);
  expect(requestPayload!.generationId).toMatch(/^[a-zA-Z0-9-]{20,64}$/);
  expect(requestPayload!.images).toHaveLength(4);
  expect((requestPayload as { assetSet?: boolean }).assetSet).toBe(true);
  expect(
    requestPayload!.images.every((image) =>
      image.startsWith("data:image/jpeg;base64,"),
    ),
  ).toBe(true);
  expect(requestPayload!.images.every((image) => image.length > 1_000)).toBe(
    true,
  );
  expect(requestPayload!.dimensions.length).toBeCloseTo(75 * 25.4, 0);
  expect(requestPayload!.dimensions.width).toBeCloseTo(35.5 * 25.4, 0);

  releaseResponse();
  await expect(brochure).toHaveAttribute("data-status", "success");
  await expect(
    page.getByAltText("X-Hover Dining Table room scene · hero"),
  ).toHaveAttribute("src", MOCK_BROCHURE_IMAGE);
  await expect(page.getByRole("link", { name: "Download view" })).toHaveAttribute(
    "download",
    "x-hover-dining-table-room-hero.png",
  );
  await expect(page.getByLabel("CAD dimensions")).toContainText("75 in");
  await expect(page.getByLabel("CAD dimensions")).toContainText("35.5 in");
  await expect(page.getByLabel("Brochure views").getByRole("button")).toHaveCount(
    4,
  );
  await page
    .getByRole("button", { name: "Show Table only · profile" })
    .click();
  await expect(
    page.getByAltText("X-Hover Dining Table table only · profile"),
  ).toHaveAttribute("src", MOCK_BROCHURE_IMAGE);
  await expect(
    page.getByText(/dimensions come from the authoritative CAD model/),
  ).toBeVisible();
  await expect(page.getByText("Not saved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to model" }).click();
  await expect(brochure).toHaveCount(0);
  await expect(viewer).toHaveAttribute("data-assembly-mode", "assembled");
  await expect(page.locator(".orientation-cube")).toHaveAttribute(
    "style",
    orientationBefore!,
  );

  await page.getByRole("button", { name: "Brochures", exact: true }).click();
  await expect(
    page.getByText("Connect Convex to save and browse generated brochures."),
  ).toBeVisible();
});

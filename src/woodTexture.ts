import * as THREE from "three";

export type WoodSpecies = "oak" | "walnut";

const WOOD_SPECIES_BY_MODEL: Readonly<Partial<Record<string, WoodSpecies>>> = {
  "dining-table": "oak",
  whisperer: "oak",
  "vinny-table": "oak",
  "hover-dining-table": "oak",
  "wave-dining-table": "oak",
};

export function getWoodSpeciesForModel(modelId: string): WoodSpecies | null {
  return WOOD_SPECIES_BY_MODEL[modelId] ?? null;
}

export function createWoodTexture(
  renderer: THREE.WebGLRenderer,
  species: WoodSpecies,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(canvas.width, canvas.height);
  const walnut = species === "walnut";
  const base = walnut ? [92, 58, 39] : [180, 143, 97];
  let seed = walnut ? 0x77616c6e : 0x5f3759df;
  for (let y = 0; y < canvas.height; y += 1) {
    const broad = Math.sin(y * 0.072) * 5 + Math.sin(y * 0.019) * 7;
    for (let x = 0; x < canvas.width; x += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = ((seed & 255) / 255 - 0.5) * (walnut ? 7 : 0.8);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = base[0] + broad + noise;
      image.data[offset + 1] = base[1] + broad * 0.72 + noise;
      image.data[offset + 2] = base[2] + broad * 0.45 + noise;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  for (let y = 0; y < canvas.height; y += walnut ? 1 : 32) {
    const broad = Math.sin(y * 0.115) * 0.5 + Math.sin(y * 0.031) * 0.5;
    const lightness = (walnut ? 62 : 92) + Math.round(broad * 12);
    context.strokeStyle = walnut
      ? `rgba(${lightness + 20}, ${lightness + 3}, ${Math.max(20, lightness - 18)}, 0.22)`
      : `rgba(${lightness + 28}, ${lightness + 10}, ${Math.max(42, lightness - 22)}, 0.08)`;
    context.lineWidth = walnut ? (y % 23 === 0 ? 1.1 : 0.42) : 0.6;
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += 8) {
      const wave =
        Math.sin(x * 0.018 + y * 0.15) * 1.7 + Math.sin(x * 0.005) * 1.2;
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.stroke();
  }
  for (let index = 0; index < (walnut ? 38 : 8); index += 1) {
    const y = (index * 71) % canvas.height;
    context.strokeStyle = walnut
      ? "rgba(28, 14, 9, 0.22)"
      : "rgba(68, 41, 21, 0.07)";
    context.lineWidth = 0.65;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(280, y + 12, 700, y - 9, canvas.width, y + 3);
    context.stroke();
  }

  if (!walnut) {
    for (let index = 0; index < 40; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % canvas.width;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = seed % canvas.height;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const length = 2 + (seed % 13);
      context.strokeStyle = `rgba(63, 37, 19, ${0.04 + (seed % 4) / 100})`;
      context.lineWidth = 0.45 + (seed % 3) * 0.18;
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo(x + length * 0.55, y - 0.65, x + length, y);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(walnut ? 3.2 : 1, walnut ? 1.6 : 0.7);
  texture.anisotropy = Math.min(
    8,
    renderer.capabilities.getMaxAnisotropy(),
  );
  texture.needsUpdate = true;
  return texture;
}

import * as THREE from "three";
import type { WoodSpecies } from "./woodTexture";

const WALNUT_SETS: Partial<Record<WoodSpecies, string>> = {
  "smoked-walnut": "smoked-walnut-veneer",
  "natural-walnut": "natural-walnut-veneer",
};

export function disposeWoodMaterial(material: THREE.MeshStandardMaterial) {
  material.map?.dispose();
  material.normalMap?.dispose();
  material.roughnessMap?.dispose();
  material.dispose();
}

export async function loadWalnutMaterial(
  renderer: THREE.WebGLRenderer,
  species: WoodSpecies,
): Promise<THREE.MeshStandardMaterial | null> {
  const set = WALNUT_SETS[species];
  if (!set) return null;
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(
    ["base-color", "normal-gl", "roughness"].map((map) =>
      loader.loadAsync(`/materials/${set}/${map}.webp`),
    ),
  );
  if (results.some((result) => result.status === "rejected")) {
    for (const result of results) {
      if (result.status === "fulfilled") result.value.dispose();
    }
    throw new Error(`Unable to load ${species} material maps`);
  }
  const [map, normalMap, roughnessMap] = results.map(
    (result) => (result as PromiseFulfilledResult<THREE.Texture>).value,
  );
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    // Vinny UVs cover 800 mm; these source maps cover one metre.
    texture.repeat.set(0.8, 0.8);
    texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  }
  return new THREE.MeshPhysicalMaterial({
    // Model an oiled furniture finish over the lighter source veneer scans.
    color: new THREE.Color().setRGB(0.42, 0.32, 0.24),
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap,
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.64,
    side: THREE.DoubleSide,
  });
}

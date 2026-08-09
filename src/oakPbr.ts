import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const OAK_BASE_COLOR_URL =
  "/materials/oak-veneer-01/base-color.webp";
const OAK_NORMAL_URL = "/materials/oak-veneer-01/normal-gl.webp";
const OAK_ROUGHNESS_URL =
  "/materials/oak-veneer-01/roughness.webp";
const STUDIO_ENVIRONMENT_URL =
  "/environments/studio-small-08/studio-small-08.hdr";

export type OakRenderingAssets = {
  environment: THREE.DataTexture;
  material: THREE.MeshPhysicalMaterial;
  dispose: () => void;
};

function configureSurfaceTexture(
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
}

export async function loadOakRenderingAssets(
  renderer: THREE.WebGLRenderer,
): Promise<OakRenderingAssets> {
  const textureLoader = new THREE.TextureLoader();
  const [baseColor, normal, roughness, environment] = await Promise.all([
    textureLoader.loadAsync(OAK_BASE_COLOR_URL),
    textureLoader.loadAsync(OAK_NORMAL_URL),
    textureLoader.loadAsync(OAK_ROUGHNESS_URL),
    new RGBELoader().loadAsync(STUDIO_ENVIRONMENT_URL),
  ]);

  baseColor.colorSpace = THREE.SRGBColorSpace;
  normal.colorSpace = THREE.NoColorSpace;
  roughness.colorSpace = THREE.NoColorSpace;
  for (const texture of [baseColor, normal, roughness]) {
    configureSurfaceTexture(texture, renderer);
  }

  environment.mapping = THREE.EquirectangularReflectionMapping;

  const material = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    map: baseColor,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.52, 0.52),
    roughnessMap: roughness,
    roughness: 0.78,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.58,
    envMapIntensity: 1.05,
    side: THREE.DoubleSide,
  });

  return {
    environment,
    material,
    dispose: () => {
      material.dispose();
      baseColor.dispose();
      normal.dispose();
      roughness.dispose();
      environment.dispose();
    },
  };
}

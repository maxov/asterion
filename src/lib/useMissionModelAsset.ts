import { useEffect, useState } from "react";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_LOADER = new GLTFLoader();
const missionModelAssetCache = new Map<string, Promise<GLTF>>();

function loadMissionModelAsset(assetPath: string) {
  const cached = missionModelAssetCache.get(assetPath);
  if (cached) return cached;

  const promise = MODEL_LOADER.loadAsync(assetPath);
  missionModelAssetCache.set(assetPath, promise);
  return promise;
}

export function useMissionModelAsset(assetPath: string | undefined) {
  const [asset, setAsset] = useState<GLTF | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!assetPath) {
      setAsset(null);
      setError(null);
      return;
    }

    let cancelled = false;

    loadMissionModelAsset(assetPath)
      .then((loaded) => {
        if (cancelled) return;
        setAsset(loaded);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAsset(null);
        setError(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      cancelled = true;
    };
  }, [assetPath]);

  return { asset, error };
}


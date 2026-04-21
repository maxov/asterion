import { useEffect, useState } from "react";
import { parseMissionAsset, type MissionAsset } from "./missions.ts";
import { publicPath } from "./publicPath.ts";

const missionAssetCache = new Map<string, Promise<MissionAsset>>();

function loadMissionAsset(assetPath: string) {
  const cached = missionAssetCache.get(assetPath);
  if (cached) return cached;

  const promise = fetch(publicPath(assetPath))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load mission asset ${assetPath}: ${response.status}`);
      }
      return response.json();
    })
    .then((json) => parseMissionAsset(json));

  missionAssetCache.set(assetPath, promise);
  return promise;
}

export function useMissionAsset(assetPath: string) {
  const [asset, setAsset] = useState<MissionAsset | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadMissionAsset(assetPath)
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

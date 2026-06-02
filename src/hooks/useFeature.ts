import { useCallback, useEffect, useState } from "react";
import { type FeatureId, isFeatureAvailable } from "../lib/features";

export function useFeature(featureId: FeatureId) {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isFeatureAvailable(featureId).then((ok) => {
      if (!cancelled) setAllowed(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [featureId]);

  const refresh = useCallback(async () => {
    const ok = await isFeatureAvailable(featureId);
    setAllowed(ok);
  }, [featureId]);

  return {
    allowed,
    loading: allowed === null,
    refresh,
  };
}

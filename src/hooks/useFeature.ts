import { useCallback, useEffect, useState } from "react";
import { type FeatureId, FEATURE_META, isFeatureAvailable } from "../lib/features";

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

export function useFeatureGate(featureId: FeatureId) {
  const { allowed, loading, refresh } = useFeature(featureId);
  const locked = !loading && !allowed;
  const meta = FEATURE_META[featureId];

  const guard = useCallback(
    <A extends unknown[]>(
      handler: (...args: A) => void,
      onLocked?: () => void,
    ) =>
      (...args: A) => {
        if (locked) {
          onLocked?.();
          return;
        }
        handler(...args);
      },
    [locked],
  );

  return {
    allowed,
    loading,
    locked,
    lockedMessage: meta.lockedMessage,
    guard,
    refresh,
  };
}

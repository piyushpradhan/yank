import type { ReactNode } from "react";
import type { FeatureId } from "../lib/features";
import { useFeatureGate } from "../hooks/useFeature";

interface FeatureGateProps {
  feature: FeatureId;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { allowed, loading, lockedMessage } = useFeatureGate(feature);

  if (loading) return null;
  if (allowed) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <span
      title={lockedMessage}
      aria-disabled
      style={{ opacity: 0.4, cursor: "not-allowed", pointerEvents: "none" }}
    >
      {children}
    </span>
  );
}

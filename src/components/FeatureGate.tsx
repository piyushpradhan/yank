import type { ReactNode } from "react";
import type { FeatureId } from "../lib/features";
import { useFeature } from "../hooks/useFeature";

interface FeatureGateProps {
  feature: FeatureId;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { allowed, loading } = useFeature(feature);

  if (loading) return null;
  if (allowed) return <>{children}</>;
  return <>{fallback ?? null}</>;
}

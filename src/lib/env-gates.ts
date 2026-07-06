export function isExplicitDevModeEnabled(): boolean {
  return (
    process.env.X402_DEV_MODE === "true" &&
    (process.env.VERCEL_ENV === "development" || process.env.VERCEL_ENV === "preview") &&
    process.env.NODE_ENV !== "production"
  );
}

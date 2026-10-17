/** Web-only preview used for screenshots. Never set on the native build. */
export const screenshotMode = (() => {
  const loc = (globalThis as { location?: { search?: string } }).location;
  return Boolean(loc?.search?.includes("shot=1"));
})();

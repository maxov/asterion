export type RendererMode = "webgl" | "webgpu";

export function preferredRendererModeFromSearch(search: string): RendererMode {
  const value = new URLSearchParams(search).get("renderer");
  return value === "webgl" ? "webgl" : "webgpu";
}

/** Prepend Vite's base URL to an absolute public-directory path. */
export function publicPath(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}

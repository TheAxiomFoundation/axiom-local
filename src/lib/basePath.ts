/**
 * The app mounts at axiom.org/local, so the static export is built with
 * basePath "/local" (next.config.ts). Next handles <Link> and router paths
 * itself; anything that hits the network directly — fetch() of vendored
 * assets, the runtime wasm-glue import — must carry the prefix explicitly.
 */

export const BASE_PATH = "/local";

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}

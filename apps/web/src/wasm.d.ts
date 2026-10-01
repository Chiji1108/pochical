// WebAssembly the Cloudflare Vite plugin hands over as compiled modules
// (`.wasm?module`), since Workers cannot compile it from bytes.
declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}

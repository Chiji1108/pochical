// Vite's ImportMetaEnv is an interface, so only an interface merges into it.
// oxlint-disable-next-line typescript/consistent-type-definitions
interface ImportMetaEnv {
  readonly VITE_DESIGN_ORIGIN: string;
  readonly VITE_TRY_ORIGIN: string;
}

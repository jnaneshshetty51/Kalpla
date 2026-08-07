// @types/mdx only types the default JSX-component export of "*.mdx" modules
// and explicitly documents augmenting the ambient module for any additional
// named exports (see node_modules/@types/mdx/index.d.ts). Both
// content/blog/*.mdx and content/legal/*.mdx export a plain `metadata`
// object (Prompt 89's convention — no frontmatter parser, just a JS export).
declare module "*.mdx" {
  export const metadata: Record<string, string>;
}

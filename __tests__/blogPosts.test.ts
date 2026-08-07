import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import path from "path";

/**
 * lib/blog/posts.ts dynamically imports `@/content/blog/${slug}.mdx` files.
 * This vitest project has no MDX transform registered (only Next's webpack
 * pipeline parses MDX prose) — Vite's default JS parser can only handle a
 * .mdx file whose content happens to be plain, syntactically valid JS/TS.
 * The real welcome-to-the-kalpla-blog.mdx post contains actual prose and
 * fails that parse, so it can't be exercised directly here.
 *
 * Rather than touch real content, we mock readdirSync to report only our
 * own temporary fixture files (written to the real content/blog dir so
 * Vite's dynamic-import glob can actually resolve them, then removed in
 * afterAll) — this fully isolates the test from the real blog content.
 */
const FIXTURE_DIR = path.join(process.cwd(), "content", "blog");
const OLD_SLUG = "__vitest_fixture_old__";
const NEW_SLUG = "__vitest_fixture_new__";
const OLD_PATH = path.join(FIXTURE_DIR, `${OLD_SLUG}.mdx`);
const NEW_PATH = path.join(FIXTURE_DIR, `${NEW_SLUG}.mdx`);

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readdirSync: (dir: unknown) => {
      if (dir === FIXTURE_DIR) return [`${OLD_SLUG}.mdx`, `${NEW_SLUG}.mdx`, "not-a-post.txt", "README.md"];
      return actual.readdirSync(dir as string);
    },
  };
});

describe("lib/blog/posts.ts", () => {
  beforeAll(() => {
    writeFileSync(
      OLD_PATH,
      `export const metadata = { title: "Old Post", description: "old post desc", publishedDate: "2026-01-01" };\n`,
    );
    writeFileSync(
      NEW_PATH,
      `export const metadata = { title: "New Post", description: "new post desc", publishedDate: "2026-06-01" };\n`,
    );
  });

  afterAll(() => {
    if (existsSync(OLD_PATH)) unlinkSync(OLD_PATH);
    if (existsSync(NEW_PATH)) unlinkSync(NEW_PATH);
  });

  // Imported dynamically, and only inside each test (after the beforeAll
  // fixture files already exist on disk): lib/blog/posts.ts's
  // `import(`@/content/blog/${slug}.mdx`)` is a variable dynamic import,
  // which Vite resolves via a glob built from whatever .mdx files exist in
  // content/blog/ at the moment this module is first transformed. A
  // top-level static import of this test module would transform
  // lib/blog/posts.ts (and freeze that glob) before the fixtures exist.

  it("getBlogSlugs derives slugs only from .mdx files, dropping the extension and ignoring other file types", async () => {
    const { getBlogSlugs } = await import("@/lib/blog/posts");
    const slugs = getBlogSlugs();
    expect(slugs).toEqual([OLD_SLUG, NEW_SLUG]);
  });

  it("getBlogPostMetadata reads the mdx file's exported metadata object for a given slug", async () => {
    const { getBlogPostMetadata } = await import("@/lib/blog/posts");
    const meta = await getBlogPostMetadata(NEW_SLUG);
    expect(meta).toEqual({ title: "New Post", description: "new post desc", publishedDate: "2026-06-01" });
  });

  it("getAllBlogPosts attaches the slug to each post's metadata and sorts newest publishedDate first", async () => {
    const { getAllBlogPosts } = await import("@/lib/blog/posts");
    const posts = await getAllBlogPosts();
    expect(posts.map((p) => p.slug)).toEqual([NEW_SLUG, OLD_SLUG]);
    expect(posts[0]).toMatchObject({ slug: NEW_SLUG, title: "New Post" });
  });
});

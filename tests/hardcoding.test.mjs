import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const productionFiles = [
  ...walk(join(root, "src")).filter((f) => !f.includes("/content/blog/")),
  ...walk(join(root, "scripts")),
  ...walk(join(root, "templates")),
  ...walk(join(root, ".github")),
  join(root, "astro.config.mjs"),
  join(root, "README.md"),
];

test("no hardcoded GitHub account/repository URLs in production files", () => {
  const bad = [];
  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    if (/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(source)) bad.push(`${file}: hardcoded GitHub URL with account/repository`);
    if (/me\.webp/.test(source)) bad.push(`${file}: obsolete local profile image`);
  }
  assert.deepEqual(bad, []);
});

test("branding remains explicitly configurable and independent of the account", () => {
  const site = JSON.parse(readFileSync(join(root, "src/content/site.json"), "utf8"));
  assert.equal(site.brand, "Astro Pages Publisher");
  assert.ok(site.description.length > 0);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  assert.equal(pkg.name, "astro-pages-publisher");
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.name, lock.packages[""].name);
  assert.equal(pkg.license, "MIT");
  const envSource = readFileSync(join(root, "src/lib/site-env.mjs"), "utf8");
  assert.doesNotMatch(envSource, /DEFAULT_(?:OWNER|REPOSITORY)|fallbackOwner|fallbackRepository/i);
});

test("the published demo explains the reusable project", () => {
  const files = [...walk(join(root, "src")), ...walk(join(root, "scripts")), join(root, "README.md")];
  const content = files.map((f) => readFileSync(f, "utf8")).join("\n");
  assert.match(content, /Astro Pages Publisher/);
  assert.match(content, /GitHub Pages/);
  assert.match(content, /fork/i);
  assert.ok(files.some((f) => f.endsWith("getting-started.astro")));
  assert.ok(files.some((f) => f.endsWith("how-it-works.astro")));
  assert.ok(files.some((f) => f.endsWith("templates.astro")));
});

test("starter brand and included articles are generic, coherent demo content", () => {
  const site = JSON.parse(readFileSync(join(root, "src/content/site.json"), "utf8"));
  assert.equal(site.brand, "Astro Pages Publisher");
  assert.match(site.description, /reusable Astro starter/i);
  assert.match(site.bio, /GitHub repository/i);
  assert.match(site.footerText, /reusable starter/i);

  const blogDir = join(root, "src/content/blog");
  const posts = readdirSync(blogDir).filter((name) => name.endsWith(".md") && !name.startsWith("."));
  assert.equal(posts.length, 4, "the four intentional starter guides should remain included");
  const contents = posts.map((name) => readFileSync(join(blogDir, name), "utf8"));
  for (const post of contents) {
    assert.match(post, /^---\ntitle: .+\npubDate: \d{4}-\d{2}-\d{2}\n/m, "each guide needs valid frontmatter");
    assert.ok(post.split("\n").length > 18, "each guide should provide useful instructional content");
  }
  const combined = contents.join("\n").toLowerCase();
  assert.match(combined, /fork/);
  assert.match(combined, /site\.json/);
  assert.match(combined, /templates/);
  assert.match(combined, /npm run verify/);
});

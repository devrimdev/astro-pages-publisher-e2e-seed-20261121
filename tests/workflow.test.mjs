import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("workflow: template preparation passes the final prepared SHA to the build", () => {
  assert.match(workflow, /template-preparation:[\s\S]*?contents: write/);
  assert.match(workflow, /prepared_sha: \$\{\{ steps\.prepared\.outputs\.sha \}\}/);
  assert.match(workflow, /ref: \$\{\{ needs\.template-preparation\.outputs\.prepared_sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /git push origin "HEAD:refs\/heads\/\$\{GITHUB_REF_NAME\}"/);
  assert.match(workflow, /src\/pages\/\.new-feature-page\.astro/);
  assert.match(workflow, /src\/pages\/\.new-resource-page\.astro/);
});

test("workflow: the build has read-only permissions and no build token", () => {
  const build = workflow.split("\n  build:")[1].split("\n  deploy:")[0];
  assert.match(build, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(build, /contents: write|GITHUB_TOKEN|secrets\.GITHUB_TOKEN/);
});

test("workflow: deployment depends on the build and uses the Pages artifact", () => {
  const deploy = workflow.split("\n  deploy:")[1];
  assert.match(deploy, /needs: build/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  assert.match(deploy, /actions\/deploy-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
});

test("navigation is generated once in CI; check/build do not generate it again", () => {
  assert.equal((workflow.match(/node scripts\/generate-nav\.mjs/g) ?? []).length, 1);
  assert.equal(packageJson.scripts.check, "astro check");
  assert.equal(packageJson.scripts.build, "astro build");
});

test("workflow: deployment follows the repository default branch rather than a fixed owner or branch", () => {
  assert.match(workflow, /github\.ref_name == github\.event\.repository\.default_branch/);
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/);
  assert.match(readFileSync(".github/workflows/pr.yml", "utf8"), /pull_request:/);
});


test("workflow: optional site settings are passed from GitHub Actions variables", () => {
  for (const path of [".github/workflows/deploy.yml", ".github/workflows/pr.yml"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /SITE_URL: \$\{\{ vars\.SITE_URL \}\}/);
    assert.match(source, /SITE_BASE: \$\{\{ vars\.SITE_BASE \}\}/);
    assert.match(source, /SITE_EXCLUDE_REPOS: \$\{\{ vars\.SITE_EXCLUDE_REPOS \}\}/);
    assert.match(source, /SITE_INCLUDE_SITE_REPO: \$\{\{ vars\.SITE_INCLUDE_SITE_REPO \}\}/);
  }
});

test("workflow: JavaScript actions use Node 24-compatible releases", () => {
  const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");
  const pr = readFileSync(".github/workflows/pr.yml", "utf8");
  for (const source of [deploy, pr]) {
    assert.match(source, /actions\/checkout@v7/);
    assert.match(source, /actions\/setup-node@v7/);
    assert.match(source, /node-version: 22\.23\.4/);
    assert.doesNotMatch(source, /actions\/(?:checkout|setup-node)@v[234]/);
  }
  assert.match(deploy, /actions\/upload-pages-artifact@v5/);
  assert.match(deploy, /actions\/deploy-pages@v5/);
  assert.doesNotMatch(deploy, /actions\/(?:upload-pages-artifact|deploy-pages)@v[34]/);
});

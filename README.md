# Astro Pages Publisher

A fork-friendly Astro starter for publishing customizable static websites with GitHub Pages. It combines Markdown content, reusable Astro page templates, automatically generated navigation, GitHub profile/repository/commit data, and a security-conscious GitHub Actions deployment workflow.

The repository is designed to be forked, renamed, and adapted without searching the source for the original owner's username. GitHub identity and Pages routing are derived from the repository and branch provided by GitHub Actions. Editorial branding remains independently configurable.

## Features

- **Fork-aware URLs:** project-site, user/organization-site, and custom-domain base paths are computed centrally.
- **Content templates:** reusable starters for Markdown posts, standard pages, feature pages, resource collections, and footer pages.
- **Generated navigation:** regular pages and footer pages become links automatically; dotfiles and underscore-prefixed files are ignored.
- **Self-documenting starter:** the published site explains the architecture, demonstrates the GitHub integration, and includes practical guides for creating pages and publishing a fork.
- **GitHub integration demo:** the profile, public repository list, recent commits, and source-edit links reflect the GitHub account associated with the current repository.
- **Build-time data:** GitHub API requests happen during static generation; no browser-side API token is needed.
- **Defensive API handling:** account type validation, repository filtering, pagination validation, retry handling, and explicit error states.
- **Security checks:** restrictive Content Security Policy, validated GitHub image hosts, and a scan of generated text files for leaked secrets.
- **CI and deployment:** template integrity checks, content checks, Astro validation, tests, production build, output inspection, and GitHub Pages deployment.

## Quick start: fork and publish

1. **Fork this repository** to your GitHub account or organization.
2. **Rename the fork** to the repository name you want to publish. No source-wide username replacement is required.
3. Open the fork's **Settings → Pages** and choose **GitHub Actions** as the build and deployment source.
4. Check **Settings → Actions → General → Workflow permissions**. The deployment workflow assigns the minimum permissions to each job; the template-preparation job needs `contents: write` to commit a restored starter file after one has been renamed.
5. Push a commit to the repository's default branch, or start **Deploy to GitHub Pages** manually from the Actions tab. For a manual run, select the repository's default branch in **Use workflow from**. The workflow detects the default branch automatically; it does not need to be named `main`.
6. Review the default brand and the included articles in `src/content/site.json` and `src/content/blog/`; keep them as starter examples, adapt them, or replace them for your site.

For a guided tour, open **Getting Started**, **How It Works**, and **Templates** on the published site. The repository is also its own live demonstration: the repository and commit pages show data for the GitHub account associated with the running fork, while the visible site brand remains independently configurable.

### GitHub Pages URL modes

| Deployment | Configuration | Result |
|---|---|---|
| Project site | Repository is not named `OWNER.github.io` | `https://OWNER.github.io/REPOSITORY/` |
| User/organization site | Repository is named `OWNER.github.io` | `https://OWNER.github.io/` |
| Custom domain | Set `SITE_URL=https://example.org` and normally `SITE_BASE=/` | `https://example.org/` |

For a custom domain, configure the domain and DNS in GitHub Pages settings, then add the `SITE_URL` and `SITE_BASE` repository variables under **Settings → Secrets and variables → Actions → Variables**. These variables configure Astro's canonical URLs and internal routing; they do not configure DNS or the GitHub Pages domain on their own.

The owner, repository, and branch are taken from the GitHub Actions context. The workflow deploys only from the repository's default branch and follows its actual name. Rename the repository through GitHub's repository settings; the Pages URL and internal base path will then be recalculated on the next build.

## Requirements and local development

- Node.js **22.23.4 or newer**.
- npm bundled with the selected Node.js release.
- Git for the template workflow checks.

```bash
npm ci
```

No local environment file is required for a standard checkout. The project automatically reads the repository from the `origin` Git remote and the active branch from Git. In GitHub Actions, it uses the repository and branch supplied by the workflow context.

Use an optional `.env` file only for local overrides, such as a custom domain or repository filters. Copy `.env.example` only when you need those optional settings. For deployed builds, configure optional values as GitHub Actions repository variables (see below).

Start the development server:

```bash
npm run dev
```

### Environment variables

| Variable | Required locally | Description |
|---|---:|---|
| `SITE_REPOSITORY` | No | Optional override; otherwise inferred from the `origin` Git remote. |
| `SITE_OWNER` | No | Optional override; otherwise inferred from the repository owner. |
| `SITE_REF` | No | Optional override; otherwise inferred from the current Git branch. |
| `SITE_EXCLUDE_REPOS` | No | Comma-separated list of repositories to hide. |
| `SITE_INCLUDE_SITE_REPO` | No | Set to `true` to include the website repository in its own repository list. |
| `SITE_URL` | No | Custom HTTPS origin without a path, such as `https://example.org`. |
| `SITE_BASE` | No | Base path for a custom domain, normally `/`. |
| `GITHUB_SERVER_URL` | No | GitHub Enterprise Server URL when not using GitHub.com. |
| `GITHUB_API_URL` | No | API URL; for GitHub Enterprise Server this may include `/api/v3`. |

The standard repository and branch values are inferred automatically in both local Git checkouts and GitHub Actions. `.env` is ignored by Git and must never contain credentials committed to the repository.

For deployed builds, optional settings are read from GitHub Actions **repository variables**. Add only the settings you use under **Settings → Secrets and variables → Actions → Variables**:

- `SITE_URL` and `SITE_BASE` for a custom domain.
- `SITE_EXCLUDE_REPOS` for a comma-separated repository exclusion list.
- `SITE_INCLUDE_SITE_REPO` with the value `true` to include the website repository in the repository list.

Both deployment and pull-request workflows pass these variables to the build. They are configuration values, not secrets; do not put access tokens or credentials in them.

## Project structure

```text
.
├── .github/workflows/       # Pull-request checks and Pages deployment
├── scripts/                 # Navigation, template, content, and output checks
├── src/
│   ├── components/          # Reusable Astro components
│   ├── content/
│   │   ├── blog/            # Markdown posts and the hidden post starter
│   │   ├── site.json        # Brand, description, introduction, footer text
│   │   ├── nav.json         # Generated main navigation
│   │   └── footer.json      # Generated footer navigation
│   ├── layouts/             # Shared site layout
│   ├── lib/                 # GitHub API, URL, and formatting helpers
│   ├── pages/               # Website pages and hidden page starters
│   └── styles/              # Global styles and CSP-compatible assets
├── templates/               # Single source of truth for reusable starters
└── tests/                   # Local GitHub mock and automated tests
```

## Editing content

| Goal | Location |
|---|---|
| Change the brand and site introduction | `src/content/site.json` |
| Add or edit a blog post | `src/content/blog/*.md` |
| Add a top-level page | Rename `src/pages/.new-section.astro` |
| Add a feature or landing page | Rename `src/pages/.new-feature-page.astro` |
| Add a resource or collection page | Rename `src/pages/.new-resource-page.astro` |
| Add a footer page | Rename `src/pages/footer/.new-footer-section.astro` |
| Change the shared header, navigation, or footer | `src/layouts/Layout.astro` |
| Change repository filtering | Set `SITE_EXCLUDE_REPOS` and `SITE_INCLUDE_SITE_REPO` as GitHub Actions repository variables, or as local `.env` values |
| Change the page styling | `src/styles/global.css` |

### Template workflow

Templates have one source of truth in `templates/`. Their editable starter copies are:

- `src/content/blog/.new-post.md`
- `src/pages/.new-section.astro`
- `src/pages/.new-feature-page.astro`
- `src/pages/.new-resource-page.astro`
- `src/pages/footer/.new-footer-section.astro`

Rename the relevant hidden file before editing it. For example:

```text
.new-post.md                 → getting-started-with-my-project.md
.new-section.astro           → about.astro
.new-footer-section.astro    → privacy-policy.astro
```

The feature-page starter is designed for product or service explanations; the resource-page starter is useful for curated directories and collections. The template check fails if a hidden starter is edited without being renamed. When a starter is renamed, the preparation workflow restores a clean copy from `templates/` and commits that restoration to the repository's default branch. To intentionally update a starter, edit the visible copy and run:

```bash
npm run check-templates -- --update
```

`scripts/generate-nav.mjs` discovers regular root-level Astro pages and footer pages. It excludes dotfiles and underscore-prefixed files, and writes the generated navigation files only when their content changes.

## GitHub data and configuration

`src/lib/site-env.mjs` is the single validated configuration source. In Actions, the workflow sets:

- `SITE_REPOSITORY` from the current repository (`owner/repository`)
- `SITE_OWNER` from the repository owner
- `SITE_REF` from the default branch being deployed

The GitHub identity is kept separate from `src/content/site.json`, so the brand can be a personal name, organization, or project title. No default owner, repository, or branch is hardcoded.

`src/lib/github.ts` is the only module that calls the GitHub API. The profile, repositories, and commits are cached per build and shared across pages.

- The profile must match the requested login and explicitly identify as a `User` or `Organization`.
- Only public, non-fork repositories owned by the configured account are listed. The website repository is excluded unless enabled.
- Repository pagination is validated; malformed or failed later pages are not silently represented as a complete list.
- Git author and committer names are kept distinct from the GitHub account linked to a commit.
- Transient network, timeout, and server errors are retried. API problems are displayed as explicit build-time notices.
- Requests use the unauthenticated public API. No personal access token is required or forwarded by the build.

The implementation supports GitHub Enterprise through `GITHUB_SERVER_URL` and `GITHUB_API_URL`, subject to the Enterprise instance's API and image-host configuration.

## Workflows

### Pull request checks

`.github/workflows/pr.yml` runs for pull requests and uses read-only repository permissions. It installs locked dependencies, generates navigation, checks templates and content, runs Astro validation and the test suite, builds the site, and inspects the output. It does not deploy or use repository secrets.

### Deployment

`.github/workflows/deploy.yml` runs on pushes to the default branch, on a daily schedule, and through manual dispatch. It has three jobs:

1. **Template preparation** restores missing hidden starters and commits only those restored files. This job has `contents: write` and does not build the website.
2. **Build** checks out the exact prepared commit with read-only repository permissions, installs dependencies with `npm ci`, runs all checks and tests, creates the static site, and scans `dist/`.
3. **Deploy** receives the Pages deployment permissions and deploys only the artifact produced by the successful build job.

The jobs use separate permissions so the build process does not receive repository write access or a deployment token. A concurrency group serializes preparation and deployment for the same repository.

## Security notes

- `astro.config.mjs` applies a restrictive Content Security Policy. GitHub image hosts are explicitly allowlisted, and image URLs from API responses are validated centrally.
- Avoid inline `style` attributes and review the CSP before introducing third-party scripts, fonts, or images.
- The build scan checks generated HTML, JavaScript, JSON, CSS, SVG, XML, text, and source-map files for common token and private-key patterns and accidentally emitted environment values.
- The output scan is a safety net, not a replacement for keeping credentials out of source control.
- The included Legal Notice is an editable scaffold and is deliberately marked `incomplete` in the starter. It contains prompts for operator and contact information plus optional regulatory details. Replace every `[REQUIRED ...]` and `[IF APPLICABLE: ...]` prompt, remove sections that do not apply, and review the result against the rules for the operator, activity, and jurisdiction. Only then change `data-legal-status` to `complete`. The content and distribution checks reject a completed status while prompts remain. This is a completeness guard, not legal advice. The generic starter release should retain its intentionally incomplete notice.

## Tests and full verification

Tests use a local mock GitHub API and do not require network access to GitHub.

```bash
npm ci
npm run verify
```

`npm run verify` generates navigation, checks template integrity and editorial status, runs `astro check`, executes the Node test suite, creates a production build, and inspects the generated `dist/` directory.

Focused commands:

```bash
npm run generate
npm run check-templates
npm run check-content
npm run check
npm test
npm run build
node scripts/check-dist.mjs
```

Use the Node version specified in `package.json` and the committed `package-lock.json` for reproducible installs. Dependency upgrades should be reviewed and tested separately from routine content changes.

## License

Astro Pages Publisher is distributed under the MIT License. See [LICENSE](LICENSE) for details. Third-party dependencies retain their own licenses.


## Release checklist

Before publishing a fork or a maintained instance, follow the [Release Checklist](RELEASE_CHECKLIST.md). It covers GitHub Pages setup, optional Actions variables, local verification, legal-content review, and the live deployment smoke test.

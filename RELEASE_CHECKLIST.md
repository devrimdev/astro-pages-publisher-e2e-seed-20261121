# Release checklist

Use this checklist when publishing a fork of Astro Pages Publisher or preparing a new release of a maintained instance. It is intentionally separate from the automated `npm run verify` checks: successful tests confirm the project build, but they do not configure GitHub Pages, review operator-specific legal information, or verify a live deployment.

## 1. Site identity and starter content

- [ ] Confirm that the default brand in `src/content/site.json` is generic and remains independent of the GitHub account.
- [ ] Keep the default brand and four included starter articles in the reusable starter release; they are intentional demonstration content, not unfinished placeholders.
- [ ] For a fork serving a different purpose, adapt or replace the brand, introduction, and articles as appropriate.
- [ ] Fork the repository into the intended GitHub account or organization.
- [ ] Rename the fork to the repository name you intend to publish.
- [ ] Confirm the repository's default branch in GitHub. The workflows use the actual default branch; it does not have to be named `main`.
- [ ] Review the generated navigation and footer links after adding or removing pages.

## 2. Legal Notice and operator disclosures

- [ ] Keep the generic starter's `src/pages/legal.astro` marked `data-legal-status="incomplete"`; the source template intentionally contains prompts rather than invented operator details.
- [ ] Before publishing a fork as a public-facing website, replace every `[REQUIRED ...]` and `[IF APPLICABLE: ...]` prompt with verified information, and remove optional sections that do not apply.
- [ ] Check which disclosures apply to the actual operator, activity, audience, and jurisdiction; obtain qualified advice where needed.
- [ ] Remove the starter warning and change `data-legal-status` to `complete` only after the page has been reviewed. `npm run check-content` and the distribution check reject a completed status while starter prompts remain.
- [ ] Keep the Legal Notice incomplete in the generic starter release; completion is an operator-specific step for a live website.

## 3. GitHub Pages setup

- [ ] In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.
- [ ] Confirm that Actions are enabled for the repository.
- [ ] Review **Settings → Actions → General → Workflow permissions**. The template-preparation job requires `contents: write` only to restore renamed starter files; the build and pull-request jobs use read-only repository permissions.
- [ ] For a manual deployment, select the repository's default branch under **Use workflow from**.
- [ ] Confirm that the `github-pages` deployment environment is available to the workflow.

## 4. Optional GitHub Actions variables

No repository variables are required for a standard GitHub Pages project site. The owner, repository, and branch are detected automatically.

When needed, add optional values under **Settings → Secrets and variables → Actions → Variables**:

| Variable | When to set it | Example |
|---|---|---|
| `SITE_URL` | Custom HTTPS domain | `https://example.org` |
| `SITE_BASE` | Override the URL base path; normally `/` for a custom domain | `/` |
| `SITE_EXCLUDE_REPOS` | Hide selected repositories from the repository listing | `repo-one,repo-two` |
| `SITE_INCLUDE_SITE_REPO` | Include the website repository in its own listing | `true` |

These are configuration variables, not secrets. Do not put tokens, passwords, or credentials in them. For local-only overrides, use `.env`; never commit `.env`.

For a custom domain, also configure the domain in **Settings → Pages** and create the DNS records required by GitHub Pages. `SITE_URL` and `SITE_BASE` affect canonical URLs and internal routing; they do not configure the domain or DNS by themselves.

## 5. Local verification

Use the Node.js version declared by `package.json` (`engines.node`) and the committed lockfile.

```bash
npm ci
npm audit
npm run verify
```

Before release, confirm that:

- [ ] `npm ci` completes successfully.
- [ ] `npm audit` reports no known vulnerabilities, or every remaining advisory has been reviewed and documented.
- [ ] `npm run verify` exits with status `0`.
- [ ] `astro check` reports no errors, warnings, or hints.
- [ ] All automated tests pass.
- [ ] The production build completes and `scripts/check-dist.mjs` passes.
- [ ] `git diff --check` reports no whitespace errors.
- [ ] `git status` contains only intended project changes; `.env`, `node_modules/`, `.astro/`, and `dist/` are not included.

The editorial checker reports the uncustomized starter Legal Notice as intentionally incomplete. This is expected for the generic starter release. For a real public-facing fork, follow Section 2; the checkers allow `complete` only when the starter prompts and warning have been removed. Passing these checks does not establish legal compliance.

## 6. Live deployment smoke test

After the repository changes have been reviewed and published to the fork's default branch:

- [ ] Confirm the deployment workflow completes successfully in **Actions**.
- [ ] Open the Pages URL shown by the deployment and confirm the home page loads.
- [ ] Check navigation, footer links, blog posts, and the Getting Started, How It Works, and Templates pages.
- [ ] Check internal links and assets on a project-site base path (for example, `/repository-name/`) or the configured custom domain.
- [ ] Confirm repository and commit pages either show the intended account data or display a clear notice when GitHub API data is unavailable.
- [ ] Re-run the deployment after changing GitHub Actions variables or Pages/domain configuration.

## 7. Release record

Record the following with each release:

- Release/tag:
- Source commit:
- Node.js version:
- Astro version (`npm ls astro`):
- `npm audit` result:
- `npm run verify` result:
- GitHub Actions deployment run:
- Published Pages URL:
- Known limitations or follow-up work:

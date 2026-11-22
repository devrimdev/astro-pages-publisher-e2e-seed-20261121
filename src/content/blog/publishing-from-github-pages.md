---
title: "How GitHub Pages publishing works"
pubDate: 2026-11-14
description: "A tour of the validation, build, and deployment jobs used by the starter."
---

Astro Pages Publisher turns a GitHub repository into a static website. The deployment workflow takes the repository owner, repository name, and default branch from GitHub Actions, so the same source can run from a fork without editing account-specific URLs.

## The deployment pipeline

The workflow separates preparation, building, and publishing:

1. **Prepare templates.** If a hidden starter has been renamed, the preparation job restores a clean copy from `templates/`. It commits only those restoration changes to the repository's default branch.
2. **Build and verify.** The build job checks out the prepared commit, installs the exact dependency versions in `package-lock.json`, generates navigation, checks templates and content, runs Astro diagnostics and tests, builds the static site, and scans the output.
3. **Deploy the artifact.** The deployment job receives the GitHub Pages permissions and publishes the artifact produced by the successful build. It does not rebuild the site with broader permissions.

The build job is read-only. The limited repository write permission belongs to template preparation; Pages deployment permissions belong to the final deployment job.

## Project sites, user sites, and custom domains

A regular repository is published beneath `/<repository>/`. A repository named `<owner>.github.io` is published at the domain root. A custom HTTPS domain can use the optional `SITE_URL` and `SITE_BASE` settings, but the domain and DNS records must also be configured in GitHub Pages.

For a standard checkout, the owner, repository, and branch are detected automatically. Local development reads the `origin` remote and current branch; GitHub Actions supplies the deployment repository and default branch. No `.env` file or personal access token is required for the standard setup.

## Run the same checks locally

Use Node.js 22.23.4 or newer, then run:

```bash
npm ci
npm run verify
npm audit
```

A successful verification run confirms the local source and generated site. It does not configure GitHub Pages or prove that a live deployment has succeeded; follow the Release Checklist for those external checks.

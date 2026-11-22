---
title: "Fork, rename, and make the repository yours"
pubDate: 2026-11-12
description: "How repository identity, publishing URLs, and editorial branding stay independent."
---

A reusable starter should not depend on the username or repository name of its original author. Astro Pages Publisher reads the repository context at build time, so a fork can establish its own GitHub identity without a source-wide search-and-replace.

## What changes when you fork

The build derives three related values from the current environment:

- **Owner and repository:** used for GitHub profile, repository, commit, and source-edit links.
- **Branch:** used when constructing links back to the source files.
- **Site URL and base path:** used for canonical URLs and internal links on project sites, user or organization sites, and custom domains.

In GitHub Actions these values come from the repository and workflow context. In a local Git checkout the project reads the `origin` remote and the currently checked-out branch. Explicit `SITE_REPOSITORY`, `SITE_OWNER`, and `SITE_REF` values can override local detection when needed.

## What does not change automatically

The visible website brand is editorial content, not GitHub identity. Set the name, description, introduction, and footer in `src/content/site.json`. You can use a personal name, organization, product, community, or project title without changing the account that owns the repository.

For a standard project site, the public URL uses `https://OWNER.github.io/REPOSITORY/`. A repository named `OWNER.github.io` uses the domain root. A custom domain can be configured with the optional `SITE_URL` and `SITE_BASE` values; the domain and DNS must also be configured in GitHub Pages.

## A safe first-run sequence

1. Fork the repository and choose the name you want to publish.
2. Confirm the default branch and enable GitHub Pages with GitHub Actions as its source.
3. Update `src/content/site.json` to set the editorial identity.
4. Keep, adapt, or replace the included starter articles and review the navigation.
5. Run `npm ci` and `npm run verify` before deploying.

The Getting Started guide covers the repository settings and local setup in more detail.

# Contributing

Thanks for helping improve Astro Pages Publisher.

## Before opening a pull request

1. Use Node.js 22.23.4 or newer.
2. Install the exact dependencies with `npm ci`.
3. Make the smallest focused change that solves the problem.
4. Run `npm run verify` and include the relevant output in the pull request description if a check cannot run locally.
5. Update the README or the published guide when a user-facing workflow changes.

## Content and templates

- Keep every reusable template source file in `templates/` synchronized with its hidden live copy.
- Rename a hidden starter before editing it as new content.
- Do not commit `.env`, access tokens, personal access tokens, or other credentials.
- Keep GitHub identity derived from the current repository context; do not add owner- or repository-specific URLs to shared code.

## Pull requests

Describe the problem, the behavior changed, and how it was verified. UI changes should include a screenshot when practical. Changes to the deployment workflow or Content Security Policy should explain the permission or origin changes.

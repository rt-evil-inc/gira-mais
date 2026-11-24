# Gira+

Gira+ is an unofficial app for GIRA, Lisbon's bike sharing service, built with SvelteKit and Capacitor for Android and iOS.

These are defaults for coding agents. The developer you work for can override them.

## Tests

- A test must fail when the behaviour it names breaks.
- Don't test what can't break: an import being defined, a mock returning what it was told to, types, constants, copy.
- Avoid tautology.

## Comments

Default to no comment. Write one only for a reason the code can't show, such as an API or platform quirk. Don't restate the code or describe the change; that goes in the PR.

## Checks

`bunx vitest run` runs the tests, `bun run check` the type check, and `bunx eslint <changed files>` the linter. Say what you ran and what you couldn't check.

## Pull requests

- Title: what the change does, in plain language, starting with a lowercase letter. The PR titles often turn into commit messages.
- Body: a brief summary (1 or 2 sentences) explaining the reasoning for the change; a description of the changes, and how you checked it. Keep it short.
- UI changes need before and after screenshots, uploaded to the PR and not committed.
- End the body with the model and harness that did the work: `Model: Claude Opus 5.5 · Harness: Claude Code`. If you don't know the exact model, say so.

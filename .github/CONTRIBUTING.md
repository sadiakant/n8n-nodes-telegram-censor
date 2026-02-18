# Contributing

Thanks for your interest in contributing.

## Development
```bash
npm install
npm run build
```

## Guidelines
- Keep changes scoped and well-documented
- Update README or CHANGELOG when behavior changes
- Avoid adding heavy dependencies unless necessary

## Pull Requests
- Describe the problem and the solution
- Include testing steps if applicable

## Release & Publishing (Trusted Publisher)
This repo is configured for npm Trusted Publisher via GitHub Actions. A publish runs when a GitHub Release is published.

Steps:
1. Update `CHANGELOG.md` and version in `package.json`
2. Push the tag and publish a GitHub Release
3. The workflow publishes to npm with provenance

If publishing fails, verify the npm Trusted Publisher connection for this repo in the npm package settings.

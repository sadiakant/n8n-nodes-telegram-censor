# Changelog

All notable changes to this project are documented in this file.

## [3.0.1] - 2026-05-03

- Fixed: updated credential naming to `telegramCensorCredentialsApi` to resolve n8n linting errors while maintaining backwards compatibility with existing workflow credentials.

## [3.0.0] - 2026-05-03

- Breaking: migrated the package from the legacy `src/` layout and custom TypeScript build into the `@n8n/node-cli` community-node structure using root-level `credentials/`, `models/`, and `nodes/` directories.
- Breaking: switched package management and CI from `pnpm` to `npm`, including `npm ci`, npm caching in GitHub Actions, and `package-lock.json` as the tracked lockfile.
- Breaking: replaced the Telegram client dependency from `telegram` to `teleproto`, including credential validation via `getMe()` and updated external authorization documentation.
- Added: new message operations for `Send Message` and `Replace Text`, alongside the existing `Get Messages` and `Replace Image` flows.
- Added: cleaner `Download Media` routing with separate success and "No Media" outputs for easier workflow branching.
- Changed: simplified ESLint and release tooling to use the n8n CLI defaults, plus updated publish logic for `latest` and timestamped `dev` releases.
- Changed: updated project assets and documentation links to use the new local banner assets and the shared GramPro authorization guide.

## [2.0.4] - 2026-02-19

- Internal maintenance and stability improvements.

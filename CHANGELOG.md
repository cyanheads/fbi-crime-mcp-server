# Changelog

All notable changes to this project. Each entry links to its full per-version file in [changelog/](changelog/).

## [0.1.6](changelog/0.1.x/0.1.6.md) — 2026-06-19

Adopt @cyanheads/mcp-ts-core ^0.10.8 (canvas SQL invalid_sql classification, DuckdbProvider.describe() filter fix, ctx.content collector, fresh-scaffold devcheck guards, biome 2.5); re-sync devcheck scripts and skills; @types/node ^26

## [0.1.5](changelog/0.1.x/0.1.5.md) — 2026-06-19

Fix fbi_get_leoka SerializationError on every call (nested deaths_by_region); point server instructions at active tools only and mark decommissioned resources UNAVAILABLE

## [0.1.4](changelog/0.1.x/0.1.4.md) — 2026-06-12

Adopt mcp-ts-core ^0.10.6 — explicit server identity, ValidationError codes; wire FBI_API_KEY into bundle/registry metadata; Docker version label + healthcheck

## [0.1.3](changelog/0.1.x/0.1.3.md) — 2026-05-26

Package metadata alignment, scripts migrated to bun run, Docker image published to GHCR

## [0.1.2](changelog/0.1.x/0.1.2.md) — 2026-05-25

Add mcpName field and publish-mcp script for MCP Registry registration.

## [0.1.1](changelog/0.1.x/0.1.1.md) — 2026-05-25

UCR backend decommissioned — 8 tools return ServiceUnavailable; 4 CDE tools (crime estimates, agency offenses, LEOKA, arson redirect) remain active.

## [0.1.0](changelog/0.1.x/0.1.0.md) — 2026-05-25

Initial design — 12 tools, 2 resources covering UCR crime estimates, NIBRS breakdowns, hate crimes, arrests, LEOKA, human trafficking, arson, and agency participation.

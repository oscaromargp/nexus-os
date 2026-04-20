# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-15

### Added
- **Unified Parser v2.0:** Support for `#gasto`, `#tarea`, `#nota`, `#idea` extraction, and Eisenhower Matrix handling (`#urgente` -> high priority).
- **Situational Integration (Baja Edge):** Real-time overlay in the dashboard fetching Climate (La Paz, BCS via Open-Meteo) and Crypto pairs (BTC, USDT via CoinGecko).
- **Dynamic Mentions:** Automatic extraction of `@contact` and auto-generation of `#persona` nodes to establish relational database mappings.
- **Financial Auto-Detection:** Symbols (+ / -) directly parsing to income or expense amounts with automatic ledger updates.

### Changed
- **Database Schema Refactor:** Migrated from `nexus_nodos` to standard `nodes`; consolidated `user_id` to `owner_id`; changed schema architecture to rely heavily on dynamic JSONB tags extraction.

## [1.0.0] - 2026-04-15

### Added
- Major dashboard upgrade and integrated legal pages (Terms/Privacy).
- Premium dark luxury landing page redesign.
- MVP V1 features: Kanban, Finance tracking, Notes functionality, and a professional README.
- V1 Nexus OS initialization with Landing page, Authentication, and Core Node System.

### Fixed
- Added Vite multi-page configuration to correctly route `app.html` to `/app`.

### Changed
- Configured Vercel deployment, updated CSS import order, and resolved Tailwind content paths.

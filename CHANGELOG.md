# Changelog

All notable changes to the "osprey-api-tester" extension will be documented in this file.

## [0.0.5] - 2026-01-15
### Fixed
- Missing persistence of query, params and auth

## [0.0.4] - 2026-01-15
### Added
- **UI Redesign**: Major update to the Request Panel interface for a better user experience.
- **Intelligent JSON Snippets**: The body editor now uses Monaco snippets, allowing navigation between values using `Tab` and `Shift+Tab`.
- **Base URL Persistence**: Automatically saves the Base URL to workspace settings when modified in the panel.
- **Resizable Response Panel**: The response section can now be resized vertically for better visibility.
- **Query Parameter Badge**: precise notification "!" added to the Query tab when parameters are present.
- **Custom Icon Support**: The Osprey logo is now correctly displayed in the Request Panel header.

### Fixed
- **Query Parameter Display**: Resolved an issue where query parameters were displayed as `[object Object]` in the UI.
- **Request Sending**: Fixed logic to correctly gather values from the new query parameter inputs.

## [0.0.3] - 2026-01-14
### Added
- **Performance Optimization**: Replaced heavy AST parsing with fast regex scanning for initial discovery, significantly speeding up load times.
- **CodeLens & CodeAction**: Added "Test this Endpoint" actions directly in the editor for quick access.

### Fixed
- **Race Condition**: Fixed a bug where the payload was sometimes missed when opening the panel for the first time.

## [0.0.2] - 2026-01-10
### Added
- **Tree View**: Added a dedicated "Routes NestJS" view in the activity bar to explore all detected endpoints.
- **Method Coloring**: HTTP methods (GET, POST, etc.) are now color-coded for better readability.

## [0.0.1] - 2026-01-05
### Initial Release
- **Core Analysis**: Basic AST analysis using `ts-morph` to detect NestJS controllers and DTOs.
- **Request Panel**: Initial implementation of the webview panel for sending HTTP requests.
- **Payload Generation**: Basic skeleton generation for request bodies based on DTO classes.

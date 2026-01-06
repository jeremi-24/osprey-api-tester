# Osprey API Tester



[![License](https://img.shields.io/github/license/jeremi-24/osprey-api-tester)](https://github.com/jeremi-24/osprey-api-tester)

API testing inside VS Code, based on NestJS source code analysis.

## What it does
- Scans NestJS controllers to list available routes
- Generates request URLs from decorators
- Generates JSON bodies from DTO classes
- Sends HTTP requests directly from VS Code

## How it works
- Uses TypeScript AST (ts-morph)
- No runtime dependency on the running server
- No manual configuration

## Usage
1. Open a NestJS controller
2. Click "Test Endpoint" above a route
3. Review the generated request
4. Send

## Limitations
- NestJS only
- TypeScript projects
- DTO decorators must be explicit

## Status
Early version. Breaking changes possible.

---
**Repository:** [github.com/jeremi-24/osprey-api-tester](https://github.com/jeremi-24/osprey-api-tester)
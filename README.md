# Signify — Making the Sign Bold

Professional, modular React + Vite starter focused on accessible UI components and fast development.

## Table of Contents

- Project Overview
- Key Features
- Tech Stack
- Quick Start
- Scripts
- Project Structure
- Development
- Testing
- Contributing
- License

## Project Overview

Signify is a performant frontend starter built with Vite, TypeScript, and React. It provides a curated set of accessible UI components, routing, and utilities designed for building modern web applications with high-quality developer DX.

This repository contains reusable UI primitives (Radix + Tailwind-based components), routing powered by TanStack Router, and tooling for linting, formatting, and testing.

## Key Features

- Collection of reusable, accessible UI components
- TypeScript-first codebase
- Vite for fast dev server and builds
- TanStack Router for flexible routing
- Preconfigured linting, formatting, and testing (Vitest)

## Tech Stack

- Runtime: React 19
- Bundler / Dev server: Vite
- Language: TypeScript
- UI primitives: Radix UI, Tailwind CSS
- Routing: @tanstack/react-router
- Testing: Vitest
- Linting / Formatting: ESLint, Prettier

## Quick Start

Prerequisites:

- Node.js 18+ (or compatible)
- npm (or bun/pnpm if you prefer; package scripts use npm by default)

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

Run tests:

```bash
npm run test
```

Format code:

```bash
npm run format
```

Lint:

```bash
npm run lint
```

Typecheck:

```bash
npm run typecheck
```

CI (repository includes a `ci` script that uses `bun`):

```bash
npm run ci
```

## Scripts

Key NPM scripts are defined in `package.json`:

- `dev` — start Vite dev server
- `build` — produce production build
- `preview` — locally preview production build
- `test` — run unit tests with Vitest
- `lint` — run ESLint
- `format` — run Prettier
- `typecheck` — run TypeScript checks

## Project Structure

Top-level layout (selected files and folders):

- `src/` — application source
  - `components/` — UI components and primitives
    - `ui/` — atomic and compound UI components (buttons, inputs, dialogs, etc.)
  - `hooks/` — custom React hooks (e.g., `use-mobile.tsx`)
  - `lib/` — utilities, API helpers, processors, and tests
  - `routes/` — route components and route tree
  - `router.tsx` — app router setup
  - `main.tsx`, `index.html` — client bootstrap and SPA entry shell
  - `styles.css` — global styles
- `public/` — static assets
- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` — tooling configs

Note: The `components/ui/` directory contains many small UI primitives designed for composition — examine those files when building UI.

## Development Notes

- Follow existing component patterns (composition over configuration).
- Keep components small, accessible, and well-typed.
- Use the `lib/` utilities for shared logic and to centralize cross-cutting concerns (error handling, uploads, processors).

## Testing

Unit tests are run with Vitest. Example commands:

```bash
npm run test
npm run test:watch
npm run test:perf
```

## Contributing

- Fork the repository and open a pull request with a clear description of changes.
- Run `npm run lint` and `npm run test` before submitting changes.
- Keep commits focused and add small, reviewable changes.

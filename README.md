# AI-Cade POC

[![Version](https://img.shields.io/badge/version-0.0.0-4c6ef5)](https://github.com/jdholst/aicade-poc/releases)
[![Vercel](https://img.shields.io/badge/vercel-READY-00A95C?logo=vercel)](https://ai-cade.vercel.app)
[![Notion](https://img.shields.io/badge/Notion-Project%20Overview-black?logo=notion)](https://www.notion.so/34f9db009ee581c8b820e44bd9966fd8)

AI-Cade is the first proof of concept for Sparkline's AI-native game creation workflow. This repo focuses on the first core magic moment: type a game idea, generate a starter project with AI, and immediately play it inside an editor.

This is a real product POC, not a generic scaffold. It already includes prompt-to-project generation, a structured generated game pack contract, server-side validation, and a sandboxed runtime host for playing generated games inside the app.

## Links

- Live app: [ai-cade.vercel.app](https://ai-cade.vercel.app)
- Notion overview: [Sparkline / Project Overview](https://www.notion.so/34f9db009ee581c8b820e44bd9966fd8)
- Architecture context: [CONTEXT.md](./CONTEXT.md)
- POC implementation plan: [docs/architecture/poc-implementation-plan.md](./docs/architecture/poc-implementation-plan.md)

## What This Repo Proves

AI-Cade exists to validate the creation engine behind Sparkline before the broader community platform is built.

Today, this repo is proving that Sparkline can:

- accept a natural language game prompt
- generate a starter game project through the OpenAI Responses API
- return a structured game pack instead of a loose code blob
- validate generated output before it reaches the client runtime
- run generated games inside an isolated iframe host
- show a live editor experience with generation progress, runtime status, controls, and regeneration

Just as importantly, it helps test the shape of Sparkline's future architecture: game packs, structured specs, validation, repairability, runtime isolation, and eventual migration to a more durable template-driven runtime model.

## Current Scope

The current POC includes:

- Prompt entry flow on the homepage
- Editor shell with chat/log panel and live game view
- OpenAI-backed starter game generation
- Structured generated game packs containing:
  - project metadata
  - manifest
  - controls
  - editor metadata
  - editable JSON spec
  - generated TypeScript source
- Server-side schema validation and TypeScript transpilation
- Static checks against unsafe generated source patterns
- Sandboxed Canvas 2D runtime hosted in an iframe
- Runtime controls for reset and pause/resume
- Regeneration flow when a generated game fails

Out of scope for this repo version:

- full Sparkline publishing and remix flows
- durable project persistence and checkpoints
- community feed and creator profiles
- moderation systems
- export bundles
- Phaser-first runtime migration

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Zod
- OpenAI Responses API

## How It Works

The current generation path looks like this:

1. A user enters a game idea.
2. The app sends the prompt to `/api/starter-project`.
3. The server calls the OpenAI Responses API with a strict tool contract.
4. OpenAI returns a structured generated game pack.
5. The server validates the shape, parses the editable spec, transpiles the generated TypeScript, and rejects unsafe output.
6. The client mounts the generated game inside a sandboxed iframe.
7. The editor shows the prompt, generation log, manifest, controls, and runtime state alongside the live game.

Right now the runtime target is a constrained Canvas 2D path. The long-term Sparkline plan is broader, but this narrower runtime keeps the POC focused on generation quality, contract safety, and time-to-first-play.

## Getting Started

### Prerequisites

- Node.js 24.x is recommended
- npm

### Install

```bash
git clone https://github.com/jdholst/aicade-poc.git
cd aicade-poc
npm install
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

AI-Cade supports a few ways to provide model access.

### Option 1: Set environment variables

Create a `.env.local` file:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
```

### Option 2: Enter credentials in the UI

If `OPENAI_API_KEY` is not set in the environment, the app will ask for:

- an OpenAI API key, or
- a keyword that maps to a configured server-side key

### Optional keyword-based access

You can map a keyword to an API key with environment variables like:

```bash
KEYWORD_DEMO=sk-...
KEYWORD_INTERNAL_TEST=sk-...
```

If a user enters `demo` in the keyword field, the app resolves it to `KEYWORD_DEMO`.

### Supported model configuration

If `OPENAI_MODEL` is not set in the environment, the UI allows selecting from the supported model list in the app. If it is set, that environment value becomes the active model.

## Available Scripts

- `npm run dev` - start the local development server
- `npm run build` - create a production build
- `npm run start` - run the production server
- `npm run lint` - run ESLint

## Repository Guide

- [`src/app`](./src/app) - Next.js routes and layout
- [`src/components`](./src/components) - UI and runtime host components
- [`src/hooks`](./src/hooks) - editor session and generation orchestration
- [`src/service/starter-project`](./src/service/starter-project) - generation pipeline, schemas, contracts, and OpenAI integration
- [`src/constants.ts`](./src/constants.ts) - runtime and generation constants
- [`CONTEXT.md`](./CONTEXT.md) - long-term Sparkline architecture context
- [`docs/architecture/poc-implementation-plan.md`](./docs/architecture/poc-implementation-plan.md) - build sequence for the POC

## Status

This repo is the first official AI-Cade POC release line and is currently versioned as `0.0.0`.

It should be read as:

- a working proving ground for Sparkline's AI-assisted game creation loop
- a narrow, intentional POC rather than the final product architecture
- a place to validate contracts, runtime boundaries, and generation behavior before Sparkline v1

## Roadmap Direction

The next major architectural direction discussed for Sparkline includes:

- evolving generated output toward a durable Game Pack model
- introducing stronger validation and repair loops
- adding lightweight project persistence and checkpoints
- moving toward a more structured template-driven runtime path
- eventually migrating from the current Canvas-first POC toward the future Phaser-oriented Sparkline runtime plan

## License

No license has been added to this repository yet.

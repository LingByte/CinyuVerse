# Cinyuverse

<p align="center">
  English · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <strong>AI Native Novel Creation Platform</strong><br />
  Multi-agent writing workflows with local-first ownership.
</p>

<p align="center">
  <a href="https://cinyuverse.com"><img src="https://img.shields.io/badge/Website-cinyuverse.com-111111?style=flat-square" alt="Official website" /></a>
  <a href="https://github.com/LingByte/CinyuVerse/releases/latest"><img src="https://img.shields.io/badge/Download-Latest_Release-111111?style=flat-square" alt="Download latest release" /></a>
  <img src="https://img.shields.io/badge/Desktop-macOS_%7C_Windows_%7C_Linux-111111?style=flat-square" alt="Desktop platforms" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Apache--2.0-111111?style=flat-square" alt="Apache 2.0 License" /></a>
</p>

<p align="center">
  <a href="https://cinyuverse.com">Website</a> ·
  <a href="https://cinyuverse.com/docs">Docs</a> ·
  <a href="https://github.com/LingByte/CinyuVerse/releases/latest">Download</a>
</p>

Cinyuverse is an AI-native novel creation platform. It coordinates multiple writing agents — planner, writer, auditor, reviser, character designer — through structured workflows, while keeping every file, conversation, and metadata artifact on the machine you control.

## Why Cinyuverse

Writing a novel with a single coding agent produces a mess. The agent edits files but has no concept of foreshadowing pools, character arcs, timeline continuity, or chapter rhythm. Cinyuverse fixes this by giving agents a domain-specific workspace and structured handoffs.

### What agents see

When a project is created, Cinyuverse scaffolds a `.cinyuverse/` metadata directory:

```text
.cinyuverse/
  CLAUDE.md             — writing conventions (auto-read by ACP agents)
  project.json          — book info (title, genre, target words)
  outline.md            — volume/chapter outline
  world-view.md         — world-building document
  writing-rules.md      — tone, POV, banned words
  hooks.md              — foreshadowing pool (open / progressing / resolved)
  current-state.md      — runtime world facts
  chapter-summaries.md  — rolling chapter summaries
  style-sample.md       — style reference text
  characters/           — one .md per character card
chapters/               — chapter prose (chapter-NN.md)
```

Agents read these files to gain context and write results back to the correct locations. No prompt engineering required from the author — the workspace IS the context.

### Writing workflows

Cinyuverse ships 14 prompt templates that drive agents through the full novel creation lifecycle:

| Phase | Templates | What happens |
| --- | --- | --- |
| **Foundation** | `init-foundation`, `revise-foundation` | Generate story bible, volume outline, writing rules, initial hooks |
| **Chapter** | `plan-chapter`, `write-chapter`, `update-state` | Plan memo → write prose → update summaries/hooks/state |
| **Review** | `audit-chapter`, `revise-chapter` | 8-dimension audit → targeted revision |
| **Character** | `create-character`, `refine-character` | Generate and refine character cards |
| **Worldbuilding** | `expand-world-view`, `add-glossary` | Deepen world settings, add glossary entries |
| **Tools** | `continuity-check`, `writing-stats`, `export-prep` | Full-book consistency, word counts, export preparation |

Each template is a pure function that builds a structured prompt telling the agent which files to read, what to do, and where to write the result.

### Multi-agent collaboration

Agents collaborate through delegation and graph workflows:

- **Delegation:** A parent agent hands work to another enabled agent during a conversation. Child conversations have their own timeline and turns.
- **Graph Workflow:** Steps and dependencies are described as a JSON DAG, then executed. Source files can live in Git. A published definition version is immutable.
- **Automation:** A manual action or a schedule starts an ordinary turn, or a published Workflow version.

Use delegation for a one-off review chain (plan → write → audit → revise). Write a Graph when the flow must be reused, versioned, and started on a schedule.

## Capabilities

### ACP-native agent runtime

Cinyuverse connects to coding agents through the [Agent Client Protocol (ACP)](https://agentclientprotocol.com/). Built-in agents include Claude Code, Codex, DeepSeek Harness, Cursor, OpenCode, and more. Compatible agents from the official ACP Registry use the same pipeline.

The agent runtime manages live connections, sessions, prompts, permissions, terminals, MCP/skills/config surfaces, and conversation streaming. Conversations are event-sourced and render as a timeline.

### Local-first ownership

Projects, conversations, configuration, and diagnostics stay on the host you control. Cinyuverse does not operate cloud storage and does not automatically upload data to a Cinyuverse-operated service.

> [!IMPORTANT]
> Cinyuverse is in active development. Use version control, keep backups, and review agent-generated changes before committing.

### Rust + Tauri architecture

The desktop shell is Tauri 2. Domain logic lives in Rust crates. The UI is React and TypeScript. Desktop commands, web routes, and remote adapters call the same Application Core.

```text
frontend/        React + TypeScript + Vite user interface
src-tauri/       Tauri desktop shell, system integration, and IPC commands
crates/          Agents, conversations, Git, plugins, automations, and services
packages/        Plugin SDK and CLI
shared/          TypeScript types generated from Rust
```

### Plugin ecosystem

A Cinyuverse plugin is an installable, toggleable, configurable product unit. One package can contribute to the UI, agents, the host, and runtimes. Official bundled plugins cover session extras, multi-agent delegation, workflow authoring, Office previews, and plugin development.

## Download and installation

Desktop installers come from [GitHub Releases](https://github.com/LingByte/CinyuVerse/releases/latest).

| Platform | Baseline | Architecture | Package |
| --- | --- | --- | --- |
| macOS | macOS 12 or later | Intel / Apple Silicon | `.dmg` |
| Windows | Windows 10 / 11 | x64 / ARM64 | `.exe` / `.msi` |
| Linux | Ubuntu 22.04 equivalent | x64 / ARM64 | `.AppImage` / `.deb` |

First launch runs onboarding, probes local agent runtimes, and asks for enabled agents and a default agent. Missing managed components install in the background.

## Development

### Prerequisites

- Node.js 22 and pnpm 10.x
- Rust nightly, pinned in `rust-toolchain.toml`
- The [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform
- At least one agent CLI for integration testing

### Commands

```bash
pnpm install
pnpm run dev          # launch desktop app with HMR
pnpm run check        # tsc --noEmit + cargo check
pnpm run lint         # eslint + clippy
pnpm run format       # cargo fmt + prettier
cd frontend && pnpm test
cargo test --workspace
pnpm run tauri:build
```

`pnpm run dev` starts the React / Vite frontend, the Tauri desktop shell, and the Rust services. Run `pnpm run generate-types` after changing shared Rust types. Run `pnpm run prepare-db` after changing SQL queries or migrations.

## Acknowledgements

Cinyuverse agent ingress is built on the [Agent Client Protocol](https://agentclientprotocol.com/). Built-in agents and Registry agents enter the same install, authentication, conversation, and delivery pipeline through ACP.

Cinyuverse is licensed under the [Apache License 2.0](./LICENSE).

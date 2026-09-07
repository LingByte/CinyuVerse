---
summary: Create, inspect, debug, and safely revise Cinyuverse DAG Workflows from Agent conversations and editable file tabs.
---

# Cinyuverse Workflow Creator

Workflow Creator adds three connected capabilities:

- the `cinyuverse-workflow-creator` Skill for designing valid DAGs;
- a dedicated MCP server for validation, publication, Run inspection, checkpoints, node conversations, and derived debug Runs;
- a visual editor for `*.cinyuverse-workflow.json` files in Cinyuverse tabs.

The Workflow source file remains the authoring source of truth. Saving uses an artifact revision and refuses stale overwrites. Publishing creates an immutable version; existing Automation references do not move until explicitly updated.

## Requirements

Cinyuverse Desktop must be running. The Host starts a loopback-only `cinyuverse-server` command gateway, launches the MCP with its managed Node.js runtime, and injects a per-app-lifetime bearer token. The token is never stored in this package or `config.json`.

The Skill and MCP are bound to all compatible installed Agents on first enable. Change the selection from this plugin’s settings or Settings → MCP. Later enable/disable cycles preserve an existing selection.

## Debugging model

A node Conversation may contain multiple immutable Turns. Stopping a node pauses only its active Turn; continuing creates a new Turn in the same Conversation. Pausing the DAG stops every active Turn without marking the Run failed. A source test uses an unpublished durable debug snapshot, so it never creates a catalog version or retargets an Automation. A derived debug Run reuses unchanged completed ancestors and reruns the selected node alone or with its transitive downstream.

## Offline and data flow

The editor itself is local and requires no network. Agent Steps may use network access according to the selected Agent and project policy. MCP traffic stays on a random loopback port between the managed MCP process and Cinyuverse.

## Troubleshooting

- If MCP tools report that Cinyuverse is unavailable, keep Desktop open and re-enable the plugin.
- A save conflict means the source changed outside the tab; reload, reconcile, and save again.
- A Workflow Automation is pinned to one published version. Publish and apply a new version to move that Automation.

## Development

This package lives in the Cinyuverse monorepo as the Host-family Workflow MCP
(`cinyuverse-workflow-mcp`). It was migrated from the standalone
`~/Projects/vibe-workflow-creator` project. The Host sibling binary in
`crates/cinyuverse-workflow-mcp` launches the bundled `dist/mcp/workflow-control.mjs`
with Node. The checked-in `vendor/` archives pin the Cinyuverse Plugin SDK and CLI
used for reproducible local builds; product code imports only SDK entrypoints
and the official MCP v2 packages.

```sh
pnpm install
pnpm test
pnpm test:mcp
pnpm build
pnpm exec cinyuverse-plugin validate .
pnpm exec cinyuverse-plugin pack . --output cinyuverse-workflow-creator-1.0.0.vxp
```

For a live Host verification, enable this plugin in Cinyuverse first so Cinyuverse adds
its managed MCP entry to Codex. Then run `pnpm test:live status <run-id>` or
`pnpm test:live debug-source <workspace-id> <step-id>`. Set
`CINYUVERSE_WORKSPACE_ROOT` when the MCP should resolve project-relative Workflow
sources against another workspace.

## Third-party notices

This package uses the Cinyuverse Plugin SDK, the official Model Context Protocol TypeScript SDK v2,
and the Host-managed Node.js runtime.

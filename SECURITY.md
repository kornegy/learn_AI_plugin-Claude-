# Security policy

## Supported versions

Only the latest released version receives security fixes during the 0.x series.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through
[GitHub security advisories](https://github.com/kornegy/learn_AI_plugin-Claude-/security/advisories/new).
Include the version, the surface (Claude Code, Cowork, chat), steps to reproduce and the impact.
Don't include real personal learning data.

You will get an acknowledgement within 7 days. Fixes are released as soon as practical, and the
reporter is credited unless they prefer not to be.

## Scope

In scope:

- Reading or writing outside the data root (path traversal, symlinks)
- Loss or corruption of learning data through the plugin's own operations
- Deletion without the two-step confirmation
- Secrets being stored despite the secret filter
- Prompt injection through saved sources, learner files or the learner card that makes the plugin
  perform destructive or unintended actions
- Any network access or data exfiltration by the plugin's code

Out of scope: vulnerabilities in Claude, Claude Code or Cowork themselves (report those to
Anthropic), and the model occasionally not following teaching rules (please use the "Teaching
behaviour feedback" issue template).

## Design safeguards

See [docs/ARCHITECTURE.md §12](docs/ARCHITECTURE.md) for the threat model:
- the server builds every path from validated ids and checks containment;
- writes are atomic and locked;
- deletion takes two steps and goes to trash by default;
- web research runs in a read-only subagent;
- there is no network code in the server.

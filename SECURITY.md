# Security policy

## Supported versions

Security fixes are provided for the latest LocalSubs release. Users should
upgrade to the newest available version before reporting a problem.

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/aiden1020/localsubs/security/advisories/new).
Do not open a public issue for a vulnerability that could put users at risk.
Include the affected version, operating system, reproduction steps, and impact
when possible.

Release archives include SHA-256 checksums. GitHub release builds also receive
a provenance attestation that can be checked with:

```bash
gh attestation verify <artifact> --repo aiden1020/localsubs
```

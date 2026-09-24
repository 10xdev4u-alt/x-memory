# Supported X access boundary

Status: accepted for the recovery program; dependent R3 implementation is blocked until an official-API migration is approved.

## Decision

Use the official X API as the only supported production boundary for X data and actions. The extension may use an ordinary user-authenticated browser session only as a user-controlled transport for an officially supported endpoint. It must not discover private GraphQL operation IDs, extract bearer material from page bundles, or call private X interfaces as a product feature.

The current implementation does not meet this boundary. `src/content/x-session.ts` scans webpack chunks, `src/lib/healer.ts` extracts bearer material, and `src/lib/session-client.ts` calls private GraphQL operations. Those paths remain evidence of the gap; they are not approved production behavior and must be removed or replaced before release.

## Options considered

| Option | Capability | Permission and privacy | Maintenance and terms | Decision |
|---|---|---|---|---|
| Official X API | Publicly documented endpoints, explicit access plans, credentials, quotas, and display obligations | Requires X developer enrollment, scoped credentials, and clear retention controls | Contracted and versioned API surface; usage and pricing can change | Chosen |
| User-authorized browser session | Acts through a session the user controls, without storing a developer credential | Requires the user to open X; session and CSRF material remain sensitive and stay local | Depends on page behavior and approved endpoint availability; still requires a documented permission boundary | Allowed only for officially supported flows |
| Private interface | Current webpack discovery, bearer extraction, CSRF forwarding, and private GraphQL calls | Copies session material and relies on page internals; unclear user consent and retention boundary | Breaks without notice and is prohibited as an unsupported workaround | Rejected |

## Consequences

- Official API credentials are never placed in the extension bundle, page scripts, logs, backups, or local storage.
- The extension requests only the scopes and endpoints needed for the chosen feature and displays the current X access limitation instead of claiming unavailable sync or Grok behavior.
- The product must use documented rate limits, retention, deletion, and display requirements from the X Developer Agreement and incorporated policies.
- A platform or pricing change can reopen this decision. Reopen #173 before changing the boundary.

## Threat model

The boundary protects against credential leakage, unauthorized private-interface access, opaque retention, and unsupported automation. Browser-session data is treated as secret even when it remains on-device. Logs, exports, backups, and error messages must not contain bearer or CSRF values.

## User-visible limitation

Until official endpoints and credentials are configured, X sync, private mutations, and Grok actions are unavailable and must be reported as unavailable. The extension must not silently fall back to private interfaces.

## Sources

- https://developer.x.com/en/docs/x-api
- https://developer.x.com/en/developer-terms/agreement-and-policy
- https://developer.x.com/en/developer-terms/agreement
- https://developer.x.com/en/docs/api-reference-index

## Reopen conditions

Reopen this decision when X changes the Developer Agreement, API access plans, endpoint availability, or the user's approved permission model.

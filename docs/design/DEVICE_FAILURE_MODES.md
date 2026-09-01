# Design: Failure Modes on Subject Device

## Problem
Uninstall, offline, factory reset, new device, roaming, dead battery. Currently: `SelfTamperReceiver` + `RuntimeIntegrityChecker` stubs. Undefined: coverage-continuity rules.

## Events (from Android)
| Event | Detection | Server action |
|---|---|---|
| Uninstall | `ACTION_PACKAGE_FULLY_REMOVED` best-effort tamper POST | Mark `device.status=UNINSTALLED`; if authorization ACTIVE → bail-violation notice to case officer + court |
| Offline > threshold | Heartbeat cron server-side | `device.status=STALE`; alert case officer at 24h/72h/7d |
| Factory reset | Fresh install with same deviceId but new Keystore key | Reject uploads (public key mismatch); require re-enrollment ceremony |
| New device (subject buys phone) | New device enrollment request | Require judicial amendment (adapter method) unless warrant scope names subject (not specific device) |
| Roaming (cross-jurisdiction) | Device timezone / SIM MCC shift | Alert oversight; may require MLA path |
| Dead battery near expiry | Last heartbeat vs. expiresOn | Log as `COVERAGE_GAP` audit event |

## Coverage-continuity rules

### Warrant scope: subject-based (default IN, UK)
- Any device the subject enrolls is covered.
- Enrollment requires officer approval + audit entry.

### Warrant scope: device-specific (US §2518 particularity)
- New device = new authorization required.
- Existing warrant does NOT auto-extend to new devices.

Adapter method:
```ts
warrantAppliesToNewDevice(auth, subject, newDevice): boolean
```
- IN: true if subject.id ∈ auth.subjects
- US: false (§2518(1)(b)(ii) requires particular facilities)
- UK: configurable per warrant (IPA §15 allows either mode)

## New entities
```
device_lifecycle_event
├─ id
├─ device_id
├─ kind (UNINSTALL | OFFLINE_24H | OFFLINE_72H | OFFLINE_7D | FACTORY_RESET | ROAMING | COVERAGE_GAP)
├─ occurredAt
├─ evidencePayloadHash (for the tamper POST body, if any)
└─ handledBy (Officer FK, nullable)
```

## Cron
`detect_coverage_gaps()` runs every 5 min:
- For each ACTIVE session, check last heartbeat.
- Emit `device_lifecycle_event` if crosses threshold.

## Bail-violation channel
When `device.status = UNINSTALLED` while authorization is ACTIVE AND type = BAIL_CONDITION → auto-notify the issuing court (out-of-band form + `subject_notification` row).

## Reuse
- Reuses `SelfTamperReceiver` + `RuntimeIntegrityChecker` (already on Android).
- Reuses `p_append_audit`.
- Reuses `subject_notification` from notification design.

## TODO tags
- `TODO(HEARTBEAT-CRON)`
- `TODO(BAIL-VIOLATION-COURT-CHANNEL)`
- `TODO(RE-ENROLLMENT-CEREMONY)` — factory-reset recovery.
- `TODO(CROSS-JURISDICTION-ROAMING-MLA)`

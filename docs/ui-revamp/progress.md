# UI Revamp — Progress Ledger

Branch: `feature/ui-revamp` (off main 2f42202). Design spec: `design-language.md`.
Decisions: subagent-driven phase-by-phase; Citizen = responsive desktop sidebar + mobile bottom-nav/drawer; Admin 10 placeholder modules kept in nav with polished "not available yet" states. NO business-logic/API/scope/lifecycle changes. Preserve all data-testids + i18n parity. Do not merge to main w/o approval.

## Rule per unit: restyle only (keep component public APIs, exports, data-testids, routes, behavior). All new strings → en+ml. Run app tests + build green before marking done.

## Phase 2 — Design foundation
- [ ] P2a: token refinement + restyle existing @pg/ui primitives (Button, Input, OtpInput, Card, Alert, StatusBadge, PriorityBadge, EmptyState, LoadingState, ErrorState, ForbiddenState, Skeleton, Toast) — keep APIs/testids/tests green.
- [ ] P2b: new shared components (PageHeader, StatCard, Table[responsive→cards], SidebarNav/NavItem, Avatar, SearchInput/Select, Tabs, Dialog as needed) + iconography.

## Phase 3 — Citizen (11 screens + shell)
- [ ] Shell: responsive layout (desktop sidebar + top bar; mobile AppHeader+BottomNav/drawer)
- [ ] Landing `/`  - [ ] /login  - [ ] /verify  - [ ] /register  - [ ] /track
- [ ] /home (overview, real counts)  - [ ] /issues (dashboard)  - [ ] /issues/[id] (detail+timeline)
- [ ] /report (wizard)  - [ ] /notifications  - [ ] /profile (+logout)

## Phase 4 — Admin (6 functional + 10 placeholders + shell)
- [ ] Shell: sidebar + drawer + top bar refresh
- [ ] /login  - [ ] /verify  - [ ] / (dashboard, real scoped counts)
- [ ] /issues (triage table)  - [ ] /issues/[id] (detail + transition)  - [ ] /notifications
- [ ] 10 placeholder modules → polished "not available yet" state (audit-logs, categories, citizens, coordinators, escalations, panchayats, reports, representatives, settings, wards)

## Phase 5 — Responsive + quality
- [ ] desktop/tablet/mobile passes  - [ ] states audit  - [ ] a11y + en/ml  - [ ] full gate (lint/typecheck/test/build) + both Playwright suites

## Log
(append per-unit results here)

# UI Revamp — Progress Ledger

Branch: `feature/ui-revamp` (off main 2f42202). Design spec: `design-language.md`.
Decisions: subagent-driven phase-by-phase; Citizen = responsive desktop sidebar + mobile bottom-nav/drawer; Admin 10 placeholder modules kept in nav with polished "not available yet" states. NO business-logic/API/scope/lifecycle changes. Preserve all data-testids + i18n parity. Do not merge to main w/o approval.

## Rule per unit: restyle only (keep component public APIs, exports, data-testids, routes, behavior). All new strings → en+ml. Run app tests + build green before marking done.

## Phase 2 — Design foundation
- [x] P2a DONE (commit 3bb5792): added additive `surface` token alias; restyled 12 primitives (Button/Input/OtpInput/Card/Alert/StatusBadge/PriorityBadge/EmptyState/ErrorState/ForbiddenState/Toast/Skeleton). NO API/export/testid changes (verified via diff grep). @pg/ui 41, citizen 89, admin 64, both builds, tsc, eslint all green. No test assertions weakened.
- [x] P2b-1 DONE: layout/nav chrome + iconography — added lucide-react to @pg/ui; new presentational SidebarNav/NavItem, PageHeader, Avatar (testids sidebar-nav/nav-item/page-header/avatar). ADDITIVE only (new files + index.ts exports + package.json). @pg/ui 56 tests (15 new), tsc, eslint (0 err), citizen + admin builds all green.
- [x] P2b-2 DONE (commit f9bf9df): StatCard, responsive Table(→cards<md), SearchInput, Select. 73 @pg/ui tests. PHASE 2 CHECKPOINT: turbo lint/typecheck/test/build 19/19 green.
  NOTE for Phase 5: citizen Playwright runs at DESKTOP viewport + clicks bottom-nav-* → moving desktop to sidebar means those nav clicks must move to sidebar-nav-* in the spec (same flow, not a weakening). Shells preserve bottom-nav-* (mobile) + add sidebar-nav-<key>. Update citizen playwright nav in P5.

## Phase 3 — Citizen (11 screens + shell)
- [x] Shell DONE (P3-shell): responsive layout — desktop `CitizenSidebar` (SidebarNav brand/nav/footer, sidebar-nav-<key> testids, Avatar+LogoutButton footer) + `CitizenTopBar` (page context + bell + LanguageSwitcher); mobile AppHeader+BottomNav restyled (icons, active indicator) and gated `lg:hidden`. All existing testids (bottom-nav-*, notification-bell, language switcher) preserved. Added `sidebar` i18n namespace (en+ml). citizen 89 tests, i18n parity, tsc, eslint, build all green. No assertions changed.
- [ ] Landing `/`  - [ ] /login  - [ ] /verify  - [ ] /register  - [ ] /track
- [x] P3-auth DONE (5de7beb): landing/login/verify/register/track → shared AuthShell; all testids + Digit-N/Full-name/Save-and-continue preserved; no new i18n; 89 tests + parity + build green.
- [x] P3-core DONE: /home (PageHeader greeting + StatCards with REAL useIssues-derived counts [total/submitted/in-progress/resolved] + recent-grievance preview + Submit CTA; empty-state when none), /issues (PageHeader + Submit action, restyled IssueCards, Loading/Error/Empty states — card testids kept), /issues/[id] (PageHeader ref+StatusBadge+back link, metadata Card, same-origin attachment, rail-and-dot Timeline Card). All testids + no-PII timeline + non-disclosing 404 intact. Added home.* / issues.submitCta i18n (en+ml). citizen 90 tests, i18n parity, tsc, eslint (0 err), build all green. home-overview.test rewritten for real-count behavior (justified).
- [x] P3-core DONE (e04930d): home real counts + dashboard + detail/timeline. home-overview wraps home-empty-state (both visible when empty — Playwright-safe).
- [x] P3-forms DONE (77a4c98): wizard + notifications + profile. All testids + wizard flow/idempotency/validation + unread cue preserved. 90 citizen tests, parity, build green. --- CITIZEN APP COMPLETE (Phase 3) ---

## Phase 4 — Admin (6 functional + 10 placeholders + shell)
- [ ] Shell: sidebar + drawer + top bar refresh
- [ ] /login  - [ ] /verify  - [ ] / (dashboard, real scoped counts)
- [ ] /issues (triage table)  - [ ] /issues/[id] (detail + transition)  - [ ] /notifications
- [ ] 10 placeholder modules → polished "not available yet" state (audit-logs, categories, citizens, coordinators, escalations, panchayats, reports, representatives, settings, wards)

## Phase 5 — Responsive + quality
- [ ] desktop/tablet/mobile passes  - [ ] states audit  - [ ] a11y + en/ml  - [ ] full gate (lint/typecheck/test/build) + both Playwright suites

## Log
(append per-unit results here)

---
ticket_id: T-PATCH-238
version: v0.6
slug: repo-hygiene-docs-commit-decision
title: docs/ 내부문서 repo 커밋·공유 재고 결정 — 개인영역/gitignore 분리 여부
type: doctrine
status: todo
phase: 3
assignee: pdt-po
requires_qa: false
requires_user_gate: true
area_tag: repo-hygiene
estimated_complexity: L2
risk_flags: [architecture-decision, loss-risk-on-gitignore, user-gate-required]
created_at: 2026-06-22T00:00:00Z
---

# T-PATCH-238: docs/ 내부문서 repo 커밋 재고 — 결정 우선 티켓

## Request

shawn 제기(2026-06-22), T-PATCH-232 cua-Tier2 논의 파생:

`docs/` 내부문서(tickets · calibration-log · persona Tier1 habit·bookshelf 등)가
repo에 계속 커밋·공유되는 게 맞는지 재고가 필요하다. 큰 아키텍처 결정이라
전용 세션으로 분리.

## 현재 커밋하는 이유 (현황)

1. **dogfooding 이력** — 이 레포 = productune 발전사. tickets/calibration-log가
   그 역사의 SoT.
2. **GUI live read** — `po-state`·tickets를 GUI IPC가 런타임에 직접 read.
3. **git 복구** — 문서 손상/실수 시 git revert로 복구.

## 재고 포인트 (결정 전 검토 항목)

- `docs/persona/*/habit.md`·`bookshelf/` 등 Tier1은 productune **자기 작업 시에만** 읽힘
  (타 프로젝트는 자기 docs/ 사용) → 개인 ~/.productune/ Tier2로 분리가 맞을 수 있음.
- `docs/tickets/`는 GUI IPC 의존성 있음(GUI read-path 변경 선행 필요).
- gitignore 분리 시 git 복구 메커니즘 대체 필요(예: 별도 backup, Tier2 git 관리).
- 부분 분리(persona Tier1만 Tier2로 이동, tickets는 유지) vs 전면 분리 옵션 존재.

## 이 티켓의 목적 — 결정 우선

**구현 티켓이 아니다.** 결정(AC-0)만 이 티켓의 scope. 실행 범위는 결정 후 후속 티켓.

## Acceptance

- **AC-0(필수)**: shawn이 다음 중 하나를 결정한다:
  - **A(현행 유지)** → 이유 명문화 후 close. backlog 항목 제거.
  - **B(부분 분리)** → 분리 대상 명시(예: persona Tier1만). 후속 impl 티켓 발행.
  - **C(전면 분리)** → gitignore + Tier2 이관 계획 확정. 후속 대형 impl 티켓 발행.
- **AC-1(분리 결정 시만)**: GUI IPC read-path 의존성(tickets GUI read) 해소 방안
  결정(dependency map 확인).
- **AC-2(분리 결정 시만)**: git 복구 대체 메커니즘 결정(Tier2 git 관리 or 백업 정책).

## Out of scope

- 실제 파일 이동·gitignore 수정 — AC-0 결정 후 별도 실행 티켓.
- Tier2 구조 재설계(이미 T-PATCH-232에서 cua 승격 완료된 부분은 제외).

## 의존성

- T-PATCH-232(cua Tier2 승격, 완료) — 이 결정의 맥락 제공.
- GUI IPC tickets read-path(현 코드베이스 확인 선행 필요).

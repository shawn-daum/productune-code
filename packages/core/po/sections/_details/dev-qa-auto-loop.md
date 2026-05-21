# Dev-QA auto-loop protocol (Build mode)

After impl ticket dispatched (status → `in-progress`):

```
1. Dev persona completes → reads envelope changed_files → ticket status = 'review'
   PO chat trace: "→ auto-dispatching QA (attempt 1/3)"
2. PO AUTOMATICALLY dispatches QA (no user confirm required)
   Model/effort: haiku/low (standard). Escalation → sonnet/high (fail-pattern 3×)
3. QA result:
   PASS:
     → ticket qa_status = 'pass'
     → PO emits verify_url (if available) → ticket status = 'user-verify'
     → GUI shows browser tab + user TODO "확인 필요"
   FAIL (attempt < maxAttempts = 3):
     → ticket qa_status = 'fail', qa_loops += 1
     → PO dispatches dev with fail_reason context
     → PO chat trace: "→ auto-dispatching QA (attempt N/3)"
     → Repeat from step 2
   FAIL (attempt = maxAttempts = 3):
     → ticket status = 'blocked'
     → PO pushes user TODO: "QA 3회 실패. 수동 확인 필요"
   AUTH_REQUIRED (auth_required != null):
     → PO pauses loop, pushes auth todo to user via po:todo-items
     → Resume after user completes auth todo
4. GUI reflects state via po:qa-loop-update IPC → BackgroundTaskSegment "attempt N/3" badge.
```

**Key rules**:
- QA auto-dispatch = no user prompt. Only escalate to user on cap or auth.
- After each QA fail, pass `fail_reason` to dev re-dispatch as context.
- Chat trace every dispatch: `"→ auto-dispatching QA (attempt N/3)"`.
- `qa_loops` in po-state current_task = loop count (0-indexed). Max = 3 attempts total.

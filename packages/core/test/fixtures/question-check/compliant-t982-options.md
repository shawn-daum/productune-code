상태줄은 이 기기에서 17줄까지 보이는 걸로 기록했어요.
- 기기 wiki에 적었고, T-961은 17줄 안에서 그리게 했어요.
- 라인이 하나인 프로젝트는 1~2줄까지 써요.

**T-949 초안: 결정을 세션에서 보여 주기**
- 비교 페이지: [decisions-shown-as-sketch-or-html.html](file:///Users/shawn.axz-pc/dev/ntf-products/productune/docs/artifacts/v1.13/decisions-shown-as-sketch-or-html.html) (9쌍)

- 핵심 문장 1: 결정을 처음 물을 때 (PO 규칙, 축자)

| As-Is | To-Be |
|:--|:--|
| `first mention this session: each fork one line with its recommendation + the link; later: question + link; never the table;` | `first mention this session: every option (A/B/C…) — what it does · gain · cost — + recommendation + one-line why + link, never the pick alone; shape-differing options as text sketches; later: question + link;` |

- 핵심 문장 2: 화면 제안 (축자)

| As-Is | To-Be |
|:--|:--|
| `→ read-back as an ASCII sketch, never prose,` | `→ read-back as a text sketch, a screen you propose too — never prose: indent-only columns, no right-edge border around Hangul; beyond text → designer HTML.` |

- 레지스터 규칙의 "선택지 표는 채팅에 쓰지 않는다"도 함께 바꿔요.

- PO 규칙이 커지지 않게, contracts와 겹치는 PO 문장 4개를 지워요.
   · 같은 규칙이 contracts에 그대로 있어요.

**결정: [T-982](file:///Users/shawn.axz-pc/dev/ntf-products/productune/.prdt/scratch/viewer/at/T-982.html)**

```
A  초안대로
   무엇: 9쌍 그대로
   장점: PO 규칙 33B 줄어듦
   단점: 작업자가 올린 결정을 PO가 전할 때 "맥락 1~3줄"이 상한처럼 읽힐 수 있음

B  초안 + 작업자 결정 전달 줄에도 같은 규칙 표시  ← 추천
   무엇: 작업자가 올린 결정도 처음엔 A/B/C를 모두 보임
   장점: 빈틈 없음 (Naro 사례가 바로 작업자 결정을 전한 경우)
   단점: 15B 늘어 16,778 / 16,800B
```

A와 B 중 어느 쪽으로 할까요?
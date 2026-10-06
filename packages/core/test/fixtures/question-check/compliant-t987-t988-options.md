T-961 상태줄 부분이 끝났어요. 뷰어 부분은 새 작업자에게 맡겼어요.

**끝난 것 (`tracks/T-961`, 아직 dev 합치기 전)**
- 상태줄: 정한 배치대로 나와요.
   · 할 일이 없으면 한 줄, 있으면 두 줄
   · 라인이 여러 개면 라인마다 한 줄, 최대 17줄
   · 단계 진행 `build 3/5`

- 뷰어 홈 단계 막대 표기: `티켓 n` · `티켓 완료 n/m`

- 테스트 48개 + 뷰어 테스트 376개 통과

**진행 중**
- 뷰어 라인별 사이드바 · 라인별 진행 상황 (Developer, 새로 발주)

**결정 2개 (구현하다 나온 것)**
- [T-987](file:///Users/shawn.axz-pc/dev/ntf-products/productune/.prdt/scratch/viewer/at/T-987.html): 지금 PO가 맡은 일 칸(`T-NNN slug→po`)

```
A  빼기  ← 추천
   productune v1.13 | branch: dev | build 3/5 | ticket 12/45 | working T-961(dev)>T-962
   장점: 줄이 짧고 working과 겹치지 않아요.
   단점: PO가 작업자 없이 직접 맡은 일은 안 보여요.

B  working 앞에 두기
   productune v1.13 | … | ticket 12/45 | T-962 ntf-archive…→po | working …
   장점: PO 직접 작업도 보여요.
   단점: 줄이 길어져요.
```

- A를 추천해요. 그 칸은 거의 늘 비어 있어요.

- [T-988](file:///Users/shawn.axz-pc/dev/ntf-products/productune/.prdt/scratch/viewer/at/T-988.html): 라인이 여러 개이고 할 일이 없을 때

```
A  할 일 줄 항상
   ntf-pm       v2.2 | branch: dev  | build 3/5  | …
   ntf-archive  v1.2 | branch: main | define 1/5 | …
   dec — · req —
   장점: 줄 위치가 고정돼요.
   단점: 한 줄을 더 써요.

B  비면 마지막 라인 줄 끝에  ← 추천
   ntf-pm       v2.2 | branch: dev  | build 3/5  | …
   ntf-archive  v1.2 | branch: main | define 1/5 | … | dec — · req —
   장점: 라인 하나일 때와 규칙이 같아요.
   단점: 어느 라인 것인지 헷갈릴 수 있어요.
```

- B를 추천해요. 한 줄 프로젝트와 같은 규칙이라 익히기 쉬워요.

**답 기다리는 것**
- T-986: 결정 티켓 누락을 어떻게 잡을지 — B 추천
- T-987 — A 추천
- T-988 — B 추천
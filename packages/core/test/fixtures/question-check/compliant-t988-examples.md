T-987은 A(빼기)로 닫았어요.

**T-988 예시: ntf-pm + ntf-archive 두 라인일 때**

**상황 1 · 할 일이 하나도 없음**

```
A  할 일 줄 항상
ntf-pm       v2.2 | branch: dev  | build 3/5  | ticket 12/30 | working T-709(des)
ntf-archive  v1.2 | branch: main | define 1/5 | ticket 0/4   | working —
dec — · req —

B  비면 마지막 라인 줄 끝에  ← 추천
ntf-pm       v2.2 | branch: dev  | build 3/5  | ticket 12/30 | working T-709(des)
ntf-archive  v1.2 | branch: main | define 1/5 | ticket 0/4   | working — | dec — · req —
```

**상황 2 · 결정 하나 대기**

```
A
ntf-pm       v2.2 | branch: dev  | build 3/5  | ticket 12/30 | working T-709(des)
ntf-archive  v1.2 | branch: main | define 1/5 | ticket 0/4   | working —
dec T-712 · req —

B  (A와 같아요. 할 일이 생기면 따로 한 줄)
ntf-pm       v2.2 | branch: dev  | build 3/5  | ticket 12/30 | working T-709(des)
ntf-archive  v1.2 | branch: main | define 1/5 | ticket 0/4   | working —
dec T-712 · req —
```

**상황 3 · 라인 하나짜리 프로젝트 (비교용, 이미 정한 규칙)**

```
할 일 없음:  productune v1.13 | branch: dev | build 3/5 | ticket 12/45 | working — | dec — · req —
할 일 있음:  productune v1.13 | branch: dev | build 3/5 | ticket 12/45 | working —
            dec T-988 · req —
```

**차이 정리**

| | A | B |
|:--|:--|:--|
| 할 일 없을 때 줄 수 | 라인 수 + 1 | 라인 수 |
| 할 일 있을 때 | 같음 | 같음 |
| 라인 하나 규칙과 | 다름 | 같음 |
| 헷갈릴 점 | 없음 | `dec — · req —`가 ntf-archive 것처럼 보일 수 있음 |

- 할 일이 있을 때는 A와 B가 똑같아요. 차이는 "할 일 없을 때 한 줄을 더 쓰느냐"뿐이에요.
- B를 추천해요. 라인이 하나일 때와 규칙이 같아요.

**피드백 기록**
- "선택지마다 예시를 같이 보여 달라"는 말씀을 기록했어요. 다시 나오면 T-949 규칙에 넣을게요.

A와 B 중 어느 쪽으로 할까요?
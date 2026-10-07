T-988은 A로 닫았고, T-984도 같은 규칙으로 바꿨어요. 할 일 줄은 항상 둘째 줄이에요.

**라인 하나**

```
productune v1.13 | branch: dev | build 3/5 | ticket 12/45 | working T-961(dev)>T-962
dec — · req —
```

**라인 둘**

```
ntf-pm       v2.2 | branch: dev  | build 3/5  | ticket 12/30 | working T-709(des)
ntf-archive  v1.2 | branch: main | define 1/5 | ticket 0/4   | working —
dec T-712 · req —
```

- `branch` 위치(버전과 단계 사이)는 그대로예요.

**구현**
- T-961 트랙에 이미 만든 상태줄은 "비면 첫 줄 끝" 규칙이에요.
- 지금 하는 뷰어 작업이 끝나면 상태줄을 이 규칙으로 고쳐요.
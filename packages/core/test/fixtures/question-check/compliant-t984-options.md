맞아요. 결정 티켓을 안 만들었어요. 방금 [T-984](file:///Users/shawn.axz-pc/dev/ntf-products/productune/.prdt/scratch/viewer/at/T-984.html)로 넣었어요. 이제 상태줄 `dec`에 떠요.

**상태줄 두 줄 나누기**

```
A  working 위 · 빈 아래 줄도 보임  ← 추천
   productune v1.13 | build 3/5 | ticket 12/45 | working T-960(dev)>T-961 | branch: dev
   dec — · req —
   장점: 줄 위치가 고정돼서 눈에 익어요. "할 일 없음"도 확인돼요.
   단점: 할 일이 없을 때도 한 줄을 차지해요.

B  working 위 · 빈 아래 줄 숨김
   productune v1.13 | build 3/5 | ticket 12/45 | working T-960(dev)>T-961 | branch: dev
   장점: 공간을 아껴요.
   단점: 줄 수가 바뀌어서 화면이 흔들려요. 숨긴 건지 고장인지 구별하기 어려워요.

C  working 아래
   productune v1.13 | build 3/5 | ticket 12/45 | branch: dev
   working T-960(dev)>T-961 · dec T-984 · req —
   장점: 지금 움직이는 것이 한곳에 모여요.
   단점: working은 내가 할 일이 아니라 읽을 정보예요.
```

- A를 추천해요. "없음"을 확인하는 것도 정보예요.

A · B · C 중 어느 쪽으로 할까요?
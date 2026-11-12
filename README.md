# 4WON'S ENGLISH

하루 한 챕터 필수 영단어와 하루 한 표현 말하기 연습 PWA. 앱 주소: https://4won.github.io/english/

| 구성 | 역할 |
|---|---|
| GitHub Pages (`docs/`) | 앱 화면. main 브랜치 /docs |
| Supabase (4WON'S PLANNER와 같은 프로젝트) | 로그인(플래너 계정), 진도 저장 표 `eng_state` |

## 구조
- `docs/data/words-<level>.json` — 단계별 30챕터 × 20단어. 원본은 `data-src/<level>-*.json`, `node tools/build-words.mjs <level>`로 합치고 검증
- `docs/data/speaking.json` — 말하기 회차(표현, 설명, 문장 10개와 허용 표현 `alt`)
- `docs/js/state.js` — 진도 저장. 기기(localStorage)와 서버를 병합해 덮어쓰기 없이 동기화
- `docs/js/speech.js` — 브라우저 내장 발음(TTS)·음성 인식·채점 규칙
- `supabase/sql/01_eng_state.sql` — 진도 표와 행 단위 보안

## 수정할 때
- 앱 파일을 바꾸면 `docs/sw.js`의 `CACHE` 버전을 올린다.
- 로컬 확인: `http://localhost:5180/?local` 은 로그인 없이 이 기기에만 저장한다.

# DAPA 공개자료 기반 RAG 질의응답 과제

방위사업청 내부 문서나 실제 기관 양식을 외부로 반출하지 않고, dapa.go.kr 공개 페이지와 일반 공공기관 문서 형식을 참고해 RAG 적재용 샘플 문서, 청킹 결과, Supabase pgvector 스키마, Cohere rerank, OpenRouter 답변 생성 흐름을 구성한 과제 제출물입니다.

## 1. 과제 요구사항 대응

| 요구사항 | 제출물 |
| --- | --- |
| 10장 이내 공문서 형식 문서 | `dapa-rag-assignment/docs/dapa_public_sample_official_document.md` |
| DAPA 홈페이지 공개 링크 참고 | 조직도, 직원/담당업무, 공지사항, 민원업무 안내 URL을 문서와 청크 메타데이터에 반영 |
| 청킹 기법 | 제목/절 보존 후 450~700자 recursive character chunking, 약 100자 overlap |
| Vector DB | `dapa-rag-assignment/supabase/schema.sql`에 pgvector 테이블과 RPC 함수 작성 |
| 테이블/함수명 충돌 방지 | 모든 DB 객체에 `dapa_rag_assignment_` prefix 사용 |
| Chat Model | `scripts/answer_with_openrouter.mjs`에서 OpenRouter Chat Completions 사용 |
| 저비용 모델 | 기본값 `google/gemini-2.5-flash`, `.env`의 `OPENROUTER_MODEL`로 교체 가능 |
| Re-rank | `scripts/test_retrieval.mjs`, `scripts/answer_with_openrouter.mjs`에서 Cohere `rerank-v3.5` 사용 |
| RAG 방식 | 벡터 검색 + 키워드 검색 후보를 병합한 뒤 rerank하는 Hybrid RAG |
| GitHub 제출 | 이 저장소에 산출물과 실행 방법을 포함 |

## 2. 공개 자료 출처

- 방위사업청 대표 홈페이지: https://www.dapa.go.kr/
- 조직도: https://www.dapa.go.kr/dapa/index.do?menuSeq=3137
- 직원 및 담당업무 검색: https://www.dapa.go.kr/dapa/emp/empSearch/empSearchView.do?menuSeq=3138
- 공지사항: https://www.dapa.go.kr/dapa/index.do?menuSeq=3031
- 민원업무 안내: https://www.dapa.go.kr/dapa/index.do?menuSeq=3056

## 3. 폴더 구조

```text
dapa-rag-assignment/
  docs/
    dapa_public_sample_official_document.md
  data/
    dapa_public_sample_chunks.json
    dapa_public_sample_embedded_chunks.json
  scripts/
    prepare_chunks.mjs
    embed_and_upload.mjs
    test_retrieval.mjs
    answer_with_openrouter.mjs
  supabase/
    schema.sql
  .env.example
```

## 4. 청킹 설계

문서가 짧고 공문서형 제목 구조가 명확하므로 고정 길이만 사용하는 방식보다 절 제목을 보존하는 방식이 적합합니다.

적용 방식:

- `##` 제목 기준으로 1차 분할
- 긴 절은 700자 이하로 recursive character splitting
- 인접 청크에는 약 100자 overlap 부여
- 각 청크에 `document_id`, `chunk_id`, `section_path`, `source_url`, `token_estimate`, `metadata` 저장

현재 생성 결과:

- 청크 수: 11개
- 임베딩 차원: 1024
- 임베딩 모델: Cohere `embed-multilingual-v3.0`

## 5. Supabase 적재 절차

Supabase REST API와 service-role key는 기존 테이블에 insert/update는 가능하지만, 새 테이블과 RPC 함수를 만드는 DDL은 직접 실행할 수 없습니다. 먼저 Supabase Dashboard의 SQL Editor에서 아래 파일을 실행해야 합니다.

```text
dapa-rag-assignment/supabase/schema.sql
```

그 뒤 로컬 환경 변수 설정 후 업로드합니다.

```powershell
$env:SUPABASE_URL="https://txrcelgqvarqjcsjkgee.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:COHERE_API_KEY="..."
node dapa-rag-assignment/scripts/embed_and_upload.mjs
```

실제 실행에서는 Supabase SQL Editor에서 `schema.sql`을 실행했고, `dapa_public_sample_embedded_chunks.json`의 11개 청크를 `public.dapa_rag_assignment_chunks`에 적재했습니다.

## 6. Hybrid RAG 질의 흐름

1. 질문을 Cohere `embed-multilingual-v3.0`의 `search_query` 타입으로 임베딩
2. `dapa_rag_assignment_match_chunks` RPC로 벡터 후보 검색
3. `dapa_rag_assignment_keyword_chunks` RPC로 키워드 후보 검색
4. 후보를 chunk id 기준으로 병합
5. Cohere `rerank-v3.5`로 상위 근거 재정렬
6. OpenRouter `google/gemini-2.5-flash`로 근거 기반 답변 생성

검색 테스트:

```powershell
$env:SUPABASE_URL="https://txrcelgqvarqjcsjkgee.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:COHERE_API_KEY="..."
node dapa-rag-assignment/scripts/test_retrieval.mjs "방위사업청 공지사항은 어떤 정보를 제공하나요?"
```

답변 생성:

```powershell
$env:OPENROUTER_API_KEY="..."
node dapa-rag-assignment/scripts/answer_with_openrouter.mjs "민원업무는 어떤 절차로 처리되나요?"
```

## 7. 검증 결과

실행한 검증:

```powershell
node dapa-rag-assignment/scripts/prepare_chunks.mjs
node --check dapa-rag-assignment/scripts/prepare_chunks.mjs
node --check dapa-rag-assignment/scripts/embed_and_upload.mjs
node --check dapa-rag-assignment/scripts/test_retrieval.mjs
node --check dapa-rag-assignment/scripts/answer_with_openrouter.mjs
```

확인된 결과:

- 샘플 공문서 생성 완료
- 11개 청크 생성 완료
- Cohere 임베딩 생성 완료
- 1024차원 임베딩 파일 생성 완료
- Supabase 스키마 생성 완료
- Supabase 청크 11개 적재 완료
- Hybrid RAG 검색 후보 11개 반환 확인
- Cohere rerank 상위 결과가 `6. 공지사항 운영 방식` 청크를 1순위로 반환

## 8. 보안 유의사항

- 실제 방위사업청 내부 문서 양식이나 비공개 자료는 사용하지 않았습니다.
- API key는 저장소에 커밋하지 않습니다.
- `.env.example`에는 placeholder만 포함합니다.
- 채팅 또는 터미널에 노출된 API key는 공개 GitHub 제출 전 회전하는 것이 안전합니다.

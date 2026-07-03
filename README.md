# DAPA 공개자료 기반 RAG 문서 검색·답변 시스템

방위사업청 내부 문서나 기관 고유 양식은 사용하지 않고, `dapa.go.kr` 공개 페이지와 일반 공공기관 문서 양식을 참고해 만든 10장 이내 샘플 공문서를 Supabase Vector DB에 적재한 뒤 문서 검색, 근거 재정렬, 답변 생성을 수행하는 RAG 과제 제출물입니다.

배포 서비스: https://ai-studying-man.github.io/rag_ax/

## 구현 범위

| 과제 항목 | 구현 내용 |
| --- | --- |
| 문서 | `dapa-rag-assignment/docs/dapa_public_sample_official_document.md`에 10장 이내 공문서 형식 샘플 작성 |
| 기관 양식 참고 | DAPA 공개 홈페이지의 조직도, 직원/담당업무, 공지사항, 민원업무 안내 링크를 문서와 메타데이터에 반영 |
| 청킹 | 제목 구조 보존 후 450~700자 단위 recursive character chunking, 약 100자 overlap 적용 |
| Vector DB | Supabase pgvector 테이블 `dapa_rag_assignment_chunks`와 검색 RPC 구성 |
| Chat Model | OpenRouter Chat Completions API 연동, 기본 모델 `google/gemini-2.5-flash` |
| Re-rank | Cohere `rerank-v3.5` 연동 |
| RAG 방식 | 벡터 검색 + 키워드 검색 + Cohere rerank + OpenRouter 답변 생성의 Hybrid RAG |
| 배포 | GitHub Pages 정적 웹 서비스로 문서 검색·답변 UI 제공 |

## 웹 서비스 사용 방법

1. https://ai-studying-man.github.io/rag_ax/ 접속
2. 질문 입력
3. Cohere API Key와 OpenRouter API Key 입력
4. `검색 후 답변 생성` 실행
5. Supabase 검색 후보, Cohere 재정렬 근거, OpenRouter 답변과 토큰 사용량 확인

API 키는 브라우저 메모리에서만 사용하며 저장하지 않습니다. Supabase는 공개 샘플 문서에 한정된 read-only 정책과 publishable key로 조회합니다.

## RAG 처리 흐름

```mermaid
flowchart LR
  A["사용자 질문"] --> B["Cohere embed-multilingual-v3.0"]
  B --> C["Supabase pgvector RPC"]
  A --> D["Supabase keyword RPC"]
  C --> E["후보 병합"]
  D --> E
  E --> F["Cohere rerank-v3.5"]
  F --> G["OpenRouter google/gemini-2.5-flash"]
  G --> H["근거 포함 답변"]
```

## 주요 파일

```text
index.html
styles.css
app.js
supabase_public_access.sql
dapa-rag-assignment/
  docs/dapa_public_sample_official_document.md
  data/dapa_public_sample_chunks.json
  data/dapa_public_sample_embedded_chunks.json
  scripts/prepare_chunks.mjs
  scripts/embed_and_upload.mjs
  scripts/test_retrieval.mjs
  scripts/answer_with_openrouter.mjs
  supabase/schema.sql
  results/openrouter_answer_evidence.md
```

## Supabase 구성

DB 객체명은 과제 요구사항에 맞춰 충돌 가능성을 줄이기 위해 `dapa_rag_assignment_` prefix를 사용했습니다.

- 테이블: `public.dapa_rag_assignment_chunks`
- 벡터 검색 RPC: `public.dapa_rag_assignment_match_chunks`
- 키워드 검색 RPC: `public.dapa_rag_assignment_keyword_chunks`
- 적재 청크 수: 11개
- 임베딩 모델: Cohere `embed-multilingual-v3.0`
- 임베딩 차원: 1024

GitHub Pages에서 read-only 검색이 가능하도록 적용한 공개 정책은 `supabase_public_access.sql`에 정리했습니다.

## 검증 결과

- 샘플 공문서 생성 완료
- 11개 청크 생성 완료
- Cohere 임베딩 생성 및 Supabase 적재 완료
- Supabase vector RPC와 keyword RPC 검색 확인
- Cohere rerank 호출 확인
- OpenRouter Chat Model 실제 호출 확인
- OpenRouter usage 기록: `prompt_tokens=1008`, `completion_tokens=134`, `total_tokens=1142`, `cost=0.0006374`
- GitHub Pages 정적 서비스 구성

OpenRouter 호출 증빙은 `dapa-rag-assignment/results/openrouter_answer_evidence.md`와 원본 JSON 파일에 저장했습니다.

## 보안 기준

- 방위사업청 내부 문서, 비공개 문서 양식, 민감정보는 사용하지 않았습니다.
- Supabase service role key는 클라이언트에 포함하지 않았습니다.
- Cohere/OpenRouter 키는 사용자가 화면에 직접 입력하며 저장하지 않습니다.
- 공개 웹서비스는 `metadata.security_level = public_sample` 청크만 조회하도록 Supabase RLS 정책을 적용했습니다.

## 로컬 실행

정적 파일이므로 별도 빌드 없이 실행할 수 있습니다.

```powershell
python -m http.server 8080
```

브라우저에서 `http://localhost:8080`을 열면 GitHub Pages와 같은 방식으로 동작합니다.

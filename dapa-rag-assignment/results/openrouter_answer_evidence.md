# OpenRouter Chat Model 실행 증빙

실행 일시: 2026-07-03  
질문: 방위사업청 공지사항은 어떤 정보를 제공하나요?

## 사용 모델

- Chat Model: `google/gemini-2.5-flash`
- Rerank Model: `rerank-v3.5`
- Embedding Model: `embed-multilingual-v3.0`

## 검색 및 재랭킹 결과

- Supabase 검색 후보 수: 11
- Cohere rerank 1순위 청크: `6. 공지사항 운영 방식`
- 근거 URL: https://www.dapa.go.kr/dapa/index.do?menuSeq=3031

## OpenRouter 답변

방위사업청 공지사항 게시판은 일반공지, 채용 또는 모집 안내, 교육, 사업 설명, 제도 안내 등 국민과 유관기관이 확인해야 할 공개 알림을 제공합니다. 공지사항 상세 페이지에는 일반적으로 제목, 분류, 담당부서, 담당자, 게시일, 조회수, 본문 및 첨부파일 정보가 표시됩니다 [1].

- 근거: [1] 6. 공지사항 운영 방식
- 공개 출처 URL: https://www.dapa.go.kr/dapa/index.do?menuSeq=3031

## OpenRouter Usage

```json
{
  "prompt_tokens": 1008,
  "completion_tokens": 134,
  "total_tokens": 1142,
  "cost": 0.0006374,
  "is_byok": false
}
```

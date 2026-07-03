const SUPABASE_URL = "https://txrcelgqvarqjcsjkgee.supabase.co";
const SUPABASE_KEY = "sb_publishable_9MnlbLanFTRbmfeCu32E2A_RuicExew";
const EMBED_MODEL = "embed-multilingual-v3.0";
const RERANK_MODEL = "rerank-v3.5";
const CHAT_MODEL = "google/gemini-2.5-flash";
const SAMPLE_QUESTIONS = [
  "방위사업청 공지사항은 어떤 정보를 제공하나요?",
  "방위사업청 조직도에서 확인 가능한 정보는 무엇인가요?",
  "민원업무는 어떤 절차로 처리되나요?",
  "이 문서는 보안상 어떤 원칙으로 작성되었나요?"
];

const els = {
  question: document.querySelector("#question"),
  cohereKey: document.querySelector("#cohere-key"),
  openrouterKey: document.querySelector("#openrouter-key"),
  askButton: document.querySelector("#ask-button"),
  sampleButton: document.querySelector("#sample-button"),
  status: document.querySelector("#system-status"),
  answer: document.querySelector("#answer"),
  evidenceList: document.querySelector("#evidence-list"),
  candidateCount: document.querySelector("#candidate-count"),
  rerankCount: document.querySelector("#rerank-count"),
  usageTotal: document.querySelector("#usage-total"),
  usage: document.querySelector("#usage")
};

function setStatus(text, kind = "normal") {
  els.status.textContent = text;
  els.status.className = kind === "error" ? "status-pill error" : "status-pill";
}

function requireValue(input, label) {
  const value = input.value.trim();
  if (!value) throw new Error(`${label}를 입력해야 합니다.`);
  return value;
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${text}`);
  }
  return response.json();
}

async function embedQuery(query, cohereKey) {
  const payload = await postJson(
    "https://api.cohere.com/v2/embed",
    { Authorization: `Bearer ${cohereKey}` },
    {
      model: EMBED_MODEL,
      texts: [query],
      input_type: "search_query",
      embedding_types: ["float"],
      truncate: "END"
    }
  );
  return (payload.embeddings?.float ?? payload.embeddings)[0];
}

async function supabaseRpc(name, body) {
  return postJson(
    `${SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    },
    body
  );
}

async function rerank(query, rows, cohereKey) {
  const documents = rows.map((row) => `${row.title}\n${row.section_path.join(" > ")}\n${row.content}`);
  const payload = await postJson(
    "https://api.cohere.com/v2/rerank",
    { Authorization: `Bearer ${cohereKey}` },
    {
      model: RERANK_MODEL,
      query,
      documents,
      top_n: Math.min(5, documents.length)
    }
  );
  return payload.results.map((result) => ({
    score: result.relevance_score,
    row: rows[result.index]
  }));
}

async function answer(query, rankedRows, openrouterKey) {
  const context = rankedRows
    .map((item, index) => {
      const row = item.row;
      return `[${index + 1}] ${row.section_path.join(" > ")}\n출처: ${row.source_url}\n${row.content}`;
    })
    .join("\n\n");

  return postJson(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      Authorization: `Bearer ${openrouterKey}`,
      "HTTP-Referer": window.location.origin,
      "X-OpenRouter-Title": "DAPA RAG Assignment"
    },
    {
      model: CHAT_MODEL,
      temperature: 0.2,
      max_completion_tokens: 700,
      messages: [
        {
          role: "system",
          content: "너는 방위사업청 공개자료 기반 RAG 질의응답 보조자다. 제공된 근거만 사용하고, 근거가 부족하면 확인되지 않는다고 답한다. 답변에는 근거 번호와 공개 출처 URL을 포함한다."
        },
        {
          role: "user",
          content: `질문: ${query}\n\n근거:\n${context}`
        }
      ]
    }
  );
}

function mergeRows(vectorRows, keywordRows) {
  const seen = new Map();
  for (const row of [...vectorRows, ...keywordRows]) {
    seen.set(row.id, row);
  }
  return [...seen.values()];
}

function renderEvidence(items) {
  if (items.length === 0) {
    els.evidenceList.innerHTML = '<article class="evidence-card empty-card"><h3>검색 결과 없음</h3><p>질문을 더 구체적으로 입력해 주세요.</p></article>';
    return;
  }

  els.evidenceList.innerHTML = items
    .map((item, index) => {
      const row = item.row;
      const score = Number(item.score).toFixed(4);
      const excerpt = row.content.replace(/\s+/g, " ").slice(0, 360);
      const className = index === 0 ? "evidence-card primary" : "evidence-card";
      return `<article class="${className}">
        <div class="evidence-meta">
          <span>청크 ${row.chunk_id}</span>
          <span>재랭킹 ${score}</span>
          <span>${row.section_path.join(" > ")}</span>
        </div>
        <h3>${row.section_path.join(" > ")}</h3>
        <p>${excerpt}</p>
        <a href="${row.source_url}" target="_blank" rel="noreferrer">${row.source_url}</a>
      </article>`;
    })
    .join("");
}

function setBusy(isBusy) {
  els.askButton.disabled = isBusy;
  els.sampleButton.disabled = isBusy;
}

async function runRag() {
  try {
    const query = requireValue(els.question, "질문");
    const cohereKey = requireValue(els.cohereKey, "Cohere API Key");
    const openrouterKey = requireValue(els.openrouterKey, "OpenRouter API Key");
    setBusy(true);
    setStatus("검색 중");
    els.answer.className = "answer";
    els.answer.textContent = "Supabase에서 후보 문서를 검색하고 있습니다.";
    els.usage.textContent = "";

    const queryEmbedding = await embedQuery(query, cohereKey);
    const vectorRows = await supabaseRpc("dapa_rag_assignment_match_chunks", {
      query_embedding: queryEmbedding,
      match_count: 12,
      match_threshold: 0.1
    });
    const keywordRows = await supabaseRpc("dapa_rag_assignment_keyword_chunks", {
      query_text: query,
      match_count: 12
    });
    const merged = mergeRows(vectorRows, keywordRows);
    els.candidateCount.textContent = String(merged.length);

    setStatus("재정렬 중");
    const ranked = await rerank(query, merged, cohereKey);
    els.rerankCount.textContent = String(ranked.length);
    renderEvidence(ranked);

    setStatus("답변 생성 중");
    const payload = await answer(query, ranked, openrouterKey);
    const content = payload.choices?.[0]?.message?.content ?? "답변을 생성하지 못했습니다.";
    const usage = payload.usage;
    els.answer.textContent = content;
    els.usageTotal.textContent = String(usage?.total_tokens ?? 0);
    els.usage.textContent = usage ? `OpenRouter usage: ${usage.total_tokens} tokens, cost ${usage.cost ?? "N/A"}` : "";
    setStatus("완료");
  } catch (error) {
    setStatus("오류", "error");
    els.answer.className = "answer error";
    els.answer.textContent = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  } finally {
    setBusy(false);
  }
}

els.askButton.addEventListener("click", () => {
  runRag();
});

els.sampleButton.addEventListener("click", () => {
  const current = SAMPLE_QUESTIONS.indexOf(els.question.value.trim());
  const next = current >= 0 ? (current + 1) % SAMPLE_QUESTIONS.length : 0;
  els.question.value = SAMPLE_QUESTIONS[next];
  els.question.focus();
});

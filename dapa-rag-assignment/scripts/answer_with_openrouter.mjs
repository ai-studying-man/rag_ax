const MATCH_RPC = "dapa_rag_assignment_match_chunks";
const KEYWORD_RPC = "dapa_rag_assignment_keyword_chunks";
const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const EMBED_MODEL = "embed-multilingual-v3.0";
const RERANK_MODEL = "rerank-v3.5";
const CHAT_MODEL = process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function embedQuery(query, cohereKey) {
  const payload = await postJson(
    COHERE_EMBED_URL,
    { Authorization: `Bearer ${cohereKey}` },
    {
      model: EMBED_MODEL,
      texts: [query],
      input_type: "search_query",
      embedding_types: ["float"],
      truncate: "END",
    },
  );
  const embeddings = payload.embeddings?.float ?? payload.embeddings;
  return embeddings[0];
}

async function callRpc(name, body, supabaseUrl, supabaseKey) {
  return postJson(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
    {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body,
  );
}

async function rerank(query, rows, cohereKey) {
  const documents = rows.map((row) => `${row.title}\n${row.section_path?.join(" > ") ?? ""}\n${row.content}`);
  const payload = await postJson(
    COHERE_RERANK_URL,
    { Authorization: `Bearer ${cohereKey}` },
    {
      model: RERANK_MODEL,
      query,
      documents,
      top_n: Math.min(5, documents.length),
    },
  );
  return payload.results.map((result) => rows[result.index]);
}

async function answer(query, rows, openrouterKey) {
  const context = rows
    .map((row, index) => `[${index + 1}] ${row.section_path?.join(" > ") ?? row.title}\n출처: ${row.source_url}\n${row.content}`)
    .join("\n\n");
  const payload = await postJson(
    OPENROUTER_CHAT_URL,
    { Authorization: `Bearer ${openrouterKey}` },
    {
      model: CHAT_MODEL,
      temperature: 0.2,
      max_completion_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "너는 방위사업청 공개자료 기반 RAG 질의응답 보조자다. 제공된 근거만 사용하고, 근거가 부족하면 확인되지 않는다고 답한다. 답변에는 근거 번호와 공개 출처 URL을 포함한다.",
        },
        {
          role: "user",
          content: `질문: ${query}\n\n근거:\n${context}`,
        },
      ],
    },
  );
  return payload.choices?.[0]?.message?.content ?? "";
}

async function main() {
  const query = process.argv.slice(2).join(" ") || "방위사업청 공지사항은 어떤 정보를 제공하나요?";
  const cohereKey = requireEnv("COHERE_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openrouterKey = requireEnv("OPENROUTER_API_KEY");
  const queryEmbedding = await embedQuery(query, cohereKey);
  const vectorRows = await callRpc(
    MATCH_RPC,
    { query_embedding: queryEmbedding, match_count: 12, match_threshold: 0.1 },
    supabaseUrl,
    supabaseKey,
  );
  const keywordRows = await callRpc(KEYWORD_RPC, { query_text: query, match_count: 12 }, supabaseUrl, supabaseKey);
  const merged = [...new Map([...vectorRows, ...keywordRows].map((row) => [row.id, row])).values()];
  const ranked = await rerank(query, merged, cohereKey);
  const response = await answer(query, ranked, openrouterKey);
  console.log(response);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

const TABLE_MATCH_RPC = "dapa_rag_assignment_match_chunks";
const KEYWORD_RPC = "dapa_rag_assignment_keyword_chunks";
const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const COHERE_RERANK_URL = "https://api.cohere.com/v2/rerank";
const EMBED_MODEL = "embed-multilingual-v3.0";
const RERANK_MODEL = "rerank-v3.5";

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
  return payload.results.map((result) => ({
    relevance_score: result.relevance_score,
    row: rows[result.index],
  }));
}

async function main() {
  const query = process.argv.slice(2).join(" ") || "방위사업청 공지사항은 어떤 정보를 제공하나요?";
  const cohereKey = requireEnv("COHERE_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const queryEmbedding = await embedQuery(query, cohereKey);

  const vectorRows = await callRpc(
    TABLE_MATCH_RPC,
    { query_embedding: queryEmbedding, match_count: 12, match_threshold: 0.1 },
    supabaseUrl,
    supabaseKey,
  );
  const keywordRows = await callRpc(KEYWORD_RPC, { query_text: query, match_count: 12 }, supabaseUrl, supabaseKey);
  const merged = [...new Map([...vectorRows, ...keywordRows].map((row) => [row.id, row])).values()];
  const ranked = await rerank(query, merged, cohereKey);

  console.log(JSON.stringify({ query, candidates: merged.length, reranked: ranked }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

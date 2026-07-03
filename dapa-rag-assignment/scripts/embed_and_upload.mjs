import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHUNKS_PATH = path.join(ROOT, "data", "dapa_public_sample_chunks.json");
const EMBEDDED_PATH = path.join(ROOT, "data", "dapa_public_sample_embedded_chunks.json");
const TABLE_NAME = "dapa_rag_assignment_chunks";
const COHERE_EMBED_URL = "https://api.cohere.com/v2/embed";
const EMBED_MODEL = "embed-multilingual-v3.0";
const BATCH_SIZE = 16;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function vectorLiteral(values) {
  return `[${values.join(",")}]`;
}

async function embedBatch(texts, apiKey) {
  const response = await fetch(COHERE_EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      texts,
      input_type: "search_document",
      embedding_types: ["float"],
      truncate: "END",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cohere embed failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const embeddings = payload.embeddings?.float ?? payload.embeddings;
  if (!Array.isArray(embeddings)) throw new Error("Cohere embed response did not include float embeddings");
  return embeddings;
}

async function uploadRows(rows, supabaseUrl, supabaseKey) {
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${TABLE_NAME}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upload failed: ${response.status} ${body}`);
  }

  return rows.length;
}

async function main() {
  const cohereKey = requireEnv("COHERE_API_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const chunks = JSON.parse(await readFile(CHUNKS_PATH, "utf8"));
  const embedded = [];

  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const embeddings = await embedBatch(batch.map((item) => item.content), cohereKey);
    for (let index = 0; index < batch.length; index += 1) {
      embedded.push({ ...batch[index], embedding: embeddings[index] });
    }
    console.log(`embedded=${embedded.length}/${chunks.length}`);
  }

  await writeFile(EMBEDDED_PATH, `${JSON.stringify(embedded, null, 2)}\n`, "utf8");

  const rows = embedded.map((item) => ({
    document_id: item.document_id,
    chunk_id: item.chunk_id,
    title: item.title,
    section_path: item.section_path,
    content: item.content,
    token_estimate: item.token_estimate,
    source_url: item.source_url,
    metadata: { ...item.metadata, part_index: item.part_index, embedding_model: EMBED_MODEL },
    embedding: vectorLiteral(item.embedding),
  }));

  const uploaded = await uploadRows(rows, supabaseUrl, supabaseKey);
  console.log(`uploaded_rows=${uploaded}`);
  console.log(`embedded_output=${EMBEDDED_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

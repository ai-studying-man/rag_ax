import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCUMENT_PATH = path.join(ROOT, "docs", "dapa_public_sample_official_document.md");
const OUTPUT_PATH = path.join(ROOT, "data", "dapa_public_sample_chunks.json");
const DOCUMENT_ID = "dapa-public-sample-2026";
const MAX_CHARS = 700;
const OVERLAP_CHARS = 100;

const sourceBySection = new Map([
  ["2. 작성 근거 및 공개 출처", "https://www.dapa.go.kr/"],
  ["4. 조직 구성 참고", "https://www.dapa.go.kr/dapa/index.do?menuSeq=3137"],
  ["5. 부서별 역할 요약", "https://www.dapa.go.kr/dapa/index.do?menuSeq=3137"],
  ["6. 공지사항 운영 방식", "https://www.dapa.go.kr/dapa/index.do?menuSeq=3031"],
  ["7. 민원 및 대국민 안내", "https://www.dapa.go.kr/dapa/index.do?menuSeq=3056"],
]);

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

function estimateTokens(value) {
  return Math.ceil(value.length / 2.4);
}

function splitLongSection(value) {
  if (value.length <= MAX_CHARS) return [value];
  const chunks = [];
  let start = 0;
  while (start < value.length) {
    const hardEnd = Math.min(start + MAX_CHARS, value.length);
    const slice = value.slice(start, hardEnd);
    const breakAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("다."));
    const end = breakAt > 250 && hardEnd < value.length ? start + breakAt + 2 : hardEnd;
    chunks.push(value.slice(start, end).trim());
    if (end >= value.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }
  return chunks.filter(Boolean);
}

function parseSections(markdown) {
  const lines = normalizeText(markdown).split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^# /, "").trim() ?? "DAPA RAG 문서";
  const sections = [];
  let currentHeading = "문서 머리말";
  let currentLines = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, body: normalizeText(currentLines.join("\n")) });
      }
      currentHeading = line.replace(/^## /, "").trim();
      currentLines = [line];
      continue;
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, body: normalizeText(currentLines.join("\n")) });
  }

  return { title, sections };
}

function sourceUrlFor(heading) {
  if (sourceBySection.has(heading)) return sourceBySection.get(heading);
  const parent = heading.split(".").slice(0, 2).join(".");
  for (const [section, url] of sourceBySection.entries()) {
    if (section.startsWith(parent)) return url;
  }
  return "https://www.dapa.go.kr/";
}

async function main() {
  const markdown = await readFile(DOCUMENT_PATH, "utf8");
  const { title, sections } = parseSections(markdown);
  const chunks = [];

  for (const section of sections) {
    const parts = splitLongSection(section.body);
    for (const [partIndex, content] of parts.entries()) {
      chunks.push({
        document_id: DOCUMENT_ID,
        chunk_id: chunks.length + 1,
        title,
        section_path: [section.heading],
        part_index: partIndex + 1,
        content,
        token_estimate: estimateTokens(content),
        source_url: sourceUrlFor(section.heading),
        metadata: {
          source_type: "public_sample_document",
          source_agency: "방위사업청",
          security_level: "public_sample",
          chunking_strategy: "section-aware recursive character chunking with overlap",
          max_chars: MAX_CHARS,
          overlap_chars: OVERLAP_CHARS,
        },
      });
    }
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(chunks, null, 2)}\n`, "utf8");
  console.log(`document=${DOCUMENT_PATH}`);
  console.log(`chunks=${chunks.length}`);
  console.log(`output=${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

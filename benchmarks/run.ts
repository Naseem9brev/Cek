/**
 * Retrieval benchmark — run: npm run benchmark
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scorePromptHybridTopK,
  filterNodesByWorkspace,
} from "../src/lib/retrieval.ts";
import type { KnowledgeNode } from "../src/lib/messaging.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface QueryCase {
  query: string;
  expectedIds: string[];
  workspace?: string | null;
}

interface Fixture {
  nodes: KnowledgeNode[];
  nodeEmbeddings: Record<string, number[]>;
  queries: QueryCase[];
}

function loadFixture(): Fixture {
  const raw = readFileSync(join(root, "benchmarks/fixtures/retrieval.json"), "utf8");
  return JSON.parse(raw) as Fixture;
}

function recallAtK(expected: string[], got: string[], k: number): number {
  if (!expected.length) return 1;
  const top = got.slice(0, k);
  const hits = expected.filter((id) => top.includes(id)).length;
  return hits / expected.length;
}

function mrr(expected: string[], ranked: string[]): number {
  for (let i = 0; i < ranked.length; i++) {
    if (expected.includes(ranked[i]!)) return 1 / (i + 1);
  }
  return 0;
}

const fixture = loadFixture();
let totalRecall1 = 0;
let totalRecall3 = 0;
let totalMrr = 0;

console.log("Cek retrieval benchmark\n");

for (const q of fixture.queries) {
  const scoped = filterNodesByWorkspace(fixture.nodes, q.workspace ?? null);
  const matches = scorePromptHybridTopK(q.query, scoped, {
    nodeEmbeddings: fixture.nodeEmbeddings,
    topK: 5,
  });
  const rankedIds = matches.map((m) => m.node.id);
  const r1 = recallAtK(q.expectedIds, rankedIds, 1);
  const r3 = recallAtK(q.expectedIds, rankedIds, 3);
  const rr = mrr(q.expectedIds, rankedIds);

  totalRecall1 += r1;
  totalRecall3 += r3;
  totalMrr += rr;

  const status = r1 >= 1 ? "PASS" : r3 >= 1 ? "PARTIAL" : "MISS";
  console.log(
    `[${status}] "${q.query.slice(0, 48)}" → recall@1=${(r1 * 100).toFixed(0)}% recall@3=${(r3 * 100).toFixed(0)}% mrr=${rr.toFixed(2)}`
  );
}

const n = fixture.queries.length;
console.log("\n--- Summary ---");
console.log(`Queries: ${n}`);
console.log(`Mean recall@1: ${((totalRecall1 / n) * 100).toFixed(1)}%`);
console.log(`Mean recall@3: ${((totalRecall3 / n) * 100).toFixed(1)}%`);
console.log(`Mean MRR: ${(totalMrr / n).toFixed(3)}`);

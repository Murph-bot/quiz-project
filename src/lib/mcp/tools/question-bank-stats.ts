import { defineTool } from "@lovable.dev/mcp-js";
import { questions } from "../../questions.server";

const TIER_NAMES: Record<number, string> = { 1: "easy", 2: "medium", 3: "hard" };

function stats() {
  const byCategory = new Map<string, number>();
  const byTier = new Map<number, number>();
  for (const q of questions) {
    byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
    const tier = q.level ?? 1;
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
  }
  const categories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
  const tiers = [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, count]) => ({ tier: TIER_NAMES[tier] ?? String(tier), count }));
  return { total: questions.length, categoryCount: categories.length, categories, tiers };
}

export default defineTool({
  name: "question_bank_stats",
  title: "Question bank stats",
  description: "Report how many numeric questions Quiz_Knight holds, which categories they cover and how many sit in each difficulty tier. Question text and answers are never returned.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const s = stats();
    const text = [
      `${s.total} questions across ${s.categoryCount} categories.`,
      `Difficulty: ${s.tiers.map(t => `${t.count} ${t.tier}`).join(", ")}.`,
      "Categories:",
      ...s.categories.map(c => `  ${c.name}: ${c.count}`),
    ].join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { total: s.total, categoryCount: s.categoryCount, categories: s.categories.map(c => ({ ...c })), tiers: s.tiers.map(t => ({ ...t })) },
    };
  },
});

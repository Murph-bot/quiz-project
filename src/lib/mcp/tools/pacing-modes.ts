import { defineTool } from "@lovable.dev/mcp-js";

const PACES = [
  {
    key: "steady",
    name: "Steady Siege",
    timer: "The same round timer every round, chosen by the host: 15, 30, 45 or 60 seconds.",
    advance: "The host taps Next after every reveal, so the table can talk it over.",
    bank: "Questions are shuffled once per room and never repeat until the bank is exhausted.",
  },
  {
    key: "rising",
    name: "Rising Pressure",
    timer: "The timer shrinks by 5 seconds each round and never drops below 12 seconds. Sudden death is always 15 seconds.",
    advance: "Reveals last 6 seconds, then the next round starts on its own.",
    bank: "A difficulty ladder: easier questions while the party is large, harder ones as knights fall, hardest in the bracket.",
  },
  {
    key: "chaos",
    name: "Crowd's Chaos",
    timer: "The round ends early as soon as every knight still in it has locked in a guess, plus a 3-second grace.",
    advance: "Reveals last 4 seconds, then the next round starts on its own.",
    bank: "Same shuffled no-repeat bank as Steady Siege.",
  },
];

const TEXT = PACES.map(p => `${p.name} (${p.key})\n  Timer: ${p.timer}\n  Advance: ${p.advance}\n  Questions: ${p.bank}`).join("\n\n");

export default defineTool({
  name: "pacing_modes",
  title: "Pacing modes",
  description: "List the three game paces a host can pick in Quiz_Knight and how each one runs its timer, round advances and question selection.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: TEXT }],
    structuredContent: { paces: PACES.map(p => ({ ...p })) },
  }),
});

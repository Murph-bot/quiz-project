import { defineTool } from "@lovable.dev/mcp-js";

const RULES = [
  "Gather the party: 2-52 players, nickname only, no accounts. One person hosts a room and shares its four-letter code.",
  "Guess a number: every question asks for a number. Lock in one estimate before the countdown ends. Closest to the true answer wins the round; a missed answer ranks last.",
  "Closeness is plain absolute distance, plus or minus. Percentages are never used.",
  "Armor: everyone starts with 2 Armor Shields. The farthest guess loses 1 charge. Zero shields means elimination. A Golden Aegis absorbs one hit instead.",
  "Sudden death: if the worst guesses tie, those players face a 15-second sudden-death question until the tie breaks.",
  "Bullseye Bounty: the closest guess each round earns +1 Shield, or a Golden Aegis when both shields are already full.",
  "Shadow Council: eliminated knights keep watching and get 100 play points. They wager 5, 10 or 20 on the closest guess or on a knight surviving. Winning predictions pay 2x.",
  "Return of the Fallen: every 3 eliminations, while 5 or more knights still stand, the spectator(s) with the most correct closest-knight bets return to the arena with 1 shield.",
  "The bracket: the last four play two best-of-3 semifinals, then the winners play a best-of-5 final. Series scoring replaces armor elimination in the bracket. With two players you go straight to the best-of-5 final.",
  "The host starts the next round in Steady Siege; the other paces advance automatically.",
].join("\n");

export default defineTool({
  name: "game_rules",
  title: "Game rules",
  description: "Explain how Quiz_Knight is played: room setup, armor, sudden death, the bounty, the Shadow Council and the final-four bracket.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: RULES }],
    structuredContent: {
      players: "2-52",
      accounts: "none, nickname only",
      room_code: "four letters",
      closeness: "absolute distance from the true answer",
      starting_shields: 2,
      sudden_death_seconds: 15,
      council_points: 100,
      council_stakes: [5, 10, 20],
      council_payout: "2x stake",
      comeback: "every 3 eliminations while 5+ knights stand, best spectator bettor(s) return with 1 shield",
      bracket: "two best-of-3 semifinals, then a best-of-5 final",
    },
  }),
});

import { auth, defineMcp } from "@lovable.dev/mcp-js";
import gameRulesTool from "./tools/game-rules";
import pacingModesTool from "./tools/pacing-modes";
import questionBankStatsTool from "./tools/question-bank-stats";
import myAccountTool from "./tools/my-account";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "quiz-knight",
  title: "Quiz_Knight",
  version: "0.1.0",
  instructions:
    "Quiz_Knight is a real-time multiplayer trivia elimination game for friends: everyone guesses a number, the farthest guess loses armor, and the last knight standing wins. Callers sign in as a Quiz_Knight account. Use `my_account` to confirm who you are acting as, `game_rules` to explain how a match is played, `pacing_modes` to compare the three game paces a host can choose, and `question_bank_stats` to see how large the question bank is and what it covers. No question answers are exposed.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    requireOAuthClientClaim: true,
  }),
  tools: [myAccountTool, gameRulesTool, pacingModesTool, questionBankStatsTool],
});

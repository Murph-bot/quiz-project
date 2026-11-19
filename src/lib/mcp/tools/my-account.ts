import { defineTool, ToolError, type ToolContext } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "my_account",
  title: "My account",
  description: "Report which Quiz_Knight account the caller is signed in as, so you can confirm the identity the other tools act under.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input: Record<string, never> | undefined, ctx: ToolContext) => {
    const claims = ctx.getClaims();
    const userId = ctx.getUserId() ?? (typeof claims?.sub === "string" ? claims.sub : undefined);
    if (!userId) throw new ToolError("This request carries no signed-in Quiz_Knight account.");
    const email = typeof claims?.email === "string" ? claims.email : null;
    const text = email ? `Signed in as ${email} (user id ${userId}).` : `Signed in as user id ${userId}.`;
    return { content: [{ type: "text", text }], structuredContent: { userId, email } };
  },
});

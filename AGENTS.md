<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Quiz game architecture
- Keep the deterministic round and tournament rules in `src/lib/game.ts`, tested separately, so the server remains authoritative.
- Rooms persist as versioned JSON with compare-and-swap updates; a cryptographically random player ticket authorizes every room action, so nicknames require no accounts.
- Only server-side room functions access game storage; project tables are RLS-locked to clients, and responses strip tickets and unrevealed answers.
- Poll room state once per second while joined; deadline resolution is idempotent and triggered by any player, so a host disconnect cannot freeze the reveal.
- Keep visual roles in CSS semantic tokens and use the shared Button for game controls.
- Armor, bounties and council wagers live in the deterministic game module; normalize legacy room JSON before actions so older rooms remain usable.
- Council predictions use server-validated play-point balances and per-round settlements, never cash or client-controlled outcomes.
- Persist normalized question-text identities and the active question snapshot in room JSON; indices alone shift on bank edits, and exhausted rooms must not recycle questions.
- Reveal suspense, sounds, haptics and wake lock are client-only presentation in `src/components/game-extras.tsx`; they never change server game state, so polling stays authoritative.

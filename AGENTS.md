<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- ZChecklist retains a single public SPA route with session-gated screens; Cloud Auth and owner-only RLS protect private records independently of screen visibility.
- Centralize status/report calculations in zchecklist.ts, analytics in analytics.ts and Excel generation in workbook.ts so all exports use the same saved observations.
- Serialize version-checked writes and retain owner-scoped pending drafts locally until confirmed; never report failed writes as saved or complete pending work.
- Member labels live in checklists.labels (JSON member-number -> name); reusable rosters live in the owner-scoped frameworks table so daily checklists can be created without re-entering members.
- Authenticated navigation uses a left sidebar (Home/About/FAQs/Sign Out) with Profile top-right; the checklist screen keeps its own Exit/Complete header controls.

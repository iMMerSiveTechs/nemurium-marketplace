# Catalog capitalize

A catalog entry is only an asset if it makes **GlassGraph** (or a later NEMURIUM product that can stand alone) more useful. “The old site had it” is not a reason. Same rule as Feature Capitalization.

Score: **Now / Next / Later / Never (for this product).**

Now = starter-map shape GlassGraph already talks about.
Next = honest use-case language, still not a product card.
Later = only if a second product is ready to stand on its own.
Never = do not republish as ours.

## What the old catalog actually was

Commit `9e3e278`. Static HTML. 9 agent pages + 97 skill pages. Homepage claimed 9 agents, 100+ skills, 20+ live connectors, 10 core tools, 18 plugins, “production-ready enterprise.”

None of that was a store. `openProduct()` logged to the console. Core Tools were Bash / Read / Write / Grep (Cursor and Claude primitives). Connectors marked live were other people’s MCP servers.

That is why bringing it “into the new one” cannot mean putting the grid back next to GlassGraph `NO_SHIP`.

## Never

Do not put these on nemurium.com, in GlassGraph marketing, or in a `/toolkit` route.

| Old thing | Why Never |
| --- | --- |
| Count theater (100+ skills, 20+ live connectors, 18 plugins) | Unconnected claims. Live house does not speak this way. |
| “Production-ready enterprise” | False then. Conflicts with `NO_SHIP` and `CANDIDATE_ONLY` now. |
| Core Tools (Bash, Read, Write, Grep, …) | Cursor / Claude primitives, not NEMURIUM products. |
| Live connector badges | MCP servers we did not ship. GlassGraph’s MCP line is opt-in visual sharing, coming, off by default. |
| General Purpose / Explore / Plan / Claude Code Guide as products | Vendor agent types. We already have Agent Factory for *our* agents. |
| Apollo: Enrich Lead, Prospect, Sequence Load | Someone else’s sales stack. |
| Productivity: Task Management, Memory Management as apps | That job *is* GlassGraph. Selling it as a skill card is the old mistake. |
| Identical Inter skill pages | The “blatantly AI built” look. Archive only. |

## Now — GlassGraph starter maps

GlassGraph already says: start with a useful structure; map signal, evidence, decision; see dependencies; stay local.

| Old family | House job | Starter shape |
| --- | --- | --- |
| (already on the live page) | Follow a question to the next useful step | Signal → question → evidence → decision |
| Engineering: Incident Response, Architecture, System Design, Tech Debt | See the system and the gap | Outage / design / debt as a connected board |
| Operations: Risk Assessment, Change Request, Process Documentation, Runbook | What depends on what before you move | Change + risk + owners on one map |
| Design: Research Synthesis, User Research | Keep the signal with the decision | Research → pattern → decision |
| Search: Knowledge Synthesis | Same job as the live example maps | Sources → claim → next step |

First spec to write (slice 3): the live **signal → evidence → decision** example, as a starter someone can actually start from — not a skill landing page.

Second spec (slice 4): **incident / change** — closer to real house work than sales or finance cards.

## Next — copy, not cards

If `/glassgraph` grows, use jobs, not a catalog.

Allowed: one short section like “People use it to map an incident, a research question, or a change.” Three jobs, house voice, no badges.

Not allowed: a browsable grid of 97 skills.

| Family | Honest use | Still not |
| --- | --- | --- |
| Engineering (debug, standup, deploy checklist, docs) | “Map the work around a release or an outage.” | Shipping those pages as products |
| Design (critique, handoff, UX copy, a11y) | “Keep research next to the decision.” | A design-skill store |
| Support (triage, escalation, customer research) | “Customer signal → evidence → next step.” | A support suite |
| Sales / marketing (pipeline, competitive, campaign) | Optional later copy if we ever serve that job | CRM / content factory |
| Data (explore, validate, dashboard) | Only if a board actually compares or traces data | A BI product |

## Later — second product, or opt-in connectors

Only after something can stand on its own. Live hub: “New products will be introduced when they are ready to stand on their own.”

| Family | Later means |
| --- | --- |
| Finance, legal, HR | Specialized maps if we ever serve those jobs. Not products now. |
| Slack / search connectors | Possible *after* GlassGraph’s own opt-in MCP is real. Do not badge them live. |
| A real toolkit | Skills *we* maintain, with proof. Not a scrape of Claude marketplace pages. |
| HoH / governed agents | Separate pie (`PIE_MAP_nemuriumhohplatform_20260722`). `NO_SHIP`. Do not advertise from this catalog. |

## Other GitHub work (do not collapse into this)

Public repos are other veins: JobForge, TransplantTracker, VibeForge-*, SyncSimp, Habbit, EstimateOS, Command-center, Scraper-OS. The vault also names EstimateOS, Blue Collar OS, VibeForge. This lane does not absorb them. GlassGraph is the public product. Those stay their own pies unless JT opens that lane.

## First-pass family calls

| Family | Count in archive | Call |
| --- | --- | --- |
| Agents | 9 | Never as products. Agent Factory owns how we make agents. |
| Engineering | 9 | Now / Next as maps and jobs |
| Design | 7 | Next as maps |
| Sales + Common Room | 10 | Next copy at most |
| Marketing | 8 | Next copy at most |
| Data | 8 | Next, only if the board job is real |
| Support | 5 | Next as signal maps |
| Finance | 7 | Later / Never as products |
| Operations | 9 | Now / Next as maps |
| Legal | 8 | Later |
| HR | 8 | Later |
| Productivity | 2 | Never as products (GlassGraph is the product) |
| Search | 5 | Now for synthesis; Later for connectors |
| Slack | 5 | Later, after our MCP exists |
| Apollo | 3 | Never |

102 pages. We classify families, then pull individuals only when writing a starter. That is the slice. A 102-row scorecard would be planning theater.

## How a future slice uses this

1. Pick one Now row.
2. Write the starter in GlassGraph words (nodes, edges, the gap). No Inter template.
3. Keep it off `dist-site` until slice 5 says otherwise.
4. If you cannot name the gap the map makes visible, it is not a starter — it is a leftover skill card.

# Standing orders from Nimish

Every session reads this before it starts work and follows it without being reminded. When Nimish gives a new
standing instruction, it is added here in the same turn. Newest at the top of each section.

## Data

- **Skills know the school.** Every skill's write and check prompts read one context row: Cornerstone School, Pune;
  Cambridge alongside NCF/NCERT; activity- and project-based learning; real-life activities drawn from everyday
  Indian middle-class life (home, kitchen, market, rupees, festivals, transport, family, local community). (16 Nov)
- **Skills are judged against the school's own work.** The activity skill is baselined on activities the school
  itself created (educator plans and documents): its suggestions must be close in nature to what the school does.
  (16 Nov)
- **Live, not lying in branches.** Data that is done goes to the live database straight away, marked machine-made.
  Coordinators (Maya, Akanksha, Nimish) check it weekly. No quality gate holds finished data back; fixes follow as
  updates to machine-made rows (a person's edit is never overwritten). (16 Nov)
- **Nothing empty.** No `needs_human`, no blanks. Where the source is thin, the best judgment goes in with
  confidence low and the assumption noted. Everything stays editable. (16 Nov)
- **The skills do the work.** From now on all curriculum content (objectives, activities, links, topics, checks)
  is made or fixed by the ten skills running on the server. Skills are tested and tuned on real reviewed data
  (held-out half) before they run; a skill is switched on only when it meets its bars. (16 Nov)
- **API credits, not the Claude plan.** All content generation, checking and skill scoring runs through the engine
  with the API key (cost recorded in `flow_run`). Claude sessions only build code, tests and eval sets; they never
  hand-write curriculum content. Every priced run is forecast first; CP-54 cap $100, stop at $99. (16 Nov)
- **Real sources first.** Activities already exist in each grade's Drive folders and the planning workbooks (every
  tab, every year, including hidden tabs). Read them before generating anything. (16 Nov)
- **The learning objective is the atom.** Evidence → LO → skill thread, topic → subject → grade, and one capability
  → capable / kind / unafraid. Grades in scope: K2 and G1–G4. (16 Nov)

## Working

- **Token-efficient.** Few, batched messages and reports; an orchestrator hands over to a fresh session at about
  60% context. (16 Nov)
- **Be systematic; no rework.** One stage at a time, each with a gate; no side-tracks. (16 Nov)
- **Status is live counts.** Say what is live now and what is not, with numbers read from the live database; never
  "built" for something not loaded. (16 Nov)
- **Lean CI.** One full CI per batch; no unnecessary tests. Nimish's time is not spent waiting. (16 Nov)
- **Don't make anything a bottleneck.** The mandate is to keep building. (16 Nov)

## Privacy

- Names stay in `pii`. No child names, feelings, health or family data in activities or prompts. The repository is
  public: no Cambridge wording, staff names or Drive account ids in git.

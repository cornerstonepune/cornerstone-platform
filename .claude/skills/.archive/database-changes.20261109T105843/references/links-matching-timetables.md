# Machine-made links, matching rules and timetables

- **Machine-made links.** Record the run on each row (`link_run uuid`, `link_rule text`, `linked_by`), and undo with `where link_run = $1`. After an undo, every row it touched must still appear on a list.
- **Matching rules.** Stop at the first rule that yields one or more candidates. Exactly one links; two or more are listed with a reason such as `several_matches` and never linked. A looser later rule must not link past a tie.
- **Timetables.** The fortnight is the unit of planning (Nimish, 8 Nov). Give every count a command or proof prints also per fortnight (`fortnight.number`, via `plan_entry.fortnight_id`, with `week_code` for week A/B). Reuse `fortnight`, `plan_entry.fortnight_id` and `week_code`; do not add a fortnight table.

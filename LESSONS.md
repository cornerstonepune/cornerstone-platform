# Lessons

_One line per failure, newest first. Written by the orchestrator whenever review fails, a ticket escalates, or Nimish corrects something. Reviewed monthly: a layer that keeps appearing is where to invest next._

| Date | What went wrong | Layer | Durable fix (file/rule/test added) |
|---|---|---|---|
| <date> | <one line> | spec · process · toolbox · proof | <what changed so it can't recur> |
| 2026-11-24 | Two `loop plan` jobs given a whole milestone (survey + milestone + tickets + seeds + PR) each hit CONTEXT FULL; ~20 min and double context-loading before one seed existed | process | One deliverable per `loop plan` job (one seed branch, or one ADR), briefed with the files and decisions already settled so it never re-surveys |

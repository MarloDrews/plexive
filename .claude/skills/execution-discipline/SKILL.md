---
name: execution-discipline
description: The standing execution discipline for this repository. It is not topical: it applies to every task here that changes a file, whatever the subject -- backend, frontend, mobile, CI, docs or notes. It also covers scope, so a question about whether something falls inside the current task is answered here. Load it before the first edit and follow it through to the final report.
---

# Execution Discipline

Applies to every task in this repository that changes a file.

- **Verify in both directions.** A guard is trusted once it has been seen to fail on the thing it
  exists to catch and pass on the thing it exists to allow. Report both.
- **Assert on a count.** Every check states how many things it found, and fails when that number is
  below what was observed while building it.
- **Open the file before describing it.** Every claim about code cites a file and a line that was
  read this session.
- **Measure rather than predict.** Every number in a report comes from a command run this session,
  and the report shows the command.
- **Implement exactly what the acceptance criteria name.** Where something outside them looks
  necessary, report it and let the user decide.
- **Reuse what is already there.** Name the existing module, pattern or helper being followed.
- **Stop and report when reality differs from the brief.** A contradiction is the most valuable
  thing a batch produces, and it survives only if it is carried back intact.
- **End every report with what contradicts the brief**, including the parts the user stated as fact.

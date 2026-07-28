# Issue tracker: Notion

Notion is authoritative for specs, milestones, boards, tickets, QA evidence, and completion state. GitHub is used for branches, commits, CI, and pull requests; do not mirror Notion cards into GitHub issues.

Use the `$mattpocock-skills:notion-tracker` skill for every tracker mutation.

## Project topology

- **Project page:** `https://www.notion.so/34f9db009ee581efb9cccd3927e1b8c9`
- **Milestones page:** `https://www.notion.so/34f9db009ee581ebab9fd5b94a98a567`
- **Research Notes page:** `https://www.notion.so/34f9db009ee581a5aa2bda401dd80e55`
- **Taskboards page:** `https://www.notion.so/35d9db009ee58031909ffdf2e28fd7ba`
- **Project Work database:** `https://www.notion.so/cbc62c9af551488996a15be37526df45`
- **Project Work data source:** `collection://c373c36f-7aa1-4068-aa77-d48104431134`
- **Active milestone page:** `https://www.notion.so/3759db009ee581af97f0cb2b8ae26c68`
- **Active milestone database:** `https://www.notion.so/2d89f23dd39648f196d15f7ea8734235`
- **Active milestone data source:** `collection://8bda40b4-641d-4b42-873e-5f2b6a7cecaf`

Fetch each target before use. Update this file only after verifying a moved or replaced target.

## Routing

- Single-session feature or maintenance task → one rich card on Project Work.
- Multi-session feature → milestone page under Milestones plus a dedicated board under Taskboards.
- Large, foggy effort → Notion wayfinder map and decision-ticket database, then `to-spec`.
- Sprint → informal grouping of one or two milestones; no tracker property.

## Board property mapping

The verified live property names are:

- Title: `Task`
- Work status: `Status`
- Milestone: `Milestone`
- Phase/area: `Phase`
- Priority: `Priority`
- Type: `Type`
- Acceptance summary: `Acceptance Criteria`
- Readable dependency summary: `Dependencies`
- Canonical blockers: `Blocked by`
- Canonical dependents: `Blocks`
- Triage: `Triage State`
- Category: `Category`
- Claim holder: `Owner`
- Git branch: `Branch`
- Pull request: `Pull Request`

Work status is `Not Started → In Progress → In QA → Completed`. Only explicit human QA approval permits `Completed`.

## Tracker operations

### Publish a spec

- Single-session: create or update a Project Work card containing the compact spec, acceptance criteria, scope, and QA guide.
- Multi-session: create or update a milestone page; do not create an implementation card for the whole milestone.

### Publish tickets

Create all approved tracer-bullet cards first. Set `Not Started`, `ready-for-agent`, and one category. Wire `Blocked by` relations in a second pass, verify the inverse `Blocks` values and write them explicitly if the connector did not, then synchronize the `Dependencies` summary.

### Fetch the frontier

List cards that are `Not Started`, `ready-for-agent`, unowned, and whose linked blockers are all `Completed`.

### Implement a ticket

Claim it with `Owner`, set `In Progress`, record the branch, and link the draft pull request at the first implementation write. Append implementation and automated evidence, then set `In QA`. On human rejection, return it to `In Progress`; on explicit human approval, set `Completed`.

### Triage

Keep `Triage State` and `Category` separate from `Status`. Planned tickets bypass triage and start `ready-for-agent`.

### Wayfinding

Create a map page plus a child decision-ticket database. Use ownership for claims, relations for blocking, and resolution content on the decision ticket. Hand the completed map to `to-spec`.

### Pull requests

Dedicated milestone work uses one draft pull request with task-level commits. Project Work uses one branch and pull request per card. Link every affected Notion card from the pull-request description and record the pull-request URL on each card.

## Migration rule

Do not normalize completed historical boards. For the current active board, add missing properties and backfill only exact, unique dependency-title matches. Preserve all existing statuses and page content.

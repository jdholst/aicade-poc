let snapshot = null;

const campaignFilter = document.querySelector("#campaign-filter");
const loopFilter = document.querySelector("#loop-filter");
const fixFilter = document.querySelector("#fix-filter");
const legacyFilter = document.querySelector("#legacy-filter");
campaignFilter.addEventListener("change", render);
loopFilter.addEventListener("change", render);
fixFilter.addEventListener("change", render);
legacyFilter.addEventListener("change", render);

async function refresh() {
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
    snapshot = await response.json();
    document.querySelector("#updated").textContent = new Date(snapshot.generatedAt).toLocaleTimeString();
    syncCampaignOptions();
    syncLoopOptions();
    render();
  } catch (error) {
    document.querySelector("#updated").textContent = error.message;
  }
}

function render() {
  if (!snapshot) return;
  const campaigns = selectedCampaigns();
  const attempts = campaigns.flatMap((campaign) =>
    campaign.attempts.map((attempt) => ({ ...attempt, campaignRunId: campaign.id }))
  );
  renderSummary(campaigns, attempts);
  renderLoops();
  renderMechanics();
  renderManualQa(attempts);
  renderStages(attempts);
  renderFailures(attempts);
  renderCampaigns(campaigns);
  renderAttempts(attempts);
  renderVariation(campaigns);
  renderFixes();
  renderLegacy();
}

function renderSummary(campaigns, attempts) {
  const successes = attempts.filter(isManuallyApprovedSuccess).length;
  const candidates = attempts.filter(({ status }) => status === "awaiting_manual_qa").length;
  const activeFixes = snapshot.temporaryFixes.filter(({ state }) => state === "active").length;
  const actualCalls = attempts.reduce((sum, attempt) =>
    sum + Object.values(attempt.providerCalls ?? {}).reduce((value, count) => value + count, 0), 0);
  const knownCost = attempts.reduce((sum, attempt) => sum + (attempt.cost?.usd ?? 0), 0);
  document.querySelector("#summary").innerHTML = [
    stat("Loops", snapshot.loops.length, `${snapshot.loops.filter(({ status }) => status === "achieved").length} achieved`),
    stat("Campaigns", campaigns.length, `${campaigns.filter(({ status }) => status === "achieved").length} achieved`),
    stat("Submissions", attempts.length, `${successes} manually approved · ${candidates} pending`),
    stat("Actual calls", actualCalls, "Planning + contract + source"),
    stat("Known cost", `$${knownCost.toFixed(3)}`, "Unknown cost excluded"),
    stat("Temporary fixes", activeFixes, `${snapshot.temporaryFixes.length - activeFixes} retired`),
  ].join("");
}

function renderManualQa(attempts) {
  const reviewed = attempts.filter(({ manualQaEvidence, manualQa }) => manualQaEvidence || manualQa);
  document.querySelector("#manual-qa").innerHTML = reviewed.map((attempt) => {
    const evidence = attempt.manualQaEvidence;
    const status = evidence?.status ?? attempt.manualQa.status;
    const reason = evidence?.denialReason;
    const note = evidence?.approvalNote;
    const sessions = evidence?.reviewSessions ?? [];
    const evidenceLinks = [
      `<a href="/artifacts/${encodeURIComponent(attempt.campaignRunId)}/${encodeURIComponent(attempt.id)}/manual-qa.json" target="_blank">manual-qa.json</a>`,
      ...sessions.flatMap((session) => (session.artifacts ?? []).map((file) =>
        `<a href="/artifacts/${encodeURIComponent(attempt.campaignRunId)}/${encodeURIComponent(attempt.id)}/${encodeURIComponent(file)}" target="_blank">${escapeHtml(file)}</a>`
      )),
    ].join(" · ");
    return `<tr>
      <td><strong>${escapeHtml(attempt.id)}</strong><br><small>${escapeHtml(attempt.campaignRunId)}</small></td>
      <td>${escapeHtml(attempt.cohort ?? evidence?.cohort ?? "unknown")}<br><small>${escapeHtml(attempt.promptId)}</small></td>
      <td><span class="badge ${status}">${escapeHtml(status)}</span></td>
      <td>${reason ? `<strong>Denied</strong><br><small>${escapeHtml(reason)}</small>` : note ? `<strong>Approved</strong><br><small>${escapeHtml(note)}</small>` : status === "approved" ? "Approved" : "Awaiting explicit verdict"}</td>
      <td>${sessions.map((session) => `${escapeHtml(session.id)} · ${escapeHtml(session.status)}${session.runtimeReady ? " · ready" : ""}`).join("<br>") || "Not opened"}</td>
      <td>${evidenceLinks}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6">${empty("No manual gameplay reviews yet.")}</td></tr>`;
}

function renderLoops() {
  const loops = loopFilter.value === "all"
    ? snapshot.loops
    : snapshot.loops.filter(({ id }) => id === loopFilter.value);
  document.querySelector("#loops").innerHTML = loops.map((loop) => {
    const step = loop.steps[loop.currentStepIndex] ?? loop.steps.at(-1);
    const fixes = loop.fixes ?? [];
    const proposedTemporary = fixes.filter(({ kind }) => kind === "temporary");
    const links = loop.campaignLinks.map(({ campaignRunId, role, status }) =>
      `<span class="evidence-line">${escapeHtml(role)} · ${escapeHtml(campaignRunId)} · ${escapeHtml(status)}</span>`
    ).join("");
    const fixLines = fixes.map((fix) =>
      `<span class="evidence-line"><a href="/artifacts/loops/${encodeURIComponent(loop.id)}/fixes/${encodeURIComponent(fix.id)}.json" target="_blank"><strong>${escapeHtml(fix.id)}</strong></a> · ${escapeHtml(fix.kind)}${fix.temporaryFixIds?.length ? ` · ${escapeHtml(fix.temporaryFixIds.join(", "))} · proposed/unmerged` : ""}</span>`
    ).join("");
    return `<tr>
      <td><strong>${escapeHtml(loop.manifestId)}</strong><br><small>${escapeHtml(loop.id)}</small><br><small>${escapeHtml(loop.worktree.branch)}</small></td>
      <td><span class="badge ${loop.status}">${escapeHtml(loop.status)}</span>${loop.result ? `<br><small>${loop.result.mechanicProven ? "mechanic proven" : "sequence only"}</small>` : ""}</td>
      <td>${step ? `${escapeHtml(step.cohort)}<br><small>${escapeHtml(step.status)} · cycle ${loop.currentRevision.cycle}</small>` : "complete"}</td>
      <td><code>${shortHash(loop.currentRevision.revisionKey)}</code></td>
      <td>${loop.usage.campaignRuns}/${loop.limits.maxCampaignRuns} campaigns<br>${loop.usage.submissions}/${loop.limits.maxSubmissions} submissions<br>${loop.usage.fixCycles}/${loop.limits.maxFixCycles} fixes</td>
      <td>${stageCounts(loop.usage.actualProviderCalls)}<br><small>remaining ${stageCounts(loop.remaining.actualProviderCalls)}</small></td>
      <td>${links}${fixLines || ""}${proposedTemporary.length ? `<small>${proposedTemporary.length} proposed temporary fix(es)</small>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7">${empty("No campaign loops yet.")}</td></tr>`;
}

function renderMechanics() {
  const items = snapshot.mechanics.map((mechanic) => `
    <article class="mechanic">
      <span class="badge ${mechanic.proven ? "active-proof" : "missing"}">${mechanic.proven ? "Proven" : "Not proven"}</span>
      <h3>${escapeHtml(mechanic.manifestId)}</h3>
      <small>${shortHash(mechanic.revisionKey)} · ${escapeHtml(mechanic.model)}</small>
      <div class="proof-row">
        ${proof("Discovery", mechanic.discovery)}
        ${proof("Repeatability", mechanic.repeatability)}
        ${proof("Variation", mechanic.variation)}
      </div>
    </article>`);
  document.querySelector("#mechanics").innerHTML = items.join("") || empty("No campaign proof yet.");
}

function renderStages(attempts) {
  const stageOrder = Object.keys(snapshot.stageSurvival);
  const localCounts = Object.fromEntries(stageOrder.map((stage, index) => [
    stage,
    attempts.filter(({ furthestStage }) => stageOrder.indexOf(furthestStage) >= index).length,
  ]));
  const max = Math.max(1, attempts.length);
  document.querySelector("#stages").innerHTML = stageOrder.map((stage) => `
    <div class="stage"><span>${humanize(stage)}</span><div class="bar"><i style="width:${localCounts[stage] / max * 100}%"></i></div><strong>${localCounts[stage]}</strong></div>
  `).join("");
}

function renderFailures(attempts) {
  const counts = attempts.filter(({ status }) => !["success", "awaiting_manual_qa"].includes(status)).reduce((result, attempt) => {
    result[attempt.classification ?? "unknown"] = (result[attempt.classification ?? "unknown"] ?? 0) + 1;
    return result;
  }, {});
  document.querySelector("#failures").innerHTML = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => `<div class="failure"><span>${escapeHtml(humanize(name))}</span><strong>${count}</strong></div>`)
    .join("") || empty("No failures in this selection.");
}

function renderCampaigns(campaigns) {
  document.querySelector("#campaigns").innerHTML = campaigns.map((campaign) => {
    const calls = campaign.attempts.reduce((total, attempt) => total + Object.values(attempt.providerCalls ?? {}).reduce((sum, value) => sum + value, 0), 0);
    return `<tr><td><strong>${escapeHtml(campaign.manifestId)}</strong><br><small>${escapeHtml(campaign.id)}</small></td><td>${escapeHtml(campaign.cohort)}</td><td>${modeText(campaign.providerModes)}</td><td><span class="badge ${campaign.status}">${escapeHtml(campaign.status)}</span></td><td>${campaign.result?.successes ?? 0}/${campaign.result?.submissions ?? campaign.attempts.length}</td><td>${calls}</td><td><code>${shortHash(campaign.revision.revisionKey)}</code></td></tr>`;
  }).join("") || `<tr><td colspan="7">${empty("No campaign runs yet.")}</td></tr>`;
}

function renderAttempts(attempts) {
  document.querySelector("#attempts").innerHTML = attempts.map((attempt) => {
    const links = (attempt.artifacts ?? []).map((file) => `<a href="/artifacts/${encodeURIComponent(attempt.campaignRunId)}/${encodeURIComponent(attempt.id)}/${encodeURIComponent(file)}" target="_blank">${escapeHtml(file)}</a>`).join(" · ");
    const manualStatus = attempt.manualQaEvidence?.status ?? attempt.manualQa?.status;
    return `<tr><td><strong>${escapeHtml(attempt.id)}</strong><br><small>${escapeHtml(attempt.campaignRunId)}</small></td><td>${escapeHtml(attempt.promptId)}</td><td><span class="badge ${attempt.status}">${escapeHtml(attempt.status)}</span>${manualStatus ? `<br><small>manual QA: ${escapeHtml(manualStatus)}</small>` : ""}</td><td>${escapeHtml(humanize(attempt.furthestStage))}</td><td>${escapeHtml(humanize(attempt.classification))}${attempt.failure ? `<br><small>${escapeHtml(attempt.failure)}</small>` : ""}</td><td>${formatDuration(attempt.durationMs)}</td><td>${links || "—"}</td></tr>`;
  }).join("") || `<tr><td colspan="7">${empty("No attempts in this selection.")}</td></tr>`;
}

function renderVariation(campaigns) {
  const ids = new Set(campaigns.map(({ id }) => id));
  const cohorts = snapshot.promptVariation.filter(({ campaignRunId }) => ids.has(campaignRunId));
  document.querySelector("#variation").innerHTML = cohorts.flatMap((cohort) => cohort.prompts.map((prompt) => `
    <article class="variation-card"><p class="eyebrow">${escapeHtml(cohort.manifestId)}</p><h3>${escapeHtml(humanize(prompt.promptId))}</h3><strong>${prompt.successes}/${prompt.submissions}</strong><small> successful submissions</small></article>
  `)).join("") || empty("No variation cohort has run yet.");
}

function renderFixes() {
  const selected = fixFilter.value;
  const fixes = snapshot.temporaryFixes.filter((fix) => selected === "all" || fix.state === selected);
  document.querySelector("#fixes").innerHTML = fixes.map((fix) => `
    <article class="fix"><span class="badge ${fix.state}">${escapeHtml(fix.state)}</span><h3>${escapeHtml(fix.id)} · ${escapeHtml(fix.title)}</h3><p>${escapeHtml(fix.status)}</p><details><summary>Replacement and removal</summary><p><strong>Replacement:</strong> ${escapeHtml(fix.robustReplacement ?? "Not recorded")}</p><p><strong>Removal:</strong> ${escapeHtml(fix.removalCriteria ?? "Not recorded")}</p></details></article>
  `).join("") || empty("No temporary fixes match this filter.");
}

function renderLegacy() {
  const selected = legacyFilter.value;
  const attempts = snapshot.legacyAttempts.filter((attempt) => selected === "all" || attempt.completeness === selected);
  document.querySelector("#legacy").innerHTML = attempts.map((attempt) => `
    <tr><td><strong>${escapeHtml(attempt.id)}</strong><br><span class="badge ${attempt.completeness}">${escapeHtml(attempt.completeness)}</span></td><td>${escapeHtml(attempt.recordedOutcome ?? "Unknown")}${attempt.adjudicatedOutcome ? `<br><small>Later: ${escapeHtml(attempt.adjudicatedOutcome)}</small>` : ""}</td><td>${escapeHtml(attempt.furthestStage ?? "Not recorded")}</td><td>${escapeHtml(attempt.classification ?? "Not recorded")}</td><td><code>${escapeHtml(attempt.source.path)}:${attempt.source.line}</code><br><small>${escapeHtml(attempt.source.heading)}</small></td></tr>
  `).join("");
}

function selectedCampaigns() {
  return campaignFilter.value === "all"
    ? snapshot.campaigns
    : snapshot.campaigns.filter(({ id }) => id === campaignFilter.value);
}

function syncCampaignOptions() {
  const previous = campaignFilter.value;
  campaignFilter.innerHTML = `<option value="all">All campaigns</option>${snapshot.campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id)}">${escapeHtml(campaign.manifestId)} · ${escapeHtml(campaign.cohort)}</option>`).join("")}`;
  if ([...campaignFilter.options].some(({ value }) => value === previous)) campaignFilter.value = previous;
}

function syncLoopOptions() {
  const previous = loopFilter.value;
  loopFilter.innerHTML = `<option value="all">All loops</option>${snapshot.loops.map((loop) => `<option value="${escapeHtml(loop.id)}">${escapeHtml(loop.manifestId)} · ${escapeHtml(loop.status)}</option>`).join("")}`;
  if ([...loopFilter.options].some(({ value }) => value === previous)) loopFilter.value = previous;
}

function stat(label, value, note) { return `<article class="stat"><p class="eyebrow">${label}</p><strong>${value}</strong><small>${note}</small></article>`; }
function proof(label, status) { return `<span class="${status}">${label}<br><strong>${escapeHtml(humanize(status))}</strong></span>`; }
function modeText(modes) { return Object.entries(modes).map(([stage, mode]) => `${stage[0].toUpperCase()}:${mode[0].toUpperCase()}`).join(" "); }
function shortHash(value = "") { return value.slice(0, 9); }
function humanize(value = "") { return value.replaceAll("_", " ").replaceAll("-", " "); }
function formatDuration(ms = 0) { return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`; }
function stageCounts(counts = {}) { return ["planning", "contract", "source"].map((stage) => `${stage[0].toUpperCase()}:${counts[stage] ?? 0}`).join(" "); }
function empty(message) { return `<p class="empty">${escapeHtml(message)}</p>`; }
function isManuallyApprovedSuccess(attempt) { return attempt.status === "success" && (attempt.manualQaEvidence?.status ?? attempt.manualQa?.status) === "approved"; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }

await refresh();
setInterval(refresh, 1000);

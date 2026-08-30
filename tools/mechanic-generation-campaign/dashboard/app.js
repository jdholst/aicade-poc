import { createKnownCostSummary, formatNanoUsd } from "./cost.js";

let snapshot = null;
let costTimeframe = "all";

const campaignFilter = document.querySelector("#campaign-filter");
const loopFilter = document.querySelector("#loop-filter");
const fixFilter = document.querySelector("#fix-filter");
const legacyFilter = document.querySelector("#legacy-filter");
const knowledgeFilters = [
  "status",
  "confidence",
  "applicability",
  "stage",
  "classification",
  "manifest",
].map((name) => document.querySelector(`#knowledge-${name}-filter`));
campaignFilter.addEventListener("change", render);
loopFilter.addEventListener("change", render);
fixFilter.addEventListener("change", render);
legacyFilter.addEventListener("change", render);
knowledgeFilters.forEach((filter) => filter.addEventListener("change", render));
document.querySelector("#summary").addEventListener("change", (event) => {
  if (event.target?.id !== "cost-timeframe") return;
  costTimeframe = event.target.value;
  render();
});

async function refresh() {
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
    snapshot = await response.json();
    document.querySelector("#updated").textContent = new Date(snapshot.generatedAt).toLocaleTimeString();
    syncCampaignOptions();
    syncLoopOptions();
    syncKnowledgeOptions();
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
  renderKnowledge();
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

function renderKnowledge() {
  const openFindingIds = new Set(
    [...document.querySelectorAll("details[data-knowledge-detail][open]")].map(
      ({ dataset }) => dataset.knowledgeDetail
    )
  );
  const reconciliationHistoryOpen = Boolean(
    document.querySelector("#knowledge-reconciliations details[open]")
  );
  const [status, confidence, applicability, stage, classification, manifest] =
    knowledgeFilters.map(({ value }) => value);
  const findings = snapshot.knowledge.canonical.entries.filter((finding) =>
    (status === "all" || finding.status === status) &&
    (confidence === "all" || finding.confidence === confidence) &&
    (applicability === "all" || finding.scope.applicability === applicability) &&
    (stage === "all" || finding.scope.stages.length === 0 || finding.scope.stages.includes(stage)) &&
    (classification === "all" || finding.scope.classifications.length === 0 || finding.scope.classifications.includes(classification)) &&
    (manifest === "all" || finding.scope.applicability === "pipeline_general" || finding.scope.manifestIds.includes(manifest))
  );
  document.querySelector("#knowledge").innerHTML = findings.map((finding) => `
    <article class="knowledge-card canonical">
      <div class="knowledge-card-heading"><strong>${escapeHtml(finding.id)} · r${finding.revision}</strong><span class="badge ${finding.status}">${escapeHtml(finding.status)}</span></div>
      <h3>${escapeHtml(finding.title)}</h3>
      <p>${escapeHtml(finding.guidance)}</p>
      <div class="knowledge-meta"><span>${escapeHtml(finding.confidence)}</span><span>${escapeHtml(humanize(finding.scope.applicability))}</span><span>${escapeHtml(finding.scope.stages.map(humanize).join(", ") || "any stage")}</span><span>${escapeHtml(finding.scope.classifications.map(humanize).join(", ") || "any classification")}</span></div>
      <details data-knowledge-detail="${escapeHtml(finding.id)}"${openFindingIds.has(finding.id) ? " open" : ""}><summary>Evidence and amendment history</summary>
        <div class="knowledge-evidence">${finding.evidence.map(renderKnowledgeEvidence).join("")}</div>
        ${(finding.amendments ?? []).map((amendment) => `<div class="knowledge-amendment"><strong>Revision ${amendment.revision} amended</strong><p>${escapeHtml(amendment.reason)}</p><small>Previous guidance: ${escapeHtml(amendment.previous.guidance)}</small></div>`).join("") || `<small>No amendments.</small>`}
      </details>
    </article>
  `).join("") || empty("No canonical findings match these filters.");

  document.querySelector("#knowledge-pending").innerHTML = snapshot.knowledge.pending.map((pending) => `
    <article class="pending-knowledge ${escapeHtml(pending.status)}">
      <span class="badge ${escapeHtml(pending.status)}">Loop-local ${escapeHtml(pending.status)}</span>
      <strong>${escapeHtml(pending.loopId)}</strong>
      <small>${pending.reason ? `${escapeHtml(pending.reason)}${pending.evidenceIds?.length ? ` · ${pending.evidenceIds.length} evidence item(s)` : ""}` : `${pending.findings.length} changed finding(s) · ${pending.reconciliationIds.map(escapeHtml).join(", ") || "uncommitted manifest change"}`}</small>
    </article>
  `).join("");

  const reconciliations = snapshot.knowledge.canonical.reconciliations;
  document.querySelector("#knowledge-reconciliations").innerHTML = `
    <details${reconciliationHistoryOpen ? " open" : ""}><summary>Canonical reconciliation history · ${reconciliations.length}</summary>
      ${reconciliations.map((entry) => `<div class="reconciliation"><strong>${escapeHtml(entry.id)}</strong><span>${escapeHtml(humanize(entry.source.kind))} · ${escapeHtml(entry.createdAt)}</span><small>${entry.operations.length} operation(s)${entry.noChangeReason ? ` · ${escapeHtml(entry.noChangeReason)}` : ""}</small></div>`).join("") || `<small>No reconciliation history.</small>`}
    </details>`;
}

function renderKnowledgeEvidence(evidence) {
  const label = `${evidence.id} · ${humanize(evidence.outcome)}`;
  let reference = `<span>${escapeHtml(label)} · reference unavailable</span>`;
  if (evidence.campaignRunId && evidence.attemptId) {
    reference = `<a href="/artifacts/${encodeURIComponent(evidence.campaignRunId)}/${encodeURIComponent(evidence.attemptId)}/attempt.json" target="_blank">${escapeHtml(label)}</a>`;
  } else if (evidence.loopId && evidence.fixId) {
    reference = `<a href="/artifacts/loops/${encodeURIComponent(evidence.loopId)}/fixes/${encodeURIComponent(evidence.fixId)}.json" target="_blank">${escapeHtml(label)}</a>`;
  }
  return `<div>${reference}<small>${escapeHtml(evidence.summary)}</small></div>`;
}

function renderSummary(campaigns, attempts) {
  const successes = attempts.filter(isManuallyApprovedSuccess).length;
  const candidates = attempts.filter(({ status }) => status === "awaiting_manual_qa").length;
  const activeFixes = snapshot.temporaryFixes.filter(({ state }) => state === "active").length;
  const actualCalls = attempts.reduce((sum, attempt) =>
    sum + Object.values(attempt.providerCalls ?? {}).reduce((value, count) => value + count, 0), 0);
  const knownCost = createKnownCostSummary(attempts, {
    timeframe: costTimeframe,
    now: new Date(snapshot.generatedAt),
  });
  document.querySelector("#summary").innerHTML = [
    stat("Loops", snapshot.loops.length, `${snapshot.loops.filter(({ status }) => status === "achieved").length} achieved`),
    stat("Campaigns", campaigns.length, `${campaigns.filter(({ status }) => status === "achieved").length} achieved`),
    stat("Submissions", attempts.length, `${successes} manually approved · ${candidates} pending`),
    stat("Actual calls", actualCalls, "Planning + contract + source"),
    costStat(knownCost),
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
    const extensionLines = (loop.budgetExtensions ?? []).map((extension) =>
      `<span class="evidence-line">extended · ${escapeHtml(extension.authorizationHash.slice(0, 12))} · revision ${extension.appliedAtRevision}</span>`
    ).join("");
    const repairLines = (loop.campaignRepairs ?? []).map((repair) =>
      `<span class="evidence-line">campaign repair · ${escapeHtml(repair.id)} · ${escapeHtml(repair.status)} · credited ${repair.creditedUsage.campaignRuns} campaign(s), ${repair.creditedUsage.submissions} submission(s)</span>`
    ).join("");
    const lifecycleLine = loop.lifecycle
      ? `<span class="evidence-line">${escapeHtml(loop.lifecycle.action)} from ${escapeHtml(loop.lifecycle.previousStatus)} · worktree and branch removed</span>`
      : "";
    const branch = loop.lifecycle ? `${loop.worktree.branch} · removed` : loop.worktree.branch;
    return `<tr>
      <td><strong>${escapeHtml(loop.manifestId)}</strong><br><small>${escapeHtml(loop.id)}</small><br><small>${escapeHtml(branch)}</small></td>
      <td><span class="badge ${loop.status}">${escapeHtml(loop.status)}</span>${loop.result ? `<br><small>${loop.result.mechanicProven ? "mechanic proven" : "sequence only"}</small>` : ""}</td>
      <td>${step ? `${escapeHtml(step.cohort)}<br><small>${escapeHtml(step.status)} · cycle ${loop.currentRevision.cycle}</small>` : "complete"}</td>
      <td><code>${shortHash(loop.currentRevision.revisionKey)}</code></td>
      <td>${loop.usage.campaignRuns}/${loop.limits.maxCampaignRuns} campaigns<br>${loop.usage.submissions}/${loop.limits.maxSubmissions} submissions<br>${loop.usage.fixCycles}/${loop.limits.maxFixCycles} fixes<br>${renderLoopCostBudget(loop)}</td>
      <td><small>Sparkline</small> ${stageCounts(loop.usage.actualProviderCalls)}<br><small>Gross ${stageCounts(loop.usage.grossActualProviderCalls ?? loop.usage.actualProviderCalls)}<br>remaining ${stageCounts(loop.remaining.actualProviderCalls)}</small></td>
      <td>${links}${fixLines}${repairLines}${extensionLines}${lifecycleLine}${proposedTemporary.length ? `<small>${proposedTemporary.length} proposed temporary fix(es)</small>` : ""}</td>
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
    const result = campaign.result ?? {};
    const failureProgress = result.failureLimit === undefined
      ? ""
      : `<br><small>${result.failures ?? 0}/${result.failureLimit} failures · ${result.remainingFailureTolerance ?? result.failureLimit} remaining</small>`;
    const replacementProgress = result.replacementSubmissions === undefined
      ? ""
      : `<br><small>${result.replacementSubmissions}/1 replacement used</small>`;
    const terminalReason = result.terminalReason === "failure_limit_reached"
      ? `<br><small>stopped: failure limit reached</small>`
      : result.terminalReason
        ? `<br><small>${escapeHtml(humanize(result.terminalReason))}</small>`
        : result.failureLimit === undefined
          ? ""
          : `<br><small>cohort continuing</small>`;
    return `<tr><td><strong>${escapeHtml(campaign.manifestId)}</strong><br><small>${escapeHtml(campaign.id)}</small></td><td>${escapeHtml(campaign.cohort)}</td><td>${modeText(campaign.providerModes)}</td><td><span class="badge ${campaign.status}">${escapeHtml(campaign.status)}</span>${terminalReason}</td><td>${result.successes ?? 0}/${result.submissions ?? campaign.attempts.length}${failureProgress}${replacementProgress}</td><td>${calls}</td><td>${renderCampaignCost(campaign)}</td><td><code>${shortHash(campaign.revision.revisionKey)}</code></td></tr>`;
  }).join("") || `<tr><td colspan="8">${empty("No campaign runs yet.")}</td></tr>`;
}

function renderAttempts(attempts) {
  document.querySelector("#attempts").innerHTML = attempts.map((attempt) => {
    const links = (attempt.artifacts ?? []).map((file) => `<a href="/artifacts/${encodeURIComponent(attempt.campaignRunId)}/${encodeURIComponent(attempt.id)}/${encodeURIComponent(file)}" target="_blank">${escapeHtml(file)}</a>`).join(" · ");
    const manualStatus = attempt.manualQaEvidence?.status ?? attempt.manualQa?.status;
    const submissionKind = attempt.submissionKind === "replacement"
      ? `<br><small>replacement for ${escapeHtml(attempt.replacementForPromptId)}</small>`
      : "";
    return `<tr><td><strong>${escapeHtml(attempt.id)}</strong><br><small>${escapeHtml(attempt.campaignRunId)}</small></td><td>${escapeHtml(attempt.promptId)}${submissionKind}</td><td><span class="badge ${attempt.status}">${escapeHtml(attempt.status)}</span>${manualStatus ? `<br><small>manual QA: ${escapeHtml(manualStatus)}</small>` : ""}</td><td>${escapeHtml(humanize(attempt.furthestStage))}</td><td>${escapeHtml(humanize(attempt.classification))}${attempt.failure ? `<br><small>${escapeHtml(attempt.failure)}</small>` : ""}</td><td>${formatDuration(attempt.durationMs)}</td><td>${links || "—"}</td></tr>`;
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

function syncKnowledgeOptions() {
  const findings = snapshot.knowledge.canonical.entries;
  syncKnowledgeFilter(knowledgeFilters[3], "All stages", findings.flatMap(({ scope }) => scope.stages));
  syncKnowledgeFilter(knowledgeFilters[4], "All classifications", findings.flatMap(({ scope }) => scope.classifications));
  syncKnowledgeFilter(knowledgeFilters[5], "All manifests", findings.flatMap(({ scope }) => scope.manifestIds));
}

function syncKnowledgeFilter(filter, label, values) {
  const previous = filter.value;
  const options = [...new Set(values)].sort();
  filter.innerHTML = `<option value="all">${label}</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(humanize(value))}</option>`).join("")}`;
  if ([...filter.options].some(({ value }) => value === previous)) filter.value = previous;
}

function stat(label, value, note) { return `<article class="stat"><p class="eyebrow">${label}</p><strong>${value}</strong><small>${note}</small></article>`; }
function costStat(cost) {
  const hasPricedEvidence = cost.pricedCalls > 0;
  const value = hasPricedEvidence ? formatNanoUsd(cost.totalNanoUsd) : "—";
  const exact = hasPricedEvidence ? formatNanoUsd(cost.exactNanoUsd) : "—";
  const estimate = hasPricedEvidence ? formatNanoUsd(cost.estimatedNanoUsd) : "—";
  return `<article class="stat cost-stat"><div class="stat-heading"><p class="eyebrow">Known cost</p><select id="cost-timeframe" aria-label="Known cost timeframe"><option value="day"${costTimeframe === "day" ? " selected" : ""}>Past 24 hours</option><option value="week"${costTimeframe === "week" ? " selected" : ""}>Past 7 days</option><option value="month"${costTimeframe === "month" ? " selected" : ""}>Past 30 days</option><option value="all"${costTimeframe === "all" ? " selected" : ""}>All time</option></select></div><strong>${value}</strong><small>Exact ${exact} · estimate ${estimate} · ${cost.unknownCalls} unknown call(s) excluded</small></article>`;
}
function renderCampaignCost(campaign) {
  const cost = campaign.cost;
  if (!cost || cost.pricedCalls === 0) return "—<br><small>unpriced</small>";
  const quality = cost.estimatedNanoUsd > 0
    ? cost.exactNanoUsd > 0 ? "mixed" : "estimated"
    : "exact";
  return `${formatNanoUsd(cost.totalNanoUsd)}<br><small>${quality} · ${cost.unknownCalls} unknown</small>`;
}
function renderLoopCostBudget(loop) {
  if (!loop.providerCost) return "<small>cost —</small>";
  const gross = loop.providerCost.grossExactNanoUsd + loop.providerCost.grossEstimatedNanoUsd;
  const attributed = loop.providerCost.attributedExactNanoUsd + loop.providerCost.attributedEstimatedNanoUsd;
  const pending = loop.providerCost.pendingReservations.reduce((sum, reservation) => sum + reservation.totalNanoUsd, 0);
  const limit = loop.limits.maxActualProviderCostNanoUsd;
  const remaining = loop.remaining.actualProviderCostNanoUsd;
  const overage = limit === undefined ? 0 : Math.max(0, gross + pending - limit);
  return `<small>cost gross ${formatNanoUsd(gross)} / ${formatNanoUsd(limit)}<br>attributed ${formatNanoUsd(attributed)} · remaining ${formatNanoUsd(remaining)}<br>exact ${formatNanoUsd(loop.providerCost.grossExactNanoUsd)} · estimate ${formatNanoUsd(loop.providerCost.grossEstimatedNanoUsd)} · pending ${formatNanoUsd(pending)} · over ${formatNanoUsd(overage)}</small>`;
}
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

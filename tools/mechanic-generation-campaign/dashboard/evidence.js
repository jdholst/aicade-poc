const content = document.querySelector("#evidence-content");
const updated = document.querySelector("#updated");
const loopId = new URLSearchParams(window.location.search).get("loop");

let renderedPayload = "";

async function refresh() {
  if (!loopId) {
    renderState("Missing loop", "Open this page from a loop’s View link, or add a loop query parameter.");
    updated.textContent = "No loop selected";
    return;
  }

  try {
    const response = await fetch(`/api/evidence?loop=${encodeURIComponent(loopId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      const title = response.status === 404 ? "Unknown loop" : "Evidence API error";
      renderState(title, payload.error ?? `Request failed with status ${response.status}.`);
      updated.textContent = `Request failed · ${new Date().toLocaleTimeString()}`;
      return;
    }

    const serialized = JSON.stringify({ ...payload, generatedAt: undefined });
    if (serialized !== renderedPayload) {
      const expandedIds = captureExpandedIds();
      const scrollY = window.scrollY;
      content.innerHTML = renderEvidence(payload);
      restoreExpandedIds(expandedIds);
      window.scrollTo({ top: scrollY, behavior: "instant" });
      renderedPayload = serialized;
    }
    updated.textContent = new Date(payload.generatedAt).toLocaleTimeString();
  } catch (error) {
    renderState("Evidence API error", error instanceof Error ? error.message : String(error));
    updated.textContent = `Request failed · ${new Date().toLocaleTimeString()}`;
  }
}

function renderEvidence(evidence) {
  const loop = evidence.loop;
  return `
    <section class="panel evidence-overview">
      <div class="evidence-overview-heading">
        <div>
          <p class="eyebrow">${escapeHtml(loop.manifestId)}</p>
          <h2>${escapeHtml(loop.id)}</h2>
          <p class="evidence-subtitle">${escapeHtml(loop.model)} · revision ${escapeHtml(shortHash(loop.currentRevision.revisionKey))}</p>
        </div>
        <div class="evidence-overview-actions">
          <span class="badge ${escapeHtml(loop.status)}">${escapeHtml(humanize(loop.status))}</span>
          <a href="${escapeHtml(loop.artifactUrl)}" target="_blank" rel="noreferrer">loop-run.json</a>
        </div>
      </div>
      <div class="evidence-summary-grid">
        ${summaryCard("Revision cycles", evidence.cycles.length, `Current cycle ${loop.currentRevision.cycle}`)}
        ${summaryCard("Campaigns", evidence.totals.campaigns, `${evidence.totals.unavailableCampaigns} unavailable`)}
        ${summaryCard("Submissions", evidence.totals.submissions, `${evidence.totals.successes} successes · ${evidence.totals.failures} failures`)}
        ${summaryCard("Manual QA", evidence.totals.manualQa.approved, `${evidence.totals.manualQa.denied} denied · ${evidence.totals.manualQa.pending} pending`)}
        ${summaryCard("Provider calls", evidence.totals.providerCalls.total, providerCallText(evidence.totals.providerCalls))}
      </div>
      <dl class="evidence-metadata">
        ${definition("Created", formatDate(loop.createdAt))}
        ${definition("Started", formatDate(loop.startedAt))}
        ${definition("Completed", formatDate(loop.completedAt))}
        ${definition("Base revision", shortHash(loop.baseRevisionKey))}
        ${definition("Proof", loop.result?.mechanicProven ? "Mechanic proven" : "Not proven")}
      </dl>
    </section>
    <section class="evidence-timeline" aria-label="Revision cycle evidence">
      ${evidence.cycles.map(renderCycle).join("") || renderEmptyTimeline()}
    </section>
  `;
}

function renderCycle(cycle) {
  const id = `cycle:${cycle.cycle}`;
  return `
    <details class="panel evidence-cycle" data-evidence-id="${escapeHtml(id)}" open>
      <summary>
        <span><span class="eyebrow">Revision cycle ${cycle.cycle}</span><strong>${escapeHtml(shortHash(cycle.revisionKey))}</strong></span>
        <small>${cycle.events.length} event${cycle.events.length === 1 ? "" : "s"}</small>
      </summary>
      <div class="evidence-cycle-events">
        ${cycle.events.map(renderEvent).join("") || '<p class="empty">No recorded evidence in this cycle.</p>'}
      </div>
    </details>
  `;
}

function renderEvent(event) {
  if (event.type === "campaign") return renderCampaign(event);
  if (event.type === "evidence_unavailable") return renderUnavailable(event);
  if (event.type === "fix") return renderFix(event);
  if (event.type === "campaign_repair") return renderRepair(event);
  if (event.type === "budget_extension") return renderBudgetExtension(event);
  if (event.type === "lifecycle") return renderLifecycle(event);
  return renderUnavailable({ ...event, reason: `Unsupported evidence event type ${event.type}.` });
}

function renderCampaign(event) {
  const title = event.role === "isolation"
    ? `Isolation · ${event.profileId ?? event.cohort}`
    : humanize(event.cohort);
  return `
    <article class="evidence-event campaign-event">
      ${eventHeader("Campaign", title, event.status, event.occurredAt)}
      <div class="evidence-event-grid">
        ${definition("Campaign", event.campaignRunId)}
        ${definition("Provider modes", providerModeText(event.providerModes))}
        ${definition("Revision", shortHash(event.revisionKey))}
        ${definition("Duration", formatDuration(event.durationMs))}
        ${definition("Submissions", `${event.submissions}`)}
        ${definition("Outcome", `${event.successes} success · ${event.failures} failure`)}
        ${definition("Manual QA", `${event.manualQa.approved} approved · ${event.manualQa.denied} denied · ${event.manualQa.pending} pending`)}
        ${definition("Provider calls", providerCallText(event.providerCalls))}
      </div>
      <div class="evidence-links"><a href="${escapeHtml(event.rawArtifactUrl)}" target="_blank" rel="noreferrer">campaign-run.json</a></div>
      <details class="evidence-attempts" data-evidence-id="${escapeHtml(`${event.id}:attempts`)}">
        <summary>Attempts <span>${event.attempts.length}</span></summary>
        <div class="evidence-attempt-list">
          ${event.attempts.map((attempt) => renderAttempt(event.campaignRunId, attempt)).join("") || '<p class="empty">No attempt artifacts were recorded.</p>'}
        </div>
      </details>
    </article>
  `;
}

function renderAttempt(campaignRunId, attempt) {
  const manualQa = attempt.manualQa;
  const reason = manualQa?.denialReason ?? attempt.failure;
  return `
    <details class="evidence-attempt" data-evidence-id="${escapeHtml(`attempt:${campaignRunId}:${attempt.id}`)}">
      <summary>
        <span><strong>${escapeHtml(attempt.id)}</strong><small>${escapeHtml(humanize(attempt.promptId))}</small></span>
        <span class="badge ${escapeHtml(attempt.status)}">${escapeHtml(humanize(attempt.status))}</span>
      </summary>
      <div class="evidence-attempt-body">
        <div class="evidence-event-grid">
          ${definition("Prompt variant", humanize(attempt.promptId))}
          ${definition("Furthest stage", humanize(attempt.furthestStage))}
          ${definition("Classification", humanize(attempt.classification))}
          ${definition("Duration", formatDuration(attempt.durationMs))}
          ${definition("Manual QA", manualQa ? humanize(manualQa.status) : "Not recorded")}
          ${definition("Provider calls", providerCallText(attempt.providerCalls))}
        </div>
        ${reason ? renderLongText("Failure or denial reason", reason, `${attempt.id}:reason`) : ""}
        ${manualQa?.approvalNote ? renderLongText("Approval note", manualQa.approvalNote, `${attempt.id}:approval`) : ""}
        <div class="evidence-links">${attempt.artifactLinks.map(renderArtifactLink).join("") || "No local artifacts"}</div>
      </div>
    </details>
  `;
}

function renderFix(event) {
  return `
    <article class="evidence-event fix-event">
      ${eventHeader("Fix checkpoint", event.fixId, event.kind, event.occurredAt)}
      <div class="evidence-event-grid">
        ${definition("Trigger", `${event.campaignRunId} · ${humanize(event.classification)}`)}
        ${definition("Revision", `${shortHash(event.revisionTransition.from)} → ${shortHash(event.revisionTransition.to)}`)}
        ${definition("Commit", event.commit ?? "Not recorded")}
        ${definition("Temporary fixes", event.temporaryFixIds.join(", ") || "None")}
      </div>
      ${renderLongText("Diagnosis", event.diagnosis, `${event.id}:diagnosis`)}
      ${renderDetailList("Changed files", event.changedFiles, `${event.id}:files`)}
      ${renderDetailList("Verification", event.verification, `${event.id}:verification`)}
      <div class="evidence-links"><a href="${escapeHtml(event.rawArtifactUrl)}" target="_blank" rel="noreferrer">raw fix JSON</a></div>
    </article>
  `;
}

function renderRepair(event) {
  return `
    <article class="evidence-event repair-event">
      ${eventHeader("Campaign repair", event.id.replace("repair:", ""), event.status, event.occurredAt)}
      <div class="evidence-event-grid">
        ${definition("Campaign", event.campaignRunId)}
        ${definition("Resume state", humanize(event.resumeStatus))}
        ${definition("Completed", formatDate(event.completedAt))}
        ${definition("Credited usage", creditedUsageText(event.creditedUsage))}
      </div>
      ${renderLongText("Repair reason", event.reason, `${event.id}:reason`)}
      <div class="evidence-links"><a href="${escapeHtml(event.rawArtifactUrl)}" target="_blank" rel="noreferrer">loop-run.json</a></div>
    </article>
  `;
}

function renderBudgetExtension(event) {
  return `
    <article class="evidence-event extension-event">
      ${eventHeader("Budget extension", shortHash(event.authorizationHash), event.status, event.occurredAt)}
      <div class="evidence-event-grid">
        ${definition("Previous state", humanize(event.previousStatus))}
        ${definition("Resume state", humanize(event.resumeStatus))}
        ${definition("Campaign capacity", formatAddition(event.additions?.maxCampaignRuns))}
        ${definition("Submission capacity", formatAddition(event.additions?.maxSubmissions))}
        ${definition("Provider capacity", providerCallText(event.additions?.actualProviderCalls ?? {}))}
      </div>
      <div class="evidence-links"><a href="${escapeHtml(event.rawArtifactUrl)}" target="_blank" rel="noreferrer">loop-run.json</a></div>
    </article>
  `;
}

function renderLifecycle(event) {
  return `
    <article class="evidence-event lifecycle-event">
      ${eventHeader("Loop lifecycle", humanize(event.action), event.status, event.occurredAt)}
      <div class="evidence-event-grid">
        ${definition("Previous state", humanize(event.previousStatus))}
        ${definition("Worktree removed", yesNo(event.worktreeRemoved))}
        ${definition("Branch removed", yesNo(event.branchRemoved))}
      </div>
      ${event.reason ? renderLongText("Reason", event.reason, `${event.id}:reason`) : ""}
      <div class="evidence-links"><a href="${escapeHtml(event.rawArtifactUrl)}" target="_blank" rel="noreferrer">loop-run.json</a></div>
    </article>
  `;
}

function renderUnavailable(event) {
  return `
    <article class="evidence-event unavailable-event">
      ${eventHeader("Evidence unavailable", event.campaignRunId ?? "Unknown artifact", "unavailable", event.occurredAt)}
      <p>${escapeHtml(event.reason ?? "The linked historical artifact could not be read.")}</p>
    </article>
  `;
}

function eventHeader(eyebrow, title, status, occurredAt) {
  return `<header class="evidence-event-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h3>${escapeHtml(title)}</h3></div><div><span class="badge ${escapeHtml(status)}">${escapeHtml(humanize(status))}</span><small>${escapeHtml(formatDate(occurredAt))}</small></div></header>`;
}

function renderLongText(label, text, id) {
  const value = String(text ?? "");
  const summary = value.length > 180 ? `${value.slice(0, 177)}…` : value;
  if (value.length <= 180) {
    return `<div class="evidence-copy"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>`;
  }
  return `<details class="evidence-copy" data-evidence-id="${escapeHtml(id)}"><summary><strong>${escapeHtml(label)}</strong><span>${escapeHtml(summary)}</span></summary><p>${escapeHtml(value)}</p></details>`;
}

function renderDetailList(label, values, id) {
  if (!values?.length) return "";
  return `<details class="evidence-copy" data-evidence-id="${escapeHtml(id)}"><summary><strong>${escapeHtml(label)}</strong><span>${values.length} item${values.length === 1 ? "" : "s"}</span></summary><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></details>`;
}

function renderArtifactLink(link) {
  return `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`;
}

function renderEmptyTimeline() {
  return '<section class="panel evidence-state"><p class="eyebrow">No events</p><h2>This loop has no recorded evidence yet.</h2></section>';
}

function renderState(title, message) {
  const key = `${title}:${message}`;
  if (renderedPayload === key) return;
  content.innerHTML = `<div class="panel evidence-state"><p class="eyebrow">Evidence</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><a class="nav-link" href="/">Return to dashboard</a></div>`;
  renderedPayload = key;
}

function captureExpandedIds() {
  const details = [...content.querySelectorAll("details[data-evidence-id]")];
  return {
    hadDetails: details.length > 0,
    ids: new Set(
      details
        .filter(({ open }) => open)
      .map((detail) => detail.dataset.evidenceId)
    ),
  };
}

function restoreExpandedIds(state) {
  for (const detail of content.querySelectorAll("details[data-evidence-id]")) {
    const isCycle = detail.classList.contains("evidence-cycle");
    detail.open = state.hadDetails ? state.ids.has(detail.dataset.evidenceId) : isCycle;
  }
}

function summaryCard(label, value, note) {
  return `<article class="stat"><p class="eyebrow">${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function definition(term, value) {
  return `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value ?? "Not recorded")}</dd></div>`;
}

function providerModeText(modes = {}) {
  return ["planning", "contract", "source"]
    .map((stage) => `${stage[0].toUpperCase()}:${modes[stage] ?? "unknown"}`)
    .join(" · ");
}

function providerCallText(calls = {}) {
  return `P:${calls.planning ?? 0} · C:${calls.contract ?? 0} · S:${calls.source ?? 0}`;
}

function creditedUsageText(usage = {}) {
  return `${usage.campaignRuns ?? 0} campaign · ${usage.submissions ?? 0} submission · ${providerCallText(usage.actualProviderCalls)}`;
}

function formatAddition(value) {
  return value === undefined ? "Not recorded" : `+${value}`;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDuration(value) {
  if (value === null || value === undefined) return "Not recorded";
  if (value < 1000) return `${value} ms`;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function shortHash(value) {
  const text = String(value ?? "unknown");
  return text.length > 12 ? text.slice(0, 12) : text;
}

function humanize(value) {
  if (!value) return "Not recorded";
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function yesNo(value) {
  return value === undefined ? "Not recorded" : value ? "Yes" : "No";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

refresh();
setInterval(refresh, 1000);

// Kalling Deal Desk front end.
// Listing text, owner messages and source URLs are untrusted, so this file never uses
// innerHTML with data: every value goes through textContent, and links allow https/http only.
"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  let CSRF = null, DEALS = [], FILTER = "all";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : String(k));
    return n;
  }
  function safeLink(url, label) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" || u.protocol === "http:")
        return el("a", { href: u.href, target: "_blank", rel: "noopener noreferrer" }, label || u.host + u.pathname);
    } catch (e) { /* not a URL */ }
    return document.createTextNode(String(url || ""));
  }
  const money = (v) => v == null ? "—" : "$" + (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v / 1e3) + "K");
  const when = (iso) => iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const STAGES = {
    ready_for_screening: ["Ready to screen", "ready"], screened_pass: ["Passes buy box", "pass"],
    screened_fail: ["Doesn't fit", "fail"], needs_info: ["Needs info", "info"], needs_refresh: ["Stale source", "info"], new: ["New", ""],
  };
  const FLAGS = { untrusted_instructions_detected: "Suspicious text", stale_retrieval: "Stale", old_listing: "Old listing", unparseable_financial: "Unreadable number" };
  const stage = (s) => el("span", { class: "stage " + (STAGES[s] || ["", ""])[1] }, (STAGES[s] || [s])[0]);

  function toast(msg, bad) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3800);
  }

  async function api(path, body) {
    const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": CSRF || "" }, body: JSON.stringify(body) };
    const r = await fetch(path, { credentials: "same-origin", ...opt });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== "/api/login") { showLogin(); throw new Error("Signed out"); }
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // Sign in ----------------------------------------------------------------
  function showLogin() { $("#login").hidden = false; $("#app").hidden = $("#tabs").hidden = $("#who").hidden = true; $("#secret").focus(); }
  function showApp(name) {
    $("#login").hidden = true; $("#app").hidden = $("#tabs").hidden = $("#who").hidden = false;
    $("#whoName").textContent = name; refreshAll();
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); $("#loginErr").textContent = "";
    try { const d = await api("/api/login", { secret: $("#secret").value }); CSRF = d.csrf; $("#secret").value = ""; showApp(d.admin); }
    catch (err) { $("#loginErr").textContent = err.message === "Admin authentication failed" ? "That secret didn't match." : err.message; }
  });
  $("#logout").addEventListener("click", async () => { await api("/api/logout", {}).catch(() => {}); CSRF = null; showLogin(); });

  // Tabs -------------------------------------------------------------------
  function show(view) {
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === view));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    ({ pipeline: loadPipeline, queue: loadQueue, jobs: loadJobs, activity: loadActivity })[view]();
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  function refreshAll() { loadPipeline(); loadQueue(); }

  // Pipeline ---------------------------------------------------------------
  async function loadPipeline() {
    const [s, d] = await Promise.all([api("/api/summary"), api("/api/deals")]);
    DEALS = d;
    const bb = s.buy_box;
    $("#bbPill").textContent = bb ? `Buy box v${bb.version} · ${bb.label}` : "No buy box set";
    $("#heroTitle").replaceChildren(document.createTextNode("Your pipeline, "), el("b", {}, "screened against your thesis."));
    $("#thesis").textContent = bb && bb.criteria.thesis ? bb.criteria.thesis.summary : "Set a buy box with set-buybox to start screening.";
    const c = s.deals;
    $("#stats").replaceChildren(
      el("div", { class: "stat lime" }, el("b", {}, c.screened_pass || 0), el("span", {}, "Pass your buy box")),
      el("div", { class: "stat blue" }, el("b", {}, s.pending_approvals), el("span", {}, "Waiting for your approval")),
      el("div", { class: "stat" }, el("b", {}, (c.needs_info || 0) + (c.needs_refresh || 0)), el("span", {}, "Need info or a fresh source")),
      el("div", { class: "stat" }, el("b", {}, s.flagged_listings), el("span", {}, "Flagged listings")),
    );
    $("#runSource").disabled = !s.sources.length;
    $("#runSource").title = s.sources.length ? "Sources: " + s.sources.join(", ") : "No approved sources yet";
    const q = $("#qCount"); q.textContent = s.pending_approvals || "";
    renderFilters(c, s.total_deals); renderDeals();
  }
  function renderFilters(c, total) {
    const opts = [["all", "All", total], ["screened_pass", "Pass", c.screened_pass], ["needs_info", "Needs info", c.needs_info],
      ["screened_fail", "Doesn't fit", c.screened_fail], ["needs_refresh", "Stale", c.needs_refresh], ["ready_for_screening", "To screen", c.ready_for_screening]];
    $("#filters").replaceChildren(...opts.filter((o) => o[0] === "all" || o[2]).map(([k, label, n]) =>
      el("button", { "aria-pressed": FILTER === k, on: { click: () => { FILTER = k; renderFilters(c, total); renderDeals(); } } }, `${label} · ${n || 0}`)));
  }
  function renderDeals() {
    const rows = DEALS.filter((d) => FILTER === "all" || d.state === FILTER);
    $("#dealsEmpty").hidden = DEALS.length > 0;
    $("#dealTable tbody").replaceChildren(...rows.map((d) => {
      const mult = d.asking_price && d.ebitda ? (d.asking_price / d.ebitda).toFixed(1) + "x" : "—";
      return el("tr", { class: "click", tabindex: 0, on: { click: () => openDeal(d.deal_id), keydown: (e) => e.key === "Enter" && openDeal(d.deal_id) } },
        el("td", {}, el("span", { class: "name" }, d.name), el("span", { class: "sub" }, [d.industry, d.location, d.sources > 1 ? `${d.sources} sources` : null].filter(Boolean).join(" · "))),
        el("td", {}, stage(d.state)),
        el("td", { class: "r" }, money(d.revenue)), el("td", { class: "r" }, money(d.ebitda)), el("td", { class: "r" }, money(d.asking_price)), el("td", { class: "r" }, mult),
        el("td", {}, d.flags.map((f) => el("span", { class: "flag" }, FLAGS[f] || f)), d.open_questions ? el("span", { class: "flag soft" }, `${d.open_questions} question${d.open_questions > 1 ? "s" : ""}`) : null));
    }));
  }
  async function run(path, label) {
    $("#runStatus").textContent = label + "…";
    try {
      const r = await api(path, {});
      const res = (await api("/api/jobs")).find((j) => j.job_id === r.job_id);
      const sum = res && res.result_json;
      $("#runStatus").textContent = r.status === "succeeded"
        ? (sum && "logged" in sum ? `Done: ${sum.logged} listings, ${sum.new_deals} new deals, ${sum.flagged} flagged.` : `Done: screened ${Object.keys(sum || {}).length} deals.`)
        : `Job ${r.status}. See Jobs.`;
      loadPipeline();
    } catch (e) { $("#runStatus").textContent = ""; toast(e.message, true); }
  }
  $("#runSource").addEventListener("click", () => run("/api/run/source", "Searching approved sources"));
  $("#runScreen").addEventListener("click", () => run("/api/run/screen", "Screening"));

  // Deal detail ------------------------------------------------------------
  async function openDeal(id) {
    const d = await api("/api/deals/" + id);
    const scr = d.screenings[d.screenings.length - 1];
    const model = d.models[d.models.length - 1];
    const flags = d.listings.flatMap((l) => l.flags_json.map((f) => ({ ...f, source: l.source })));
    const parts = [
      el("div", { class: "dhead" }, el("div", { class: "row" }, stage(d.deal.handoff_state), el("span", { class: "label" }, `Deal ${d.deal.deal_id} · v${d.deal.version}`)), el("h2", {}, d.deal.name)),
    ];
    if (flags.length) parts.push(el("div", { class: "warn" }, el("b", {}, "Flags. "), flags.map((f) => `${FLAGS[f.flag] || f.flag} (${f.source})`).join(" · "),
      flags.some((f) => f.flag === "untrusted_instructions_detected") ? el("div", {}, "This listing contains text that looks like instructions. It was stored as data and did not change anything.") : null));
    if (scr) parts.push(el("div", { class: "panel" },
      el("h3", {}, el("span", { class: "who-tag ai" }, "Analyst"), `Screening: ${scr.overall}`, el("span", { class: "label" }, `against buy box v${scr.buy_box_version} · ${when(scr.created_at)}`)),
      scr.results_json.map((r) => el("div", { class: "crit" }, el("b", {}, r.criterion.replace(/_/g, " ")), el("span", { class: "res " + r.result }, r.result), el("span", { class: "ev" }, r.evidence)))));
    parts.push(el("div", { class: "panel" }, el("h3", {}, el("span", { class: "who-tag src" }, "Reported"), "What the sources say"),
      el("table", { class: "facts" }, el("tbody", {}, Object.entries(d.reported).flatMap(([k, vals]) => vals.map((v) =>
        el("tr", {}, el("td", {}, k.replace(/_/g, " ")), el("td", { class: "r" }, typeof v.value === "number" && v.value > 1e4 ? money(v.value) : String(v.value)),
          el("td", { class: "src" }, safeLink(v.source_url)), el("td", { class: "label" }, when(v.retrieved_at)))))))));
    if (Object.keys(d.calculated).length) parts.push(el("div", { class: "panel" }, el("h3", {}, el("span", { class: "who-tag ai" }, "Calculated"), "From reported figures"),
      el("table", { class: "facts" }, el("tbody", {}, Object.entries(d.calculated).map(([k, v]) => {
        const x = v[v.length - 1].value;
        return el("tr", {}, el("td", {}, k.replace(/_/g, " ")), el("td", { class: "r" }, k.includes("margin") ? (x * 100).toFixed(1) + "%" : k.includes("multiple") ? x.toFixed(2) + "x" : String(x)));
      })))));
    if (model && model.built) {
      const c = model.calculated, a = model.assumptions;
      parts.push(el("div", { class: "panel" }, el("h3", {}, el("span", { class: "who-tag ai" }, "Model"), "Returns scenario"),
        el("p", { class: "label" }, c.label),
        el("div", { class: "model" },
          el("div", { class: "k blue" }, el("b", {}, c.moic + "x"), el("span", {}, "Equity multiple (MOIC)")),
          el("div", { class: "k" }, el("b", {}, (c.irr * 100).toFixed(1) + "%"), el("span", {}, "IRR")),
          el("div", { class: "k" }, el("b", {}, money(c.entry_equity)), el("span", {}, "Equity in"))),
        el("p", { class: "label" }, `Assumptions you set (not facts): ${Math.round(a.debt_pct * 100)}% debt at ${(a.interest_rate * 100).toFixed(0)}%, ` +
          `${(a.ebitda_growth * 100).toFixed(0)}% EBITDA growth, ${a.exit_multiple}x exit after ${a.hold_years} years. ` +
          `Inputs: asking ${money(model.reported_inputs.asking_price)}, EBITDA ${money(model.reported_inputs.ebitda)} (reported).`)));
    } else if (model) parts.push(el("div", { class: "panel" }, el("h3", {}, "Model not built"), el("p", { class: "label" }, model.reason)));
    if (d.questions.length) parts.push(el("div", { class: "panel" }, el("h3", {}, el("span", { class: "who-tag you" }, "Open"), "Questions to resolve"),
      el("ul", {}, d.questions.map((q) => el("li", {}, q.text)))));
    if (d.notes.length) parts.push(el("div", { class: "panel" }, el("h3", {}, "Working notes", el("span", { class: "label" }, "Private, not deal facts")),
      d.notes.map((n) => el("p", { class: "label" }, `${n.agent}: ${n.body}`))));
    parts.push(el("div", { class: "panel" }, el("h3", {}, "Source listings", el("span", { class: "label" }, "Shown as untrusted text")),
      d.listings.map((l) => el("div", {}, el("div", { class: "row" }, el("b", {}, `${l.source} · ${l.external_id}`), safeLink(l.source_url), el("span", { class: "label" }, "retrieved " + when(l.retrieved_at))),
        el("pre", { class: "raw" }, [l.raw_json.title, l.raw_json.description].filter(Boolean).join("\n\n"))))));
    parts.push(el("div", { class: "panel" }, el("h3", {}, "Version history"),
      d.history.map((h) => el("div", { class: "label" }, `v${h.version} · ${h.state} · ${h.actor} · ${when(h.at)}`))));
    $("#detail").replaceChildren(...parts);
    $("#drawer").hidden = false; $("#closeDrawer").focus();
  }
  $("#closeDrawer").addEventListener("click", () => ($("#drawer").hidden = true));
  document.addEventListener("keydown", (e) => e.key === "Escape" && ($("#drawer").hidden = true));

  // Approvals --------------------------------------------------------------
  const KIND = { email_outreach: "Email to owner", slack_reply: "Slack reply", meeting_request: "Meeting request", listing_response: "Listing response", paid_service: "Paid service" };
  async function loadQueue() {
    const items = await api("/api/queue");
    $("#qCount").textContent = items.length || "";
    $("#queueEmpty").hidden = items.length > 0;
    $("#queueList").replaceChildren(...items.map((it) => {
      const p = it.payload, a = it.audience;
      const to = a.to ? a.to.join(", ") : a.channel ? `Slack ${a.channel} (${(a.members || []).length} members)` : "—";
      const text = p.body || p.text || "";
      return el("article", { class: "qcard" },
        el("div", { class: "meta" }, el("span", { class: "pill" }, KIND[it.kind] || it.kind), `from ${it.requested_by} · ${when(it.created_at)}`, it.cost_estimate ? ` · est. $${it.cost_estimate}` : ""),
        el("div", { class: "to" }, el("b", {}, "To: "), to, p.subject ? el("div", {}, el("b", {}, "Subject: "), p.subject) : null),
        p.note ? el("div", { class: "note" }, p.note) : null,
        text ? el("pre", {}, text) : el("p", { class: "label" }, "No text yet. Write the reply with review.approve_reply."),
        el("div", { class: "row" },
          el("button", { class: "btn lime", disabled: !text, on: { click: () => decide(it, "approve") } }, "Approve"),
          el("button", { class: "btn danger", on: { click: () => decide(it, "reject") } }, "Reject")));
    }));
  }
  async function decide(it, what) {
    try {
      const r = await api(`/api/actions/${it.action_id}/${what}`, { version: it.version });
      toast(what === "approve" ? "Approved. " + (r.note || "") : "Rejected.");
      loadQueue();
    } catch (e) { toast(e.message, true); loadQueue(); }
  }

  // Jobs -------------------------------------------------------------------
  async function loadJobs() {
    const js = await api("/api/jobs");
    const act = (j, w) => el("button", { class: "btn sm" + (w === "cancel" ? " danger" : ""), on: { click: async () => {
      try { await api(`/api/jobs/${j.job_id}/${w}`, {}); toast(`${w[0].toUpperCase() + w.slice(1)} requested.`); loadJobs(); } catch (e) { toast(e.message, true); } } } }, w);
    $("#jobTable tbody").replaceChildren(...js.map((j) => el("tr", {},
      el("td", {}, el("span", { class: "name" }, j.kind === "sourcing.run" ? "Sourcing" : j.kind === "analyst.screen_ready" ? "Screening" : j.kind), el("span", { class: "sub" }, j.job_id)),
      el("td", {}, el("span", { class: "stage " + ({ succeeded: "pass", failed: "fail", cancelled: "fail", paused: "info", retry_wait: "info", running: "ready", queued: "ready" }[j.status] || "") }, j.status)),
      el("td", { class: "r" }, j.progress), el("td", { class: "r" }, `${j.attempts}/${j.max_attempts}`),
      el("td", { class: "label" }, j.last_error || (j.result_json ? JSON.stringify(j.result_json).slice(0, 80) : "")),
      el("td", { class: "label" }, when(j.updated_at)),
      el("td", {}, ["running", "queued", "retry_wait"].includes(j.status) ? [act(j, "pause"), act(j, "cancel")] : j.status === "paused" ? [act(j, "resume"), act(j, "cancel")] : null))));
  }

  // Activity ---------------------------------------------------------------
  async function loadActivity() {
    const ev = await api("/api/activity");
    $("#log").replaceChildren(...ev.map((e) => el("li", {}, el("span", { class: "label" }, when(e.at)), el("span", {}, e.actor),
      el("div", {}, el("div", { class: "ev" + (/blocked|refused|failed|flagged|rejected/.test(e.event) ? " bad" : "") }, e.event),
        el("div", { class: "det" }, JSON.stringify(e.detail))))));
  }

  // Boot -------------------------------------------------------------------
  api("/api/session").then((s) => { if (s.signed_in) { CSRF = s.csrf; showApp(s.admin); } else showLogin(); }).catch(showLogin);
})();

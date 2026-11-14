// Guided missions inside the viewer. AI-assisted code (Claude Code).
// Reads Blink's state (App.S, F, motion(), catalogueCheck(), changes()) and drives it only through the
// public App hub (goTo, setPick, render). It never changes how Blink measures or draws anything.
"use strict";

(() => {
  if (typeof App === "undefined" || typeof Missions === "undefined") return;
  const M = Missions;
  const STICKY = new Set(["open", "watch", "long", "compare", "diff", "curve"]);   // once done, stays done
  let team = null;                     // team backend targets by key; false if the backend did not answer
  M.teamTargets().then(t => { team = t; App.render(); }).catch(() => { team = false; App.render(); });

  // ---------- panel in the Bands × visits column ----------
  const card = document.createElement("section");
  card.id = "mission"; card.className = "mission"; card.setAttribute("aria-label", "Guided mission");
  const rule = document.createElement("hr"); rule.className = "div";
  $("navigator").prepend(card, rule);

  const current = () => { const a = M.active(); const m = a && M.LIST.find(x => x.id === a.id); return m ? { a, m } : null; };
  const atField = m => Math.abs(S.ra - m.ra) < 1e-4 && Math.abs(S.dec - m.dec) < 1e-4;
  const loaded = () => !!S.stacks[S.det] && !S.state && !!S.meta?.epochs?.length;
  const teamOf = m => (team && team[m.key]) || null;
  const fieldTarget = m => teamOf(m) || { ra: m.ra, dec: m.dec, pmra: null, pmdec: null };
  const markEpoch = () => (F.anchor ?? S.ep);
  const markYear = () => mjdYear(S.meta.epochs[markEpoch()]?.mjd ?? S.meta.epochs[S.ep].mjd);
  function markSep(m) {
    if (!F.marked || !S.pick || !S.meta?.epochs?.length) return null;
    return M.sepArcsec(S.pick, M.expectedAt(fieldTarget(m), markYear()));
  }
  const markHit = m => { const d = markSep(m); return d != null && d <= M.MARK_TOLERANCE; };
  function longShortLong(seq) {        // a long band, then a short one, then a long one again
    const i = seq.findIndex(d => d >= 5); if (i < 0) return false;
    const j = seq.findIndex((d, k) => k > i && d <= 2); if (j < 0) return false;
    return seq.some((d, k) => k > j && d >= 5);
  }

  function stepDone(m, a, id) {
    if (STICKY.has(id) && a.done?.includes(id)) return true;
    const ok = loaded() && atField(m);
    switch (id) {
      case "open": return ok;
      case "watch": return ok && F.watched;
      case "long": return ok && S.det >= 5;
      case "compare": return ok && longShortLong(a.seq || []);
      case "diff": return ok && S.mode === "diff";
      case "mark": return ok && markHit(m) && (m.id !== "wise0855" || S.det >= 5);
      case "moved": return ok && markHit(m) && !!motion()?.moved;
      case "check": { const c = ok && markHit(m) && catalogueCheck(); return !!c && !c.loading; }
      case "curve": return !!a.curveOpened;
      default: return false;
    }
  }
  function track(m, a) {               // remember sticky steps and the order of the bands looked at
    let changed = false;
    if (loaded() && atField(m)) {
      a.seq ||= [];
      if (a.seq[a.seq.length - 1] !== S.det) { a.seq.push(S.det); changed = true; }
    }
    a.done ||= [];
    for (const s of m.steps) if (STICKY.has(s.id) && !a.done.includes(s.id) && stepDone(m, a, s.id)) { a.done.push(s.id); changed = true; }
    if (changed) M.setActive(a);
  }

  function renderIdle() {
    const here = M.LIST.find(atField), res = M.progress().results;
    const doneN = M.LIST.filter(x => res[x.id]).length;
    card.innerHTML = here
      ? `<p class="t-micro c-3">Guided mission available</p>
         <p class="t-label">Mission ${here.n} · ${esc(here.nick)}</p>
         <p class="t-caption c-2">${esc(here.mission)} Learn: ${esc(here.skill.toLowerCase())}.</p>
         <div class="row"><button type="button" class="pill sm primary" data-act="start" data-id="${here.id}">${ico("target", 14)}Start mission</button><a class="t-caption c-3 mlink" href="/missions">All missions</a></div>`
      : `<p class="t-micro c-3">New to SPHEREx?</p>
         <p class="t-caption c-2">Five guided missions teach blink, bands, difference images and light curves on the challenge targets.</p>
         <div class="row"><a class="pill sm" href="/missions">${ico("target", 14)}Guided missions</a><span class="t-caption c-3">${doneN} of ${M.LIST.length} done</span></div>`;
  }

  function renderActive(m, a) {
    const steps = m.steps.map(s => ({ ...s, done: stepDone(m, a, s.id) }));
    const cur = steps.findIndex(s => !s.done), allDone = cur < 0, away = !atField(m);
    const sep = markSep(m), prev = M.progress().results[m.id];
    const markNote = steps[cur]?.id === "mark" && F.marked && sep != null && sep > M.MARK_TOLERANCE
      ? `<p class="t-caption warnline">${ico("alert", 12)}Your marker is ${sep.toFixed(0)}″ from where the catalogue puts ${esc(m.target)} at this visit. Try another source.</p>` : "";
    card.innerHTML = `
      <div class="row between"><p class="t-micro c-3">Mission ${m.n} of ${M.LIST.length} · ${esc(m.skill)}</p>${prev ? `<span class="mtag ${prev.outcome}">${M.OUTCOME[prev.outcome]}</span>` : ""}</div>
      <div><p class="t-label">${esc(m.nick)}</p><p class="t-caption c-3">${esc(m.target)} · ${esc(m.object)}</p></div>
      ${away ? `<div class="mwarn"><p class="t-caption">You have left the mission field.</p><button type="button" class="pill sm" data-act="return">Return to ${esc(m.target)}</button></div>` : ""}
      <ol class="msteps">${steps.map((s, i) => `<li class="${s.done ? "done" : i === cur ? "cur" : ""}"><i>${s.done ? ico("check", 10) : i + 1}</i><div><span class="t-caption">${esc(s.text)}</span>${i === cur ? `<span class="t-caption c-3 hint">${esc(s.hint)}</span>` : ""}</div></li>`).join("")}</ol>
      ${markNote}
      ${m.id === "rdra" || m.id === "epsindb" ? `<button type="button" class="pill sm" data-act="${m.id === "rdra" ? "curve" : "tspec"}">${ico("chart", 14)}${m.id === "rdra" ? "Team light curve" : "Team pipeline spectrum"}</button>` : ""}
      <details class="mwhy"><summary class="t-caption">Why this matters</summary><p class="t-caption c-2">${esc(m.why)}</p></details>
      <div class="row between"><button type="button" class="pill sm ${allDone ? "primary" : ""}" data-act="report" ${allDone ? "" : "disabled"}>${ico("check", 14)}File your report</button><button type="button" class="t-caption c-3" data-act="leave">Leave mission</button></div>`;
  }

  let lastSig = "";
  function update() {
    const c = current();
    document.body.classList.toggle("mission-on", !!c);
    if (c) track(c.m, c.a);
    const sig = c
      ? [c.m.id, atField(c.m), loaded(), S.det, S.mode, F.watched, F.marked, S.pick?.ra, S.pick?.dec, F.anchor, !!motion()?.moved,
         catalogueCheck()?.loading, (c.a.done || []).join(), (c.a.seq || []).join(), !!c.a.curveOpened, team ? 1 : team === false ? 0 : -1].join("|")
      : `idle|${S.ra}|${S.dec}`;
    if (sig === lastSig) return;
    lastSig = sig;
    const whyOpen = card.querySelector("details")?.open;
    c ? renderActive(c.m, c.a) : renderIdle();
    if (whyOpen) card.querySelector("details")?.setAttribute("open", "");
  }
  App.on("render", update);

  card.addEventListener("click", ev => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const c = current(), act = b.dataset.act;
    if (act === "start") { M.setActive({ id: b.dataset.id, seq: [], done: [], started: Date.now() }); lastSig = ""; App.render(); }
    else if (act === "leave") { M.clearActive(); lastSig = ""; App.render(); }
    else if (act === "return" && c) { S.fov = 240; App.goTo(c.m.ra, c.m.dec, c.m.det); }
    else if (act === "report" && c) openReport(c.m, c.a);
    else if (act === "curve" && c) openCurve(c.m, c.a);
    else if (act === "tspec" && c) openTeamSpectrum(c.m);
  });

  // ---------- our own modal (Blink's #modal belongs to discover.js) ----------
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap"; wrap.id = "mmodal"; wrap.hidden = true;
  document.body.append(wrap);
  const closeM = () => { wrap.hidden = true; wrap.innerHTML = ""; };
  function openM(html, wide) {
    wrap.innerHTML = `<div class="modal ${wide ? "mwide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    wrap.hidden = false;
    wrap.querySelector("button, [tabindex]")?.focus();
  }
  wrap.addEventListener("keydown", ev => { ev.stopPropagation(); if (ev.key === "Escape") closeM(); });   // keep Blink's shortcuts out
  wrap.addEventListener("click", ev => { if (ev.target === wrap || ev.target.closest("[data-act='mclose']")) closeM(); });

  // ---------- evidence measured in the images ----------
  function baseline() {
    const st = S.stacks[S.det], eps = S.meta?.epochs || [];
    const have = (st?.epochs || []).map((e, i) => (e.img ? i : -1)).filter(i => i >= 0);
    if (have.length < 2) return { years: 0, first: null, last: null };
    const a = eps[have[0]], b = eps[have[have.length - 1]];
    return { years: (b.mjd - a.mjd) / 365.25, first: a, last: b, n: have.length };
  }
  function brightnessFromChanges(m) {   // Blink's change list (first visit against last) near the target
    const c = changes();
    if (!c || c.single) return { verdict: null };
    const exp = M.expectedAt(fieldTarget(m), mjdYear(S.meta.epochs[c.b].mjd));
    const row = c.rows.find(r => M.sepArcsec(r, exp) <= 12 && r.kind !== "Moved");
    return row ? { verdict: true, row, a: S.meta.epochs[c.a], b: S.meta.epochs[c.b] }
      : { verdict: false, a: S.meta.epochs[c.a], b: S.meta.epochs[c.b] };
  }

  function openReport(m, a) {
    openM(`<div class="mb"><p class="t-micro c-3">Mission ${m.n} · report</p><h2 class="t-title">${esc(m.chipsQ)}</h2>
      <p class="t-caption c-3">Base the answer on what you saw and on the Marked source panel. There is a right answer, and “Not sure” is an honest one.</p>
      <div class="mchips" role="radiogroup">${M.CHIPS.map(c => `<button type="button" class="mchip" role="radio" aria-checked="false" data-chip="${c.id}"><span class="t-label">${c.label}</span><span class="t-caption c-3">${c.cap}</span></button>`).join("")}</div>
      </div><div class="mf"><button type="button" data-act="mclose">Cancel</button><button type="button" class="pri" data-act="submit" disabled>Submit</button></div>`);
    let chip = null;
    wrap.onclick = ev => {
      const c = ev.target.closest("[data-chip]");
      if (c) { chip = c.dataset.chip; wrap.querySelectorAll("[data-chip]").forEach(x => x.setAttribute("aria-checked", String(x === c))); wrap.querySelector("[data-act='submit']").disabled = false; }
      if (ev.target.closest("[data-act='submit']") && chip) { wrap.onclick = null; submit(m, a, chip); }
    };
  }

  async function submit(m, a, chip) {
    const t = teamOf(m), base = baseline(), mo = motion(), hit = markHit(m), cat = catalogueCheck();
    let bright = { verdict: null };
    if (m.kind === "varies") {
      bright = brightnessFromChanges(m);
      if (m.id === "rdra" && a.curve?.verdict != null) bright = { verdict: a.curve.verdict, curve: a.curve };
    }
    const pm = t ? M.pmTotal(t) : 0;
    const key = M.answerKey({ pm, years: base.years, brightness: bright.verdict });
    const outcome = M.evaluate(key, chip, hit);
    const rec = { outcome, chip, truth: key.truth, markHit: hit, at: new Date().toISOString(),
      shift: mo && !mo.none && !mo.faint ? { arcsec: +mo.shift.toFixed(2), err: +mo.err.toFixed(2), moved: !!mo.moved, rate: mo.rate } : null };
    M.saveResult(m.id, rec);
    a.reported = true; M.setActive(a);
    debrief(m, { t, base, mo, hit, cat, bright, key, outcome, chip, pm });
    lastSig = ""; App.render();
  }

  function debrief(m, d) {
    const px = v => `${(v / M.ARCSEC_PIX).toFixed(1)} px`;
    const rows = [];
    if (d.t) rows.push(["Catalogue motion (team backend, SIMBAD)", d.pm > 0.05 ? `${d.pm.toFixed(2)}″/yr` : "none measurable"]);
    if (d.base.years > 0) rows.push(["Time between first and last visit", `${d.base.years.toFixed(2)} yr (${d.base.n} visits, D${S.det})`]);
    if (d.t && d.base.years > 0 && d.pm > 0.05) rows.push(["Expected shift over that time", `${d.key.expectedShift.toFixed(1)}″ = ${px(d.key.expectedShift)}`]);
    if (d.mo && !d.mo.none && !d.mo.faint && d.mo.pts?.length > 1) rows.push(["Measured by Blink in the images", `${d.mo.shift.toFixed(1)}″ ± ${d.mo.err.toFixed(1)}″${d.mo.moved ? " (steady shift)" : d.mo.jumpy ? " (jumps, not steady)" : " (not significant)"}`]);
    if (d.cat?.best) rows.push(["Catalogue match at your marker", `${d.cat.best.name === "gaia" ? "Gaia DR3" : "CatWISE2020"}, ${d.cat.best.d.toFixed(1)}″ away`]);
    if (d.bright.row) rows.push(["Change list, first vs last visit", `${d.bright.row.kind} ${d.bright.row.amount || ""} (${esc(d.bright.a.label)} → ${esc(d.bright.b.label)})`]);
    else if (d.bright.verdict === false) rows.push(["Change list, first vs last visit", "no brightness change above 8σ at the target"]);
    if (d.bright.curve) rows.push(["Team light curve", `${d.bright.curve.ratio.toFixed(2)}× between faintest and brightest visit at ${d.bright.curve.label}`]);
    rows.push(["Your marker", d.hit ? `on ${esc(m.target)} (within ${M.MARK_TOLERANCE}″)` : `not on ${esc(m.target)}`]);
    const truthText = { moved: "it moved", bright: "its brightness changed", noclear: "no clear change", unknown: "the data could not decide" }[d.key.truth];
    const chipText = M.CHIPS.find(c => c.id === d.chip).label.toLowerCase();
    const next = M.LIST.find(x => x.n === m.n + 1);
    const explain = d.outcome === "great" ? `You said “${chipText}”, and the data agree.`
      : d.outcome === "partial" ? (!d.hit && d.chip === d.key.truth ? `Right answer, but your marker was not on ${esc(m.target)}.` : `The data say ${truthText}. ${d.chip === "unsure" ? "“Not sure” is an honest answer; now you know what to look for." : ""}`)
      : `The data say ${truthText}.`;
    openM(`<div class="mb"><p class="t-micro c-3">Mission ${m.n} · ${esc(m.target)}</p>
      <h2 class="t-title"><span class="mtag ${d.outcome}">${M.OUTCOME[d.outcome]}</span></h2>
      <p class="t-body c-2">${explain}${d.key.subpixel && d.key.truth === "moved" ? " The expected shift is under one SPHEREx pixel, so “no clear change” also counts." : ""}</p>
      <dl class="mfacts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
      <p class="t-caption c-2">${esc(m.why)}</p>
      <p class="t-caption c-3">Shifts and changes are measured in the browser from stacked images: a guide for the eye, not calibrated astrometry or photometry.</p>
      </div><div class="mf"><button type="button" data-act="again">Try again</button><a class="mfbtn" href="/missions">All missions</a>${next ? `<button type="button" class="pri" data-act="next">Next: ${esc(next.nick)}</button>` : `<a class="mfbtn pri" href="/missions#report">Field report</a>`}</div>`, true);
    wrap.onclick = ev => {
      const act = ev.target.closest("[data-act]")?.dataset.act;
      if (act === "again") { closeM(); M.setActive({ id: m.id, seq: [], done: [], started: Date.now() }); S.fov = 240; App.goTo(m.ra, m.dec, m.det); }
      else if (act === "next" && next) { closeM(); location.href = M.start(next.id); }
    };
  }

  // ---------- team pipeline: light curve (R Dra) and spectrum (Eps Indi B) ----------
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function chart(canvas, pts, { xFmt, yLabel, xLabel }) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext("2d"); g.scale(dpr, dpr);
    const L = 64, R = 12, T = 12, B = 34;
    // the vertical range follows the clean points, so a few flagged outliers cannot flatten the curve
    const ref = pts.some(p => !p.hollow) ? pts.filter(p => !p.hollow) : pts;
    const xs = pts.map(p => p.x), ys = ref.flatMap(p => [p.y - (p.e || 0), p.y + (p.e || 0)]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 === x0) { x0 -= 1; x1 += 1; } const py = (y1 - y0 || Math.abs(y1) || 1) * 0.08; y0 -= py; y1 += py;
    const X = x => L + (x - x0) / (x1 - x0) * (W - L - R), Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    g.font = `11px ${css("--sans") || "sans-serif"}`; g.fillStyle = css("--text-muted"); g.strokeStyle = css("--border-subtle"); g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const yv = y0 + (y1 - y0) * k / 4, yy = Math.round(Y(yv)) + .5;
      g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke();
      g.textAlign = "right"; g.fillText(Math.abs(yv) >= 1000 ? yv.toFixed(0) : yv.toPrecision(3), L - 6, yy + 4);
      const xv = x0 + (x1 - x0) * k / 4; g.textAlign = k === 0 ? "left" : k === 4 ? "right" : "center"; g.fillText(xFmt(xv), X(xv), H - B + 16);
    }
    g.textAlign = "center"; g.fillText(xLabel, (L + W - R) / 2, H - 4);
    g.save(); g.translate(12, (T + H - B) / 2); g.rotate(-Math.PI / 2); g.fillText(yLabel, 0, 0); g.restore();
    g.save(); g.beginPath(); g.rect(L, T, W - L - R, H - T - B); g.clip();
    for (const p of pts) {
      const x = X(p.x), y = Y(p.y);
      g.strokeStyle = p.c; g.globalAlpha = p.dim ? .35 : 1;
      if (p.e) { g.beginPath(); g.moveTo(x, Y(p.y - p.e)); g.lineTo(x, Y(p.y + p.e)); g.stroke(); }
      g.beginPath(); g.arc(x, y, p.r || 2.5, 0, 2 * Math.PI);
      if (p.hollow) g.stroke(); else { g.fillStyle = p.c; g.fill(); }
    }
    g.restore(); g.globalAlpha = 1;
  }

  // Each exposure sees the star at a different wavelength, so brightness is compared only inside one narrow slice.
  function slices(points, withFlagged = false) {
    const out = new Map();
    for (const p of points) {
      if (p.flagged && !withFlagged) continue;
      const lo = Math.floor(p.wavelength_um / 0.1) * 0.1, k = `${p.detector}:${lo.toFixed(1)}`;
      if (!out.has(k)) out.set(k, { key: k, det: p.detector, lo, hi: lo + 0.1, pts: [] });
      out.get(k).pts.push(p);
    }
    for (const s of out.values()) {
      const groups = [];                // visits: exposures closer than 30 days in time
      for (const p of [...s.pts].sort((a, b) => a.mjd - b.mjd)) {
        const g = groups[groups.length - 1];
        if (g && p.mjd - g.last < 30) { g.pts.push(p); g.last = p.mjd; } else groups.push({ pts: [p], last: p.mjd });
      }
      s.visits = groups.map(g => {
        const f = g.pts.map(p => p.flux_mjy).sort((a, b) => a - b), e = g.pts.map(p => p.err_mjy).sort((a, b) => a - b);
        return { mjd: g.pts.reduce((t, p) => t + p.mjd, 0) / g.pts.length, flux: f[f.length >> 1], err: e[e.length >> 1] / Math.sqrt(g.pts.length), n: g.pts.length };
      });
      s.label = `${s.lo.toFixed(1)}–${s.hi.toFixed(1)} µm (D${s.det})`;
    }
    return [...out.values()].filter(s => s.visits.length >= 3).sort((a, b) => b.visits.length - a.visits.length || b.pts.length - a.pts.length);
  }
  function verdict(s) {
    const f = s.visits.map(v => v.flux), hiV = s.visits[f.indexOf(Math.max(...f))], loV = s.visits[f.indexOf(Math.min(...f))];
    const ratio = hiV.flux / loV.flux, sig = (hiV.flux - loV.flux) / Math.hypot(hiV.err, loV.err);
    return { ratio, sig, verdict: loV.flux > 0 && ratio > 1.25 && sig > 5, label: s.label };
  }

  async function openCurve(m, a) {
    openM(`<div class="mb"><p class="t-micro c-3">Team pipeline · light curve</p><h2 class="t-title">${esc(m.target)}: brightness over time</h2>
      <p class="t-caption c-2" id="lcInfo">Measuring the cutouts in the team pipeline cache (bands D4–D6). The first time this reads about a thousand files and can take a minute.</p>
      <div class="mchart"><canvas id="lcCanvas"></canvas></div>
      <label class="row between t-caption c-3" id="lcPick" hidden>Wavelength slice <select id="lcSlice" class="select sm"></select></label>
      <p class="t-caption c-3">Source: <span class="t-mono">GET /api/lightcurve</span> on the team backend. Aperture photometry (12.3″ radius) on each cached SPHEREx cutout; points with a saturated or flagged pixel in the aperture are left out of the comparison.</p>
      </div><div class="mf"><button type="button" class="pri" data-act="mclose">Close</button></div>`, true);
    a.curveOpened = true; M.setActive(a); lastSig = ""; App.render();
    const t = fieldTarget(m);
    try {
      const all = (await Promise.all([4, 5, 6].map(d => M.teamLightcurve(t, d).catch(() => [])))).flat();
      if (wrap.hidden) return;
      if (!all.length) { $("lcInfo").textContent = "The team pipeline cache on this computer has no cutouts of this target."; return; }
      const flagged = all.filter(p => p.flagged).length;
      // Saturated exposures underestimate the flux, so they never decide the answer. If nothing else is
      // left, they are still drawn (hollow) to show the coverage in time, with that warning.
      let ss = slices(all), clean = ss.length > 0;
      if (!clean) ss = slices(all, true);
      if (!ss.length) { $("lcInfo").textContent = "Too few measurements in any narrow wavelength slice to compare visits."; return; }
      const sel = $("lcSlice");
      sel.innerHTML = ss.slice(0, 12).map((s, i) => `<option value="${i}">${s.label} · ${s.visits.length} visits</option>`).join("");
      $("lcPick").hidden = false;
      const draw = () => {
        const s = ss[Number(sel.value)], v = verdict(s);
        a.curve = clean ? v : { verdict: null, saturated: true }; M.setActive(a);
        $("lcInfo").innerHTML = clean
          ? `${all.length} measurements in D4–D6 (${flagged} flagged and left out). In ${s.label}: brightest visit ${v.ratio.toFixed(2)}× the faintest (${v.sig.toFixed(0)}σ). ${v.verdict ? "That is a real brightness change." : "That is not a clear change."}`
          : `<span class="warnline">${ico("alert", 12)}All ${all.length} measurements in D4–D6 have a saturated or flagged pixel in the aperture: ${esc(m.target)} is too bright for clean photometry at these wavelengths. The curve shows when SPHEREx looked, but its heights are lower limits and are not used to check your answer. Use the images (Difference, Changes in this field) instead.</span>`;
        const col = css(clean ? "--accent-primary" : "--status-warning"), dimc = css("--text-muted");
        chart($("lcCanvas"), [...s.pts.map(p => ({ x: p.mjd, y: p.flux_mjy, c: dimc, dim: true, r: 1.5, hollow: p.flagged })),
          ...s.visits.map(vv => ({ x: vv.mjd, y: vv.flux, e: clean ? vv.err : 0, c: col, r: 4, hollow: !clean }))],
        { xFmt: x => isoDay(x).slice(0, 7), xLabel: `Date (visit medians in colour, single exposures in grey${clean ? "" : "; hollow = saturated"})`, yLabel: "Flux (mJy)" });
      };
      sel.onchange = draw; draw();
    } catch (e) {
      if (!wrap.hidden) $("lcInfo").textContent = `The team backend did not answer: ${e.message}`;
    }
  }

  async function openTeamSpectrum(m) {
    openM(`<div class="mb"><p class="t-micro c-3">Team pipeline · spectrum</p><h2 class="t-title">${esc(m.target)}: brightness against wavelength</h2>
      <p class="t-caption c-2" id="tsInfo">Measuring every cached cutout (all six bands). The aperture follows the source with its catalogue proper motion.</p>
      <div class="mchart"><canvas id="tsCanvas"></canvas></div>
      <p class="t-caption c-3">An independent check of Blink’s “Spectrum at the marker”: the same SPHEREx exposures, cut out and measured by the team pipeline (<span class="t-mono">GET /api/spectrum</span>). Cool brown dwarfs are faint near 3.3 µm, where methane absorbs, and brightest around 4 µm. Flagged points (hollow) may fall outside the plotted range.</p>
      </div><div class="mf"><button type="button" class="pri" data-act="mclose">Close</button></div>`, true);
    try {
      const pts = await M.teamSpectrum(fieldTarget(m));
      if (wrap.hidden) return;
      const ok = pts.filter(p => !p.flagged);
      $("tsInfo").textContent = `${pts.length} exposures measured, ${pts.length - ok.length} flagged and drawn hollow. Colours: bands D1 (violet) to D6 (red).`;
      chart($("tsCanvas"), pts.map(p => ({ x: p.wavelength_um, y: p.flux_mjy, c: BAND_COLORS[p.detector - 1], hollow: p.flagged, r: 2 })),
        { xFmt: x => x.toFixed(1), xLabel: "Wavelength (µm)", yLabel: "Flux (mJy)" });
    } catch (e) {
      if (!wrap.hidden) $("tsInfo").textContent = e.status === 404 ? "The team pipeline cache on this computer has no cutouts of this target." : `The team backend did not answer: ${e.message}`;
    }
  }
})();

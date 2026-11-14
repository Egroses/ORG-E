// Guided missions: definitions, saved progress and the team-backend client.
// Shared by the mission board (/missions) and the viewer (/explore). AI-assisted code (Claude Code).
// The missions add guidance on top of SPHEREx Blink; every number they show is measured by Blink itself
// or by the team backend (ORG-E pipeline cache), never typed in by hand.
"use strict";

const Missions = (() => {
  const ARCSEC_PIX = 6.15;            // SPHEREx detector pixel
  const MARK_TOLERANCE = 15;          // arcsec: a mark this close to the expected position counts as found

  // Positions match Blink's TARGETS (site.js) so each mission opens on the pre-computed seed data.
  const LIST = [
    {
      id: "barnard", n: 1, key: "barnard", nick: "The Speedster", target: "Barnard’s Star",
      ra: 269.4463, dec: 4.7680, det: 2, kind: "moves", skill: "Blink comparison",
      mission: "Catch the fastest-moving star in the sky.",
      object: "Red dwarf, about 6 light-years away",
      why: "Nearby stars drift against the far more distant background. The closer a star is, the faster it seems to move. Barnard’s Star moves about 10.4 arcseconds a year, more than any other star: over one year that is almost two SPHEREx pixels.",
      steps: [
        { id: "open", text: "Open the field. The image shows the same patch of sky at each SPHEREx visit (epoch).", hint: "Wait until the image and the Bands × visits table have loaded." },
        { id: "watch", text: "Press Play (or the Space key) and watch the visits swap in place.", hint: "Background stars stay put. Look for one source that steps between frames." },
        { id: "mark", text: "Click the source that steps between visits.", hint: "It is near the centre of the field. Click directly on it; a marker appears." },
        { id: "moved", text: "Read the Marked source panel on the right: does it report a steady shift?", hint: "If it says “No significant shift”, you probably marked a background star. Try again." },
      ],
      chipsQ: "What did the marked source do between visits?",
    },
    {
      id: "wise0855", n: 2, key: "wise0855", nick: "The Cold One", target: "WISE 0855−0714",
      ra: 133.7598, dec: -7.2422, det: 2, kind: "moves", skill: "Choosing a band",
      mission: "Find something too cold to be a star.",
      object: "Coldest known brown dwarf, about 7.4 light-years away",
      why: "A brown dwarf is too small to burn hydrogen like a star. WISE 0855−0714 is about as cold as the North Pole in winter, so it gives off almost no light at short infrared wavelengths and glows only at the long end of the SPHEREx range (4 to 5 micrometres). Choosing the right band decides whether you can see it at all.",
      steps: [
        { id: "open", text: "Open the field. It starts in band D2 (1.10–1.62 µm), a short wavelength.", hint: "Look at the centre: there is nothing obvious there in D2." },
        { id: "long", text: "Switch to a long-wavelength band: D5 or D6 (keys 5 or 6, or click the row in Bands × visits).", hint: "D5 covers 3.83–4.41 µm and D6 4.42–5.00 µm." },
        { id: "compare", text: "Compare a short and a long band: go back to D1 or D2 once more, then to D5 or D6.", hint: "A source that appears only at long wavelengths is very cold." },
        { id: "mark", text: "In D5 or D6, click the faint source near the centre that is missing in D2.", hint: "It is faint. Raise the contrast with the Cut-off slider if it is hard to see." },
      ],
      chipsQ: "Across the visits, what did the marked source do?",
    },
    {
      id: "epsindb", n: 3, key: "epsindb", nick: "The Twins", target: "Epsilon Indi B",
      ra: 331.0960, dec: -56.8010, det: 5, kind: "moves", skill: "Difference imaging",
      mission: "Two brown dwarfs, one small step.",
      object: "Pair of brown dwarfs, about 12 light-years away",
      why: "Epsilon Indi Ba and Bb orbit each other so closely that SPHEREx sees them as one source. Together they move about 4.7 arcseconds a year, less than one SPHEREx pixel in a year. A shift that small is easier to see in a difference image: earlier visit minus later visit leaves a blue and red pair where a source moved.",
      steps: [
        { id: "open", text: "Open the field (band D5).", hint: "Wait for the image to load." },
        { id: "diff", text: "Switch the Compare mode to Difference (key D).", hint: "Unchanged stars cancel out and leave a dark field." },
        { id: "mark", text: "Find a blue–red pair near the centre and click it.", hint: "Blue is where the source was, red is where it went (or the reverse, depending on the reference visit)." },
        { id: "check", text: "Wait for the catalogue check under Marked source.", hint: "Blink compares your source with Gaia DR3 and CatWISE2020 at the date of the visit." },
      ],
      chipsQ: "What did the marked source do between visits?",
    },
    {
      id: "rwaur", n: 4, key: "rwaur", nick: "The Flicker", target: "RW Aurigae",
      ra: 76.9563, dec: 30.4014, det: 3, kind: "varies", skill: "Brightness changes",
      mission: "A young star that will not sit still.",
      object: "Young T Tauri star with a dusty disc",
      why: "RW Aurigae is a few million years old and still surrounded by the gas and dust it formed from. Since 2010 clumps of dust have passed in front of it, dimming it deeply for months at a time. Its position does not change from visit to visit: its brightness does.",
      steps: [
        { id: "open", text: "Open the field (band D3).", hint: "Wait for the image to load." },
        { id: "watch", text: "Play the visits and watch the star in the centre.", hint: "Does it step sideways, or does it get brighter and fainter?" },
        { id: "diff", text: "Switch to Difference mode (key D).", hint: "A source that only changed brightness leaves a single spot, not a blue–red pair." },
        { id: "mark", text: "Click the central star, or pick it from “Changes in this field”.", hint: "The change list compares the first and the last visit automatically." },
      ],
      chipsQ: "What changed about the marked source?",
    },
    {
      id: "rdra", n: 5, key: "rdra", nick: "The Pulse", target: "R Draconis",
      ra: 248.1675, dec: 66.7550, det: 3, kind: "varies", skill: "Light curves",
      mission: "A giant star that breathes.",
      object: "Mira variable (pulsating red giant)",
      why: "R Draconis is an old red giant that swells and shrinks with a period of about 245 days, and its brightness rises and falls with it. It lies near the north ecliptic pole, where SPHEREx looks almost every day, so it has thousands of exposures: enough to draw a light curve, brightness against time.",
      steps: [
        { id: "open", text: "Open the field (band D3).", hint: "Wait for the image to load. This field has many visits." },
        { id: "watch", text: "Play the visits and watch the bright star in the centre.", hint: "Compare its brightness from visit to visit." },
        { id: "mark", text: "Click the central star.", hint: "It is the brightest source in the field." },
        { id: "curve", text: "Open the team-pipeline light curve from this panel.", hint: "It is measured from the cutouts our pipeline downloaded (bands D4–D6). Read its warning: a very bright star can saturate the detector." },
      ],
      chipsQ: "What changed about the marked source?",
    },
  ];
  const CHIPS = [
    { id: "moved", label: "It moved", cap: "Its position changed" },
    { id: "bright", label: "Its brightness changed", cap: "Same place, brighter or fainter" },
    { id: "noclear", label: "No clear change", cap: "Within the measurement error" },
    { id: "unsure", label: "Not sure", cap: "The data do not let me decide" },
  ];

  // ---------- saved progress (this browser only) ----------
  const KEY = "spx.missions.v1", ACTIVE = "spx.mission.active";
  const read = (st, k, d) => { try { const v = st.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (st, k, v) => { try { st.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: kept for this page only */ } };
  const progress = () => ({ results: {}, ...read(localStorage, KEY, {}) });
  function saveResult(id, rec) {
    const p = progress();
    const prev = p.results[id];
    // the first finished attempt is the score; later attempts are practice and only update "last"
    p.results[id] = prev ? { ...prev, last: rec, attempts: (prev.attempts || 1) + 1 } : { ...rec, attempts: 1 };
    write(localStorage, KEY, p);
    return p.results[id];
  }
  const resetProgress = () => { write(localStorage, KEY, { results: {} }); clearActive(); };
  const active = () => read(sessionStorage, ACTIVE, null);
  const setActive = a => write(sessionStorage, ACTIVE, a);
  function clearActive() { try { sessionStorage.removeItem(ACTIVE); } catch { /* nothing stored */ } }
  function start(id) {
    const m = LIST.find(x => x.id === id);
    setActive({ id, seenDets: [], started: Date.now() });
    return `/explore?ra=${m.ra}&dec=${m.dec}&det=${m.det}&fov=240&mode=blink`;
  }

  // ---------- team backend (ORG-E): /api/targets and /api/lightcurve ----------
  let targetsP = null;
  async function teamJson(path) {
    const r = await fetch(path);
    if (!r.ok) {
      let msg = r.statusText;
      try { const j = await r.json(); msg = j.error?.message || j.detail || msg; } catch { /* keep status text */ }
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return r.json();
  }
  const teamTargets = () => (targetsP ??= teamJson("/api/targets").then(list => Object.fromEntries(list.map(t => [t.key, t]))).catch(e => { targetsP = null; throw e; }));
  const teamLightcurve = (t, det) => teamJson(`/api/lightcurve?ra=${t.ra}&dec=${t.dec}&detector=${det}${t.pmra != null ? `&pmra=${t.pmra}&pmdec=${t.pmdec}` : ""}`);
  const teamSpectrum = t => teamJson(`/api/spectrum?ra=${t.ra}&dec=${t.dec}${t.pmra != null ? `&pmra=${t.pmra}&pmdec=${t.pmdec}` : ""}`);

  // Catalogue position (team backend, epoch 2026.0) moved to a decimal year with its proper motion.
  function expectedAt(t, year) {
    if (t.pmra == null || t.pmdec == null) return { ra: t.ra, dec: t.dec };
    const dy = year - 2026.0;
    return { ra: t.ra + t.pmra * dy / 3.6e6 / Math.cos(t.dec * Math.PI / 180), dec: t.dec + t.pmdec * dy / 3.6e6 };
  }
  const sepArcsec = (a, b) => Math.hypot((a.ra - b.ra) * Math.cos(b.dec * Math.PI / 180), a.dec - b.dec) * 3600;
  const pmTotal = t => (t.pmra == null ? 0 : Math.hypot(t.pmra, t.pmdec) / 1000);   // arcsec per year

  // Answer key from the data. Motion: catalogue proper motion over the time between the first and last visit.
  // Brightness: the change measured in the images (supplied by the caller), never assumed.
  function answerKey({ pm, years, brightness }) {
    const expectedShift = pm * years;
    if (expectedShift >= ARCSEC_PIX) return { truth: "moved", expectedShift, subpixel: false };
    if (brightness === true) return { truth: "bright", expectedShift, subpixel: expectedShift > 0.5 };
    if (expectedShift > 0.5) return { truth: "moved", expectedShift, subpixel: true };
    return { truth: brightness === false ? "noclear" : "unknown", expectedShift, subpixel: false };
  }
  // great: right answer on the right source; partial: honest uncertainty or right answer on the wrong source.
  function evaluate(key, chip, markHit) {
    let ok;
    if (key.truth === "unknown") ok = "partial";     // the data could not decide: no answer is marked wrong
    else if (chip === key.truth) ok = "great";
    else if (key.subpixel && (chip === "noclear" || chip === "unsure")) ok = "great";   // under one pixel: not seeing it is a fair answer
    else if (chip === "unsure") ok = "partial";
    else ok = "miss";
    if (ok === "great" && !markHit) ok = "partial";
    return ok;
  }
  const OUTCOME = { great: "Confirmed", partial: "Partly right", miss: "Not this time" };

  return { LIST, CHIPS, OUTCOME, ARCSEC_PIX, MARK_TOLERANCE, progress, saveResult, resetProgress, active, setActive, clearActive, start,
    teamTargets, teamLightcurve, teamSpectrum, expectedAt, sepArcsec, pmTotal, answerKey, evaluate };
})();

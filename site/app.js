(function () {
  const D = window.DATA, E = window.Engine, R = window.RULES, ROUTES = window.ROUTES;
  const API = "https://api.deadlock-api.com/v1/analytics";
  const $ = id => document.getElementById(id);
  const STEPS = ["hero", "enemy", "build"];

  // Every visit starts at "pick your hero"; only the last hero and route are remembered.
  // phaseOpen: which build phases are expanded on phones (Lane starts open).
  const state = { step: "hero", hero: null, enemies: [], route: null, overrides: {}, swaps: {}, swapKey: "", phaseOpen: { lane: true } };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("build-advisor") || "{}"); } catch (e) {}
  const lastHero = E.heroById[saved.hero] ? saved.hero : null;
  const save = () => { try { localStorage.setItem("build-advisor", JSON.stringify({ hero: state.hero, route: state.route })); } catch (e) {} };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const gold = n => n.toLocaleString("en-US");
  // Price in souls, with the in-game soul icon.
  const soul = n => `<span class="soul" aria-label="${gold(n)} souls">${gold(n)}</span>`;
  const heroes = [...D.heroes].sort((a, b) => a.name.localeCompare(b.name));

  // ---------- live data ----------
  const cache = new Map();
  function getJSON(url) {
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(e => { cache.delete(url); throw e; }));
    return cache.get(url);
  }
  const toMap = rows => Object.fromEntries((rows || []).map(r => [r.item_id, [r.wins, r.matches]]));

  async function loadStats(heroId, enemyIds) {
    const [counter, base, ...vs] = await Promise.all([
      getJSON(`${API}/hero-counter-stats`),
      getJSON(`${API}/item-stats?hero_id=${heroId}&min_matches=50`),
      ...enemyIds.map(e => getJSON(`${API}/item-stats?hero_id=${heroId}&enemy_hero_ids=${e}&min_matches=20`)),
    ]);
    const mine = counter.filter(r => r.hero_id === heroId);
    return {
      base: toMap(base),
      buy: Object.fromEntries((base || []).map(r => [r.item_id, r.avg_buy_time_s])),
      vs: Object.fromEntries(enemyIds.map((e, i) => [e, toMap(vs[i])])),
      overall: {
        base: [mine.reduce((s, r) => s + r.wins, 0), mine.reduce((s, r) => s + r.matches_played, 0)],
        vs: Object.fromEntries(mine.map(r => [r.enemy_hero_id, [r.wins, r.matches_played]])),
      },
    };
  }

  let stats = null, statsKey = "", statsErr = false, token = 0;
  // A matchup that's loading, or that failed less than a minute ago, isn't requested again, so a
  // failed request can't turn into a retry loop when the page re-renders.
  let pendingKey = "", failedKey = "", failedAt = 0;
  const RETRY_MS = 60000;
  const keyNow = () => state.hero + "|" + state.enemies.join(",");
  function refreshStats() {
    const key = keyNow();
    if (key === statsKey || key === pendingKey) return;
    if (key === failedKey && Date.now() - failedAt < RETRY_MS) { statsErr = true; return; }
    const my = ++token;
    pendingKey = key;
    statsErr = false;
    $("status").textContent = "Loading live match data…";
    loadStats(state.hero, state.enemies).then(s => {
      if (my !== token) return;
      pendingKey = "";
      stats = s; statsKey = key; $("status").textContent = ""; render();
    }).catch(() => {
      if (my !== token) return;
      pendingKey = ""; failedKey = key; failedAt = Date.now();
      stats = null; statsKey = ""; statsErr = true;
      $("status").textContent = "Live data is unavailable right now, so this build uses the written rules and saved hero data only.";
      render();
    });
  }

  // ---------- navigation ----------
  function go(step, push = true) {
    if (step !== "hero" && !state.hero) step = "hero";
    if (step === "build" && !state.enemies.length) step = "enemy";
    state.step = step;
    for (const s of STEPS) $("step-" + s).hidden = s !== step;
    $("share").hidden = step !== "build"; // only a finished build can be shared
    const idx = STEPS.indexOf(step);
    document.querySelectorAll(".steps li").forEach((li, i) => {
      li.classList.toggle("current", i === idx);
      li.classList.toggle("done", i < idx);
    });
    if (push && location.hash !== "#" + step) history.pushState(null, "", "#" + step);
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", () => go((location.hash || "#hero").slice(1), false));

  // Sticky header: a shadow once the page is scrolled. On phones it slides away while you scroll
  // down and comes back as soon as you scroll up.
  let lastY = 0;
  const phone = matchMedia("(max-width: 640px)");
  window.addEventListener("scroll", () => {
    const y = window.scrollY, top = document.querySelector(".top");
    top.classList.toggle("scrolled", y > 4);
    top.classList.toggle("tucked", phone.matches && y > lastY && y > 80);
    lastY = y;
  }, { passive: true });

  // ---------- rendering ----------
  const heroImg = h => `<img src="${h.img}" alt="${esc(h.name)}" title="${esc(h.name)}">`;

  function renderHeroStep() {
    const sel = state.hero || lastHero;
    // The hidden lineup copy uses a real hero so it takes the same space as step 2's lineup.
    const ph = E.heroById[sel] || heroes[0];
    $("you-chip-ph").innerHTML = `<img src="${ph.img}" alt=""><span>${esc(ph.name)}</span>`;
    const you = E.heroById[state.hero];
    $("hero-slot").innerHTML = you ? heroImg(you) : "+";
    $("hero-slot").classList.toggle("filled", !!you);
    $("hero-grid").innerHTML = heroes.map(h =>
      `<button class="hero ${h.id === sel ? "selected" : ""}" data-hero="${h.id}"><img src="${h.img}" alt=""><span>${esc(h.name)}</span></button>`).join("");
  }

  function renderLineup(youId, slotsId) {
    const you = E.heroById[state.hero];
    $(youId).innerHTML = `${heroImg(you)}<span>${esc(you.name)}</span>`;
    if (slotsId === "enemy-slots") {
      let h = "";
      for (let i = 0; i < 6; i++) {
        const e = E.heroById[state.enemies[i]];
        h += e ? `<button class="slot filled" data-enemy="${e.id}" aria-label="Remove ${esc(e.name)}">${heroImg(e)}</button>` : `<span class="slot" aria-hidden="true">+</span>`;
      }
      $(slotsId).innerHTML = h;
    } else {
      $(slotsId).innerHTML = state.enemies.map(id => heroImg(E.heroById[id])).join("");
    }
  }

  function renderEnemyStep() {
    renderLineup("you-chip", "enemy-slots");
    const full = state.enemies.length >= 6;
    $("enemy-grid").innerHTML = heroes.map(h => {
      const isYou = h.id === state.hero, isEnemy = state.enemies.includes(h.id);
      const cls = isYou ? "disabled" : isEnemy ? "enemy selected" : full ? "full" : "";
      return `<button class="hero ${cls}" data-enemy="${h.id}" ${isYou ? 'disabled title="That\'s you"' : ""} aria-pressed="${isEnemy}"><img src="${h.img}" alt=""><span>${esc(h.name)}</span></button>`;
    }).join("");
    $("go-build").disabled = !state.enemies.length;
    $("go-build").textContent = state.enemies.length ? `Get My Build (${state.enemies.length} Enem${state.enemies.length === 1 ? "y" : "ies"}) →` : "Pick at Least 1 Enemy";
  }

  const ROUTE_ICON = {
    gun: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    spirit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/></svg>',
    hybrid: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    tank: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>',
    support: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // Route advice for the current hero and enemies, cached until either or the live data changes.
  let fitCache = { key: "", fit: null };
  function currentFit() {
    const st = stats && statsKey === keyNow() ? stats : null;
    const key = keyNow() + "|" + (st ? "live" : "saved");
    if (fitCache.key !== key) fitCache = { key, fit: E.routeFit(state.hero, state.enemies, state.overrides, st) };
    return fitCache.fit;
  }

  const weakWhy = r => {
    const name = E.heroById[state.hero].name;
    return r === "support" && !window.SUPPORT_HEROES.includes(name)
      ? `${name}'s kit has little to heal, shield or buff teammates with` : `${name} players rarely spend their souls this way`;
  };

  function renderRoutes() {
    const fit = currentFit();
    // Until you pick a route yourself, follow the best fit.
    if (state.routeAuto) state.route = fit.best;
    const suggested = fit.best;
    $("routes").innerHTML = Object.entries(ROUTES).map(([k, r]) => {
      const q = r.quota, total = q.weapon + q.spirit + q.vitality;
      const bar = ["weapon", "spirit", "vitality"].map(s => `<i class="${s}" style="flex:${q[s]}" title="${cap(s)}: ${q[s]} of ${total}"></i>`).join("");
      return `<button class="route" role="radio" aria-checked="${k === state.route}" data-route="${k}">
        <span class="route-top"><span class="route-icon" aria-hidden="true">${ROUTE_ICON[k]}</span><b>${r.name}</b>${k === suggested ? `<em class="suggest">Suggested</em>` : fit.weak.has(k) ? `<em class="suggest not" title="${esc(weakWhy(k))}">Not Recommended</em>` : ""}</span>
        <span class="route-blurb">${r.blurb}</span>
        <span class="mix" aria-hidden="true">${bar}</span>
      </button>`;
    }).join("");
    // Phones show the routes as compact tiles; the picked route's description goes underneath.
    $("route-blurb").textContent = ROUTES[state.route].blurb;
  }

  const LABEL = { rule: "Counter", tip: "How to Use", route: "Your Route", when: "When to Buy", timing: "Usually Bought", data: "Data", warn: "Heads Up" };

  // An optional swap; clicking it puts this item in the build and moves the current one into the swaps.
  function optionChip(a, origId) {
    return `<span class="opt ${a.it.slot}" role="button" tabindex="0" data-swap-orig="${origId}" data-swap-to="${a.it.id}" title="Swap to ${esc(a.it.name)}"><img src="${a.it.img}" alt=""><span>${esc(a.it.name)}</span>${soul(a.it.cost)}</span>`;
  }

  // **word** in the game's tooltip text marks a highlighted word.
  const rich = t => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const SECTION_NAME = { innate: "", passive: "Passive", active: "Active" };

  const itemByName = Object.fromEntries(D.items.map(i => [i.name, i]));
  // An item this one can upgrade into, with its icon.
  const upChip = name => {
    const u = itemByName[name];
    return `<span class="up ${u ? u.slot : ""}">${u ? `<img src="${u.img}" alt="">` : ""}${esc(name)}</span>`;
  };

  function itemBack(it) {
    const d = it.details || { sections: [], upgradesTo: [], from: [] };
    const stat = p => `<div class="bstat"><b>${esc(p.value)}${p.scale ? `<em title="Scales with spirit power">×${p.scale}</em>` : ""}</b><span>${esc(p.label)}</span></div>`;
    const line = p => `<li><b>${esc(p.value)}</b> ${esc(p.label)}</li>`;
    return `<div class="back-head">
        <span class="back-name">${esc(it.name)}</span>
        <span class="back-cost">${soul(it.cost)}</span>
      </div>
      <div class="back-body">
        ${d.sections.map(s => `<section class="bsec ${s.type}">
          ${SECTION_NAME[s.type] !== "" ? `<h5>${SECTION_NAME[s.type] || cap(s.type)}</h5>` : ""}
          ${s.parts.map(p => `
            ${p.text ? `<p>${rich(p.text)}</p>` : ""}
            ${p.important.length ? `<div class="bstats">${p.important.map(stat).join("")}</div>` : ""}
            ${p.props.length ? `<ul class="bprops">${p.props.map(line).join("")}</ul>` : ""}`).join("")}
        </section>`).join("") || `<p class="muted">No extra details for this item.</p>`}
        ${d.from.length ? `<div class="brel"><span>Built From</span><div class="up-list">${d.from.map(upChip).join('<span class="or-word">and</span>')}</div></div>` : ""}
        ${d.upgradesTo.length ? `<div class="brel"><span>Upgrades To</span><div class="up-list">${d.upgradesTo.map(upChip).join('<span class="or-word">or</span>')}</div></div>` : ""}
      </div>
      <span class="flip-hint">↻ Tap to flip back</span>`;
  }

  // Flat stats the item always gives (e.g. Counterspell: +50 Bonus Health, +5 Spirit Power).
  function bonusStats(it) {
    const inn = (it.details ? it.details.sections : []).filter(sec => sec.type === "innate");
    const stats = inn.flatMap(sec => sec.parts.flatMap(p => [...p.important, ...p.props]));
    return stats.length ? `<p class="bonus">${stats.slice(0, 3).map(p => `<span><b>${esc(p.value)}</b> ${esc(p.label)}</span>`).join("")}</p>` : "";
  }

  // Each kind of note gets its own slot, so the same note lines up across cards in a row.
  const NOTE_SLOTS = [["rule", ["rule"]], ["tip", ["tip"]], ["when", ["when"]], ["timing", ["timing", "data", "warn"]]];
  const note = n => n.kind === "data" || n.kind === "warn"
    ? `<span class="evidence ${n.kind}" title="${esc(n.title || "")}">${n.kind === "data" ? "▲" : "▼"} ${esc(n.text)}</span>`
    : `<p><span class="badge ${n.kind}">${LABEL[n.kind]}</span>${n.trait ? `<b>${esc(n.trait)}:</b> ` : ""}${esc(n.text)}</p>`;

  function itemCard(x, b, alts, st, origId, swapped) {
    const notes = E.explain(x, b.hero, state.enemies, b.traits, state.route, st, b.names, b.usedWhen);
    const why = notes.slice(1);
    const meta = [cap(x.it.slot), "Tier " + x.it.tier, x.it.active ? "Active" : ""].filter(Boolean).join(" · ") + (swapped ? ' <span class="swapped">Swapped In</span>' : "");
    return `<article class="item flip ${x.it.slot}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(x.it.name)}: tap to see item stats">
      <div class="flip-inner">
        <div class="face front">
          <div class="item-head">
            <img class="icon" src="${x.it.img}" alt="" loading="lazy">
            <span class="item-title">
              <span class="name">${esc(x.it.name)}</span>
              <span class="meta">${meta}</span>
            </span>
            <span class="cost">${soul(x.it.cost)}</span>
          </div>
          <div class="intro">
            <p class="tagline" title="${esc(notes[0].text)}">${esc(notes[0].text)}</p>
            ${bonusStats(x.it)}
          </div>
          <div class="why">
            ${NOTE_SLOTS.map(([slot, kinds]) => `<div class="note-slot" data-slot="${slot}">${why.filter(n => kinds.includes(n.kind)).map(note).join("")}</div>`).join("")}
          </div>
          ${alts && alts.length ? `<div class="opts"><span class="opts-label">Optional Swap</span>${alts.map(a => optionChip(a, origId)).join('<span class="or-word">or</span>')}</div>` : ""}
        </div>
        <div class="face back" aria-hidden="true">${itemBack(x.it)}</div>
      </div>
    </article>`;
  }

  const PHASE = {
    lane: { title: "Lane" },
    early: { title: "Early Game" },
    mid: { title: "Mid Game" },
    late: { title: "Late Game" },
  };

  function currentBuild() {
    const ready = stats && statsKey === keyNow();
    if (!ready && !statsErr) return null;
    const st = ready ? stats : null;
    const b = E.build(state.hero, state.route, state.enemies, state.overrides, st);
    const all = E.buyOrder(b);
    return { b, st, order: all.filter(p => p.steps.length) };
  }
  const sum = arr => arr.reduce((s, x) => s + x.it.cost, 0);
  const altsFor = (b, x) => (x.it.tier === 1 ? [] : b.alts[x.it.id] || []);

  function renderResult() {
    const cb = currentBuild();
    if (!cb) { $("result").innerHTML = `<div class="empty">Loading live match data…</div>`; return; }
    const { b, st, order } = cb;
    b.usedWhen = new Set(); // no two cards get the same When to Buy line
    // Swaps only apply to the build they were made on.
    const key = keyNow() + "|" + state.route;
    if (state.swapKey !== key) { state.swaps = {}; state.swapKey = key; }
    // Each card: the item currently picked (original or a swap) plus the others as optional swaps.
    const slot = x => {
      const pool = [x, ...altsFor(b, x)];
      const cur = pool.find(p => p.it.id === state.swaps[x.it.id]) || x;
      return { cur, alts: pool.filter(p => p !== cur), orig: x.it.id, swapped: cur !== x };
    };
    $("result").innerHTML = `
      ${order.map(p => {
        const slots = p.steps.map(s => slot(s.buy)), items = slots.map(c => c.cur);
        // On phones the header is a toggle; collapsed phases show just the item icons.
        const open = !!state.phaseOpen[p.key];
        return `<section class="phase ${open ? "" : "collapsed"}">
          <button class="phase-head" type="button" data-phase="${p.key}" aria-expanded="${open}">
            <h3>${PHASE[p.key].title}</h3><span class="souls">${soul(sum(items))}</span>
            <span class="phase-icons" aria-hidden="true">${items.map(x => `<img src="${x.it.img}" alt="">`).join("")}</span>
            <span class="chev" aria-hidden="true"></span>
          </button>
          <div class="items n${slots.length}" data-row="${p.key}">${slots.map(c => itemCard(c.cur, b, c.alts, st, c.orig, c.swapped)).join("")}</div>
        </section>`;
      }).join("")}`;
    alignRows();
  }

  // Cards side by side should have their notes start at the same height, even when one
  // description is one line and its neighbor's is two. Pad short descriptions per row.
  // Cards side by side line up section by section: header, description, bonus stats, then each
  // kind of note. Each block is padded to the tallest matching block in its row, in order.
  // Only the header and description line up across a row, so every card's notes start at the
  // same height. The notes themselves flow with even spacing, and any spare room collects at
  // the bottom above the swap box instead of opening gaps between notes.
  const ALIGN = [".item-head", ".tagline", ".intro"];
  function alignRows() {
    for (const sel of ALIGN) document.querySelectorAll("#result .item " + sel).forEach(t => (t.style.minHeight = ""));
    for (const sel of ALIGN) {
      const rows = new Map();
      for (const t of document.querySelectorAll("#result .item " + sel)) {
        const card = t.closest(".item"), key = card.parentElement.dataset.row + ":" + card.offsetTop;
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(t);
      }
      for (const row of rows.values()) {
        const h = Math.max(...row.map(t => t.offsetHeight));
        row.forEach(t => (t.style.minHeight = h + "px"));
      }
    }
  }
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(alignRows, 100); });

  // ---------- share link ----------
  // The link holds the hero, enemy team, route and any swaps you picked, so it opens the same build.
  function shareLink() {
    const p = new URLSearchParams({ h: state.hero, e: state.enemies.join(","), r: state.route });
    const swaps = Object.entries(state.swaps).map(([from, to]) => from + ":" + to).join(",");
    if (swaps) p.set("s", swaps);
    return location.origin + location.pathname + "?" + p.toString().replace(/%2C/g, ",").replace(/%3A/g, ":") + "#build";
  }
  function readShareLink() {
    const p = new URLSearchParams(location.search);
    const hero = +p.get("h");
    if (!E.heroById[hero]) return null;
    const enemies = [...new Set((p.get("e") || "").split(",").map(Number))].filter(id => E.heroById[id] && id !== hero).slice(0, 6);
    if (!enemies.length) return null;
    const route = ROUTES[p.get("r")] ? p.get("r") : E.defaultRoute(hero);
    const swaps = {};
    for (const pair of (p.get("s") || "").split(",")) {
      const [from, to] = pair.split(":").map(Number);
      if (from && to) swaps[from] = to;
    }
    // swapKey matches renderResult's key so the swaps are kept for this exact build.
    return { hero, enemies, route, swaps, swapKey: hero + "|" + enemies.join(",") + "|" + route };
  }
  async function share(btn) {
    const url = shareLink(), label = btn.querySelector("span");
    try {
      // Phones get the system share sheet; everywhere else the link is copied.
      if (navigator.share && matchMedia("(hover: none)").matches) { await navigator.share({ title: "CounterBuild", url }); return; }
      await navigator.clipboard.writeText(url);
      label.textContent = "Link Copied";
    } catch (e) {
      if (e && e.name === "AbortError") return; // closed the share sheet
      window.prompt("Copy this link:", url);
      return;
    }
    clearTimeout(share.t);
    share.t = setTimeout(() => (label.textContent = "Share Link"), 2000);
  }

  // ---------- feedback box ----------
  // Messages are emailed to the site owner through FormSubmit (formsubmit.co, free, no account).
  const FEEDBACK_URL = "https://formsubmit.co/ajax/10cf639f997d890e5c2bb64f9475e12f";
  const buildContext = () => state.step === "build" && state.hero && state.enemies.length
    ? `${E.heroById[state.hero].name} vs ${state.enemies.map(id => E.heroById[id].name).join(", ")} (${ROUTES[state.route].name})`
    : "";

  function openFeedback() {
    const ctx = buildContext();
    $("fb-build").textContent = ctx ? `Sent with your current build: ${ctx}` : "";
    $("fb-status").textContent = "";
    $("fb-send").disabled = false;
    $("fb").showModal();
    $("fb-msg").focus();
  }

  async function sendFeedback(ev) {
    ev.preventDefault();
    const f = new FormData($("fb-form"));
    if (f.get("website")) return; // spam bot filled the hidden field
    const msg = String(f.get("message") || "").trim();
    if (!msg) { $("fb-status").textContent = "Please write a message first."; return; }
    $("fb-send").disabled = true;
    $("fb-status").textContent = "Sending…";
    const type = f.get("type");
    const payload = {
      _subject: `CounterBuild feedback: ${type}`, _template: "table", _captcha: "false",
      type, message: msg,
      build: buildContext() || "(not on a build page)", page: location.href,
    };
    try {
      if (!FEEDBACK_URL) throw new Error("not connected");
      const r = await fetch(FEEDBACK_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok || String(res.success) !== "true") throw new Error(res.message || r.status);
      $("fb-form").reset();
      $("fb-status").textContent = "Thanks! Your feedback was sent.";
      setTimeout(() => $("fb").open && $("fb").close(), 1600);
    } catch (e) {
      $("fb-send").disabled = false;
      $("fb-status").textContent = "Your feedback couldn't be sent. Please try again in a moment.";
    }
  }
  // The message hint matches the selected type.
  const FB_HINT = {
    "Build advice": "Tell us what's off with a build.",
    "Bug": "Tell us what broke or doesn't work.",
    "Idea": "Suggest what would make CounterBuild better.",
  };
  const setHint = () => { $("fb-msg").placeholder = FB_HINT[$("fb-form").elements.type.value] || ""; };
  $("fb-form").addEventListener("change", ev => { if (ev.target.name === "type") setHint(); });
  $("fb-form").addEventListener("reset", () => setTimeout(setHint));
  setHint();
  $("feedback").addEventListener("click", openFeedback);
  $("fb-form").addEventListener("submit", sendFeedback);
  $("fb").addEventListener("click", ev => { if (ev.target === $("fb") || ev.target.closest("[data-fb-close]")) $("fb").close(); });

  // With 1-2 enemies the engine counters everything they bring; with more it balances across the team.
  function renderFocus() {
    const names = state.enemies.map(id => E.heroById[id].name);
    $("focus-note").textContent = names.length <= 2
      ? `Focused on countering ${names.join(" and ")}. Add more enemies for a balanced build.`
      : "Balanced against their whole team. Pick just 1 or 2 enemies to focus on them.";
  }

  function render() {
    if (state.step === "hero") renderHeroStep();
    else if (state.step === "enemy") renderEnemyStep();
    else {
      renderLineup("you-chip-2", "enemy-row");
      renderFocus();
      renderRoutes(); renderResult(); refreshStats();
    }
    save();
  }

  // ---------- events ----------
  function flip(card) {
    const on = card.classList.toggle("flipped");
    card.setAttribute("aria-pressed", on);
    card.querySelector(".front").setAttribute("aria-hidden", on);
    card.querySelector(".back").setAttribute("aria-hidden", !on);
    // A tall stat side hangs below the card: leave room for it at the end of the build,
    // then bring all of it on screen.
    const res = $("result");
    res.style.paddingBottom = "";
    const end = res.getBoundingClientRect().bottom;
    const hang = Math.max(0, ...[...res.querySelectorAll(".item.flipped .back")].map(bk => bk.getBoundingClientRect().bottom - end));
    if (hang) res.style.paddingBottom = hang + 12 + "px";
    if (on) {
      const r = card.querySelector(".back").getBoundingClientRect();
      const over = r.bottom - window.innerHeight + 12;
      if (over > 0) window.scrollBy({ top: Math.min(over, r.top - 70), behavior: "smooth" });
    }
  }
  function swap(chip) {
    const orig = +chip.dataset.swapOrig, to = +chip.dataset.swapTo;
    if (to === orig) delete state.swaps[orig]; else state.swaps[orig] = to;
    renderResult();
    const card = document.querySelector(`[data-swap-orig="${orig}"]`);
    if (card) card.closest(".item").classList.add("just-swapped");
  }
  document.addEventListener("keydown", ev => {
    const chip = ev.target.closest && ev.target.closest("[data-swap-to]");
    if (chip && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); swap(chip); return; }
    const card = ev.target.closest && ev.target.closest(".flip");
    if (card && ev.target === card && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); flip(card); }
  });

  document.addEventListener("click", ev => {
    const chip = ev.target.closest("[data-swap-to]");
    if (chip) { swap(chip); return; }
    const card = ev.target.closest(".flip");
    if (card) { flip(card); return; }
    const t = ev.target.closest("button"); if (!t || t.disabled) return;
    if (t.dataset.hero) {
      const id = +t.dataset.hero;
      if (id !== state.hero) { state.hero = id; state.route = E.defaultRoute(id); state.routeAuto = true; state.enemies = state.enemies.filter(e => e !== id); }
      go("enemy");
    } else if (t.dataset.enemy) {
      const id = +t.dataset.enemy;
      if (state.enemies.includes(id)) state.enemies = state.enemies.filter(e => e !== id);
      else if (state.enemies.length < 6) state.enemies.push(id);
      state.overrides = {};
      renderEnemyStep();
    } else if (t.dataset.goto) go(t.dataset.goto);
    else if (t.dataset.route) { state.route = t.dataset.route; state.routeAuto = false; render(); }
    else if (t.dataset.phase) {
      const k = t.dataset.phase, open = !state.phaseOpen[k];
      state.phaseOpen[k] = open;
      t.setAttribute("aria-expanded", open);
      t.closest(".phase").classList.toggle("collapsed", !open);
    }
    else if (t.id === "go-build") go("build");
    else if (t.id === "share") share(t);
    else if (t.id === "back-hero" || t.id === "home") go("hero");
    else if (t.id === "clear") { state.enemies = []; state.overrides = {}; renderEnemyStep(); }
  });

  if (ROUTES[saved.route]) state.route = saved.route;
  // A shared link (?h=hero&e=enemies&r=route&s=swaps) opens straight to that build.
  const shared = readShareLink();
  if (shared) {
    Object.assign(state, shared);
    history.replaceState(null, "", location.pathname + "#build");
    go("build", false);
  } else {
    history.replaceState(null, "", location.pathname + "#hero");
    go("hero", false);
  }
})();

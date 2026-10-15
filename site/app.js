(function () {
  const D = window.DATA, E = window.Engine, R = window.RULES, ROUTES = window.ROUTES;
  const API = "https://api.deadlock-api.com/v1/analytics";
  const $ = id => document.getElementById(id);
  const STEPS = ["hero", "enemy", "build"];

  // Every visit starts at "pick your hero"; only the last hero and route are remembered.
  const state = { step: "hero", hero: null, enemies: [], route: null, level: "normal", overrides: {}, swaps: {}, swapKey: "" };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("build-advisor") || "{}"); } catch (e) {}
  const lastHero = E.heroById[saved.hero] ? saved.hero : null;
  const save = () => { try { localStorage.setItem("build-advisor", JSON.stringify({ hero: state.hero, route: state.route, level: state.level })); } catch (e) {} };

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
  const keyNow = () => state.hero + "|" + state.enemies.join(",");
  function refreshStats() {
    if (keyNow() === statsKey) return;
    const my = ++token, key = keyNow();
    statsErr = false;
    $("status").textContent = "Loading live match data…";
    loadStats(state.hero, state.enemies).then(s => {
      if (my !== token) return;
      stats = s; statsKey = key; $("status").textContent = ""; render();
    }).catch(() => {
      if (my !== token) return;
      stats = null; statsKey = ""; statsErr = true;
      $("status").textContent = "Couldn't reach the live data, so this build uses the written rules and saved hero data only.";
      render();
    });
  }

  // ---------- navigation ----------
  function go(step, push = true) {
    if (step !== "hero" && !state.hero) step = "hero";
    if (step === "build" && !state.enemies.length) step = "enemy";
    state.step = step;
    for (const s of STEPS) $("step-" + s).hidden = s !== step;
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

  // ---------- rendering ----------
  const heroImg = h => `<img src="${h.img}" alt="${esc(h.name)}" title="${esc(h.name)}">`;

  function renderHeroStep() {
    const sel = state.hero || lastHero;
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

  function renderRoutes() {
    const suggested = E.defaultRoute(state.hero);
    $("routes").innerHTML = Object.entries(ROUTES).map(([k, r]) => {
      const q = r.quota, total = q.weapon + q.spirit + q.vitality;
      const bar = ["weapon", "spirit", "vitality"].map(s => `<i class="${s}" style="flex:${q[s]}" title="${cap(s)}: ${q[s]} of ${total}"></i>`).join("");
      return `<button class="route" role="radio" aria-checked="${k === state.route}" data-route="${k}">
        <span class="route-top"><span class="route-icon" aria-hidden="true">${ROUTE_ICON[k]}</span><b>${r.name}</b>${k === suggested ? `<em class="suggest">Suggested</em>` : ""}</span>
        <span class="route-blurb">${r.blurb}</span>
        <span class="mix" aria-hidden="true">${bar}</span>
        <span class="mix-label">${q.weapon} Weapon · ${q.spirit} Spirit · ${q.vitality} Vitality</span>
      </button>`;
    }).join("");
  }

  const LEVEL_INFO = {
    light: { name: "Light", hint: "Your hero's usual build, with only one or two answers to their biggest threats." },
    normal: { name: "Normal", hint: "A balance of your core items and counters to their team." },
    heavy: { name: "Heavy", hint: "Build around their team: counter items come first wherever they fit." },
  };

  function renderLevels() {
    $("levels").innerHTML = Object.entries(LEVEL_INFO).map(([k, l]) =>
      `<button class="level" role="radio" aria-checked="${k === state.level}" data-level="${k}">${l.name}</button>`).join("");
    const few = state.enemies.length <= 2 ? ` Focused on countering ${state.enemies.map(id => E.heroById[id].name).join(" and ")}.` : "";
    $("level-hint").textContent = LEVEL_INFO[state.level].hint + few;
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
        ${d.from.length ? `<p class="brel"><span>Built From</span>${d.from.map(esc).join(", ")}</p>` : ""}
        ${d.upgradesTo.length ? `<div class="brel"><span>Upgrades To</span><div class="up-list">${d.upgradesTo.map(upChip).join('<span class="or-word">or</span>')}</div></div>` : ""}
      </div>
      <span class="flip-hint">↻ Tap to flip back</span>`;
  }

  // Flat stats the item always gives (e.g. Counterspell: +50 Bonus Health, +5 Spirit Power).
  function bonusStats(it) {
    const inn = (it.details ? it.details.sections : []).filter(sec => sec.type === "innate");
    const stats = inn.flatMap(sec => sec.parts.flatMap(p => [...p.important, ...p.props]));
    return stats.length ? `<p class="bonus">${stats.map(p => `<span><b>${esc(p.value)}</b> ${esc(p.label)}</span>`).join("")}</p>` : "";
  }

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
            <p class="tagline">${esc(notes[0].text)}</p>
            ${bonusStats(x.it)}
          </div>
          <div class="why">
            ${why.map(n => `<p><span class="badge ${n.kind}">${LABEL[n.kind]}</span>${n.trait ? `<b>${esc(n.trait)}:</b> ` : ""}${esc(n.text)}</p>`).join("")}
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
    const b = E.build(state.hero, state.route, state.enemies, state.overrides, st, state.level);
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
    const key = keyNow() + "|" + state.route + "|" + state.level;
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
        return `<section class="phase">
          <div class="phase-head"><h3>${PHASE[p.key].title}</h3><span class="souls">${soul(sum(items))}</span></div>
          <div class="items" data-row="${p.key}">${slots.map(c => itemCard(c.cur, b, c.alts, st, c.orig, c.swapped)).join("")}</div>
        </section>`;
      }).join("")}`;
    alignRows();
  }

  // Cards side by side should have their notes start at the same height, even when one
  // description is one line and its neighbor's is two. Pad short descriptions per row.
  function alignRows() {
    // First the descriptions, so the bonus stats line up; then the description + stats
    // block, so the notes line up.
    for (const sel of [".tagline", ".intro"]) {
      const els = [...document.querySelectorAll("#result .item " + sel)];
      els.forEach(t => (t.style.minHeight = ""));
    }
    for (const sel of [".tagline", ".intro"]) {
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

  function render() {
    if (state.step === "hero") renderHeroStep();
    else if (state.step === "enemy") renderEnemyStep();
    else {
      renderLineup("you-chip-2", "enemy-row");
      renderRoutes(); renderLevels(); renderResult(); refreshStats();
    }
    save();
  }

  // ---------- events ----------
  function flip(card) {
    const on = card.classList.toggle("flipped");
    card.setAttribute("aria-pressed", on);
    card.querySelector(".front").setAttribute("aria-hidden", on);
    card.querySelector(".back").setAttribute("aria-hidden", !on);
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
      if (id !== state.hero) { state.hero = id; state.route = E.defaultRoute(id); state.enemies = state.enemies.filter(e => e !== id); }
      go("enemy");
    } else if (t.dataset.enemy) {
      const id = +t.dataset.enemy;
      if (state.enemies.includes(id)) state.enemies = state.enemies.filter(e => e !== id);
      else if (state.enemies.length < 6) state.enemies.push(id);
      state.overrides = {};
      renderEnemyStep();
    } else if (t.dataset.goto) go(t.dataset.goto);
    else if (t.dataset.route) { state.route = t.dataset.route; render(); }
    else if (t.dataset.level) { state.level = t.dataset.level; render(); }
    else if (t.id === "go-build") go("build");
    else if (t.id === "back-hero" || t.id === "home") go("hero");
    else if (t.id === "clear") { state.enemies = []; state.overrides = {}; renderEnemyStep(); }
  });

  if (ROUTES[saved.route]) state.route = saved.route;
  if (E.LEVELS[saved.level]) state.level = saved.level;
  history.replaceState(null, "", "#hero");
  go("hero", false);
})();

// Build engine: pure functions, no DOM.
// stats (optional, from the live API):
//   { base: {itemId: [wins, matches]}, vs: {enemyId: {itemId: [w, m]}}, overall: {base: [w, m], vs: {enemyId: [w, m]}} }
(function () {
  const D = window.DATA, R = window.RULES, ROUTES = window.ROUTES;
  const SHRINK = 1500; // matches needed before a matchup delta counts at half weight
  // An item must show up in enough of this hero's games to be suggested, measured against the
  // hero's most-bought item. Counter items get a lower floor so the enemy team can still be answered.
  const MIN_SHARE = 0.02, MIN_SHARE_COUNTER = 0.0025;
  const heroById = Object.fromEntries(D.heroes.map(h => [h.id, h]));
  const tagOf = {};
  for (const [tag, names] of Object.entries(window.TAGS)) for (const n of names) (tagOf[n] = tagOf[n] || []).push(tag);
  const rate = ([w, m]) => (m ? w / m : 0);

  function heroTraits(h) {
    const t = new Set();
    const tags = (h.tags || []).join(" ");
    if (h.type === "brawler" || /Tank|Rock Solid|Can't Kill/.test(tags)) t.add("tank");
    if (h.type === "mystic") t.add("spirit");
    if (h.type === "marksman" || h.type === "assassin") t.add("gun");
    if (h.type === "assassin" || /Mobility|High-?[Ff]lying|Slippery|Stealth|Acrobatic|Evasive|Nimble|Soaring|Traveller|Slither/.test(tags)) t.add("mobile");
    if (window.HERO_TRAITS.heal.includes(h.name) || /Lifesteal/.test(tags)) t.add("heal");
    // Lockdown on a basic ability, not just the ultimate.
    if ((window.HERO_CC[h.name] || []).some(([a]) => a !== (h.abilities || [])[3])) t.add("cc");
    return t;
  }

  // The lockdown abilities of hero h that this item answers (all of them for most items).
  function ccFor(itemName, h) {
    const lim = window.CC_ITEM_KINDS[itemName];
    return (window.HERO_CC[h.name] || []).filter(([a, kind]) =>
      !lim || (lim.kinds.includes(kind) && !(lim.noUlt && a === (h.abilities || [])[3])));
  }
  // Enemy heroes that bring trait t, narrowed for lockdown items to the lockdown the item answers.
  function bringers(t, itemName, enemyIds) {
    const hs = enemyIds.map(id => heroById[id]).filter(h => heroTraits(h).has(t));
    return t === "cc" ? hs.filter(h => ccFor(itemName, h).length) : hs;
  }

  function defaultRoute(heroId) {
    const type = heroById[heroId].type;
    return Object.keys(ROUTES).find(k => ROUTES[k].fit.includes(type)) || "hybrid";
  }

  // overrides: { trait: true|false } to force a trait on/off
  // A trait is "on" when enough enemies have it. With only 1-2 enemies picked we assume you
  // want to counter exactly those heroes, so any trait they have counts.
  function activeTraits(enemyIds, overrides) {
    const counts = {}, on = {};
    const focus = enemyIds.length <= 2;
    for (const id of enemyIds) for (const t of heroTraits(heroById[id])) counts[t] = (counts[t] || 0) + 1;
    for (const [t, rule] of Object.entries(R)) {
      const forced = overrides && overrides[t];
      on[t] = forced === true || (forced !== false && (counts[t] || 0) >= (focus ? 1 : rule.need));
    }
    // A mixed team where no trait reaches its threshold still gets countered: use the
    // trait(s) most of them share.
    if (enemyIds.length && !Object.values(on).some(Boolean)) {
      const top = Math.max(0, ...Object.keys(R).map(t => counts[t] || 0));
      for (const t of Object.keys(R)) if (top && counts[t] === top && overrides?.[t] !== false) on[t] = true;
    }
    return { counts, on };
  }

  // Win rate with the item vs these enemies, compared with how the hero usually does
  // in that matchup and how the hero usually does with the item.
  function matchupDelta(item, enemyIds, stats) {
    const b = stats.base[item.id];
    if (!b) return { pts: 0, score: 0, n: 0 };
    const baseGap = rate(b) - rate(stats.overall.base);
    let sum = 0, wsum = 0, n = 0;
    for (const e of enemyIds) {
      const v = stats.vs[e] && stats.vs[e][item.id], o = stats.overall.vs[e];
      if (!v || !o || v[1] < 30) continue;
      const w = v[1] / (v[1] + SHRINK);
      sum += (rate(v) - rate(o) - baseGap) * w; wsum += w; n += v[1];
    }
    return wsum ? { pts: 100 * sum / wsum, score: 100 * sum / enemyIds.length, n } : { pts: 0, score: 0, n: 0 };
  }

  function scoreItem(item, hero, route, enemyIds, traits, stats) {
    let s = Math.min(6, (hero.pop[item.id] || 0) / 10); // this hero's staples first
    const r = ROUTES[route];
    s += r.bias[item.slot] || 0;
    for (const tg of tagOf[item.name] || []) s += r.tags[tg] || 0;
    let rb = 0; // bonus for countering the enemy team
    for (const [t, rule] of Object.entries(R)) {
      // Lockdown items only count when an enemy has lockdown they can answer.
      const hit = traits.on[t] && rule.items[item.name] && (t !== "cc" || !enemyIds.length || bringers(t, item.name, enemyIds).length);
      // Normally only the two strongest counters per trait get full credit, so one trait can't fill the build.
      const full = Object.keys(rule.items).indexOf(item.name) < 2;
      if (hit) rb += hit[0] * (full ? 1 : 0.5);
    }
    const md = stats && enemyIds.length ? matchupDelta(item, enemyIds, stats) : { pts: 0, score: 0, n: 0 };
    s += 1.5 * md.score;
    return { s, rb, md };
  }

  const TIER_MIX = { 4: 4, 3: 5, 2: 3 };

  // Normal counters at least one thing when the enemy team has a trait.
  function build(heroId, route, enemyIds, overrides, stats) {
    let b;
    for (const flat of [0, 2, 4, 7]) {
      b = buildWith(heroId, route, enemyIds, overrides, stats, flat);
      if (!Object.values(b.traits.on).some(Boolean) || b.chosen.some(x => x.rb > 0)) break;
    }
    return b;
  }

  // Retry with lower floors when the hero buys too few items for this route to fill the build.
  function buildWith(heroId, route, enemyIds, overrides, stats, flat) {
    let b;
    for (const relax of [1, 0.4, 0.1, 0]) {
      b = buildOnce(heroId, route, enemyIds, overrides, stats, flat, relax);
      if (b.chosen.length >= 12 && b.lane.length >= 3) break;
    }
    return b;
  }

  // Does this hero actually buy the item (or is it a counter that suits the route)?
  function fits(x, hero, route, stats, max, relax) {
    if (window.CHARGE_ITEMS.includes(x.it.name) && !(hero.charged || []).length) return false;
    if (hero.pop[x.it.id]) return true;
    // A spirit-slot counter only gets the low floor on routes that build spirit.
    const counter = x.rb > 0 && (x.it.slot !== "spirit" || ROUTES[route].bias.spirit > 0);
    if (!stats) return counter || relax === 0;
    const share = max ? ((stats.base[x.it.id] || [0, 0])[1]) / max : 0;
    const floor = counter ? MIN_SHARE_COUNTER : MIN_SHARE;
    return share >= floor * relax && (relax === 0 || share > 0);
  }

  function buildOnce(heroId, route, enemyIds, overrides, stats, flat, relax) {
    const hero = heroById[heroId];
    const traits = activeTraits(enemyIds, overrides);
    const max = stats ? Math.max(0, ...Object.values(stats.base).map(v => v[1])) : 0;
    const scored = D.items.map(it => ({ it, ...scoreItem(it, hero, route, enemyIds, traits, stats) }))
      .filter(x => fits(x, hero, route, stats, max, relax));
    for (const x of scored) if (x.rb > 0) x.s += x.rb + flat;
    const quota = { ...ROUTES[route].quota };
    const chosen = [];
    for (const tier of [4, 3, 2]) {
      let need = TIER_MIX[tier];
      for (const x of scored.filter(x => x.it.tier === tier).sort((a, b) => b.s - a.s)) {
        if (!need) break;
        if (quota[x.it.slot] > 0) { chosen.push(x); quota[x.it.slot]--; need--; }
      }
    }
    // Fill leftover slots with the best remaining item of any tier 2-4.
    for (const x of scored.filter(x => x.it.tier >= 2 && !chosen.includes(x)).sort((a, b) => b.s - a.s)) {
      if (chosen.length >= 12) break;
      if (quota[x.it.slot] > 0) { chosen.push(x); quota[x.it.slot]--; }
    }
    const lane = scored.filter(x => x.it.tier === 1).sort((a, b) => b.s - a.s).slice(0, 3);
    const taken = new Set([...chosen, ...lane]);
    // Each alternative is offered once across the whole build, so the same swap doesn't repeat.
    const alts = {};
    for (const x of [...chosen].sort((a, b) => b.s - a.s)) {
      alts[x.it.id] = scored.filter(a => !taken.has(a) && a.it.slot === x.it.slot && a.it.tier === x.it.tier)
        .sort((a, b) => b.s - a.s).slice(0, 2);
      alts[x.it.id].forEach(a => taken.add(a));
    }
    chosen.sort((a, b) => a.it.tier - b.it.tier || b.s - a.s);
    const names = new Set([...chosen, ...lane].map(x => x.it.name));
    return { hero, traits, lane, chosen, alts, names };
  }

  // Fallback "How to Use" when there's no hand-written tip.
  const USE_TIP = {
    active: "Active item: put it on a key you can reach mid-fight and use it as soon as a fight starts.",
    passive: "Passive: it works on its own once you buy it, so there's nothing to press.",
  };

  // "When to Buy": the situation that should make you buy it (lines live in when.js).
  const WHEN_TIER = {
    1: "In lane, on your first trip to the shop. Sell it later when you need the slot.",
    2: "After your lane items, on your first or second trip back to the shop.",
    3: "Once your tier 2 items are done. Prioritize it before any tier 4 item.",
    4: "Late game, once your tier 3 items are done, or early if you're far ahead on souls.",
  };
  const nameList = names => names.length <= 1 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  const fill = (tpl, who, one) => tpl
    .replace("{who}", who)
    .replace(/\{has\}/g, one ? "has" : "have").replace(/\{is\}/g, one ? "is" : "are")
    .replace(/(\w*)\{ies\}/g, (m, stem) => stem + (one ? "ies" : "y"))
    .replace(/\{es\}/g, one ? "es" : "").replace(/\{s\}/g, one ? "s" : "");

  // Fill in the hero's own ability names; null when the hero lacks one the text needs.
  function kitText(text, hero) {
    if (!text) return null;
    const ab = hero.abilities || [];
    const names = { imbue: ab[(window.HERO_IMBUE[hero.name] || 1) - 1], ult: ab[3], charged: (hero.charged || [])[0] };
    let ok = true;
    const out = text.replace(/\{(imbue|ult|charged)\}/g, (m, k) => names[k] || (ok = false, m));
    return ok ? out : null;
  }

  // Candidate lines from most to least specific; the first one not already used in this build wins.
  function whenToBuy(x, hero, enemyIds, traits, buildNames, used) {
    const cands = [];
    for (const t of Object.keys(R)) {
      const vs = (window.WHEN_VS_TRAIT[x.it.name] || {})[t] || window.WHEN_VS[x.it.name];
      if (!traits.on[t] || !R[t].items[x.it.name] || !vs) continue;
      const heroes = bringers(t, x.it.name, enemyIds);
      if (t === "cc" && !heroes.length) continue;
      const who = heroes.map(h => h.name);
      // {cc}: each hero's main lockdown ability this item answers, e.g. "Haze's Sleep Dagger".
      const cc = t !== "cc" ? [] : heroes.map(h => `${h.name}${/s$/.test(h.name) ? "'" : "'s"} ${ccFor(x.it.name, h)[0][0]}`);
      const tpl = vs.replace("{cc}", cc.length ? nameList(cc) : "their lockdown");
      cands.push(fill(tpl, who.length ? nameList(who) : "their team", who.length === 1));
      break;
    }
    const w = kitText(window.WHEN[x.it.name], hero);
    if (w) cands.push(w);
    const from = ((x.it.details && x.it.details.from) || []).filter(n => buildNames.has(n));
    if (from.length) cands.push(`Right after ${nameList(from)}, since it builds from ${from.length > 1 ? "them" : "it"} and the souls you spent carry over.`);
    cands.push(WHEN_TIER[x.it.tier]);
    const pick = cands.find(c => !used.has(c)) || cands[0];
    used.add(pick);
    return pick;
  }

  function explain(x, hero, enemyIds, traits, route, stats, buildNames = new Set(), used = new Set()) {
    const out = [];
    // Hand-written line, else the first sentence of the game's own description.
    // Items with no description use the first effect text from their tooltip instead.
    const effect = ((x.it.details && x.it.details.sections) || []).flatMap(sec => sec.parts.map(p => p.text)).find(Boolean) || "";
    const gameDesc = (x.it.desc || effect.replace(/\*\*/g, "")).split(/(?<=\.)\s/)[0];
    out.push({ kind: "what", text: window.LINES[x.it.name] || gameDesc || "A plain stat item. Check the in-game tooltip for exact numbers." });
    // One short Counter line: which traits it answers and which enemy heroes bring them.
    const counters = Object.entries(R).filter(([t, rule]) => traits.on[t] && rule.items[x.it.name] &&
      (t !== "cc" || bringers(t, x.it.name, enemyIds).length)).map(([t, rule]) => {
      const who = bringers(t, x.it.name, enemyIds).map(h => h.name);
      return who.length ? `${rule.label} (${who.join(", ")})` : rule.label;
    });
    // Some items counter more than one trait; describe those in one plain line instead.
    const COUNTER_TEXT = { "Counterspell": "All enemy abilities" };
    if (counters.length) out.push({ kind: "rule", text: COUNTER_TEXT[x.it.name] || counters.join(" · ") });
    const tip = kitText(window.TIPS_KIT[x.it.name], hero) || kitText(window.TIPS[x.it.name], hero);
    out.push({ kind: "tip", text: tip || USE_TIP[x.it.active ? "active" : "passive"] });
    out.push({ kind: "when", text: whenToBuy(x, hero, enemyIds, traits, buildNames, used) });
    const secs = stats && stats.buy[x.it.id];
    if (secs) out.push({ kind: "timing", text: `Around minute ${Math.max(1, Math.round(secs / 60))}` });
    // Short evidence line: how this item does vs these heroes compared with its usual win rate.
    if (enemyIds.length && x.md.n >= 1500 && Math.abs(x.md.pts) >= 0.3) {
      const p = x.md.pts, n = x.md.n >= 1000 ? `${(x.md.n / 1000).toFixed(x.md.n < 10000 ? 1 : 0)}k` : x.md.n;
      out.push(p > 0
        ? { kind: "data", text: `+${p.toFixed(1)}% win rate against these heroes`, title: `${n} games` }
        : { kind: "warn", text: `${p.toFixed(1)}% win rate against these heroes`, title: `${n} games` });
    }
    return out;
  }

  // Walk the build in buy order and work out what to sell when slots run out.
  // Each slot type has 4 slots. Flex slots (any type) are assumed to open up
  // over the game: none in lane/early, 2 by mid game, 4 by late game.
  const FLEX_BY_PHASE = { lane: 0, early: 0, mid: 2, late: 4 };
  function buyOrder(b) {
    const phases = [
      { key: "lane", items: b.lane },
      { key: "early", items: b.chosen.filter(x => x.it.tier === 2) },
      { key: "mid", items: b.chosen.filter(x => x.it.tier === 3) },
      { key: "late", items: b.chosen.filter(x => x.it.tier === 4) },
    ];
    const held = []; // { x, flex }
    const out = [];
    for (const p of phases) {
      const flexCap = FLEX_BY_PHASE[p.key];
      const steps = [];
      for (const x of p.items) {
        const sells = [];
        const inType = held.filter(h => h.x.it.slot === x.it.slot && !h.flex);
        let flex = false;
        if (inType.length >= 4) {
          // Sell the cheapest item of this type if it's a lane item; otherwise use a flex slot.
          const cheapest = [...inType].sort((a, c) => a.x.it.tier - c.x.it.tier)[0];
          if (cheapest.x.it.tier === 1 || held.filter(h => h.flex).length >= flexCap) {
            held.splice(held.indexOf(cheapest), 1); sells.push(cheapest.x);
          } else flex = true;
        }
        held.push({ x, flex });
        steps.push({ buy: x, sells, flex });
      }
      out.push({ key: p.key, steps });
    }
    out.held = held; // final inventory: [{ x, flex }]
    return out;
  }

  function diffRoutes(heroId, current, enemyIds, overrides, stats) {
    const base = new Set(build(heroId, current, enemyIds, overrides, stats).chosen.map(x => x.it.name));
    return Object.keys(ROUTES).filter(k => k !== current).map(k => {
      const b = build(heroId, k, enemyIds, overrides, stats).chosen.map(x => x.it.name);
      const set = new Set(b);
      return { key: k, add: b.filter(n => !base.has(n)), drop: [...base].filter(n => !set.has(n)) };
    });
  }

  window.Engine = { heroById, heroTraits, defaultRoute, activeTraits, build, explain, buyOrder, diffRoutes };
})();

// Build engine: pure functions, no DOM.
// stats (optional, from the live API):
//   { base: {itemId: [wins, matches]}, vs: {enemyId: {itemId: [w, m]}}, overall: {base: [w, m], vs: {enemyId: [w, m]}} }
(function () {
  const D = window.DATA, R = window.RULES, ROUTES = window.ROUTES;
  const SHRINK = 1500; // matches needed before a matchup delta counts at half weight
  const MIN_BASE = 200; // an item the hero has barely bought is left out when we have data
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
    if (window.HERO_TRAITS.cc.includes(h.name)) t.add("cc");
    return t;
  }

  function defaultRoute(heroId) {
    const type = heroById[heroId].type;
    return Object.keys(ROUTES).find(k => ROUTES[k].fit.includes(type)) || "hybrid";
  }

  // overrides: { trait: true|false } to force a trait on/off
  function activeTraits(enemyIds, overrides) {
    const counts = {}, on = {};
    for (const id of enemyIds) for (const t of heroTraits(heroById[id])) counts[t] = (counts[t] || 0) + 1;
    for (const [t, rule] of Object.entries(R)) {
      const forced = overrides && overrides[t];
      on[t] = forced === true || (forced !== false && (counts[t] || 0) >= rule.need);
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

  // How hard to build around the enemy team.
  //   light:   keep the hero's usual build; only the 2 strongest counters get their bonus.
  //   counter: balanced (default).
  //   heavy:   counter bonuses are boosted, every counter for a trait gets full credit, and any
  //            counter item gets a flat bonus so it beats non-counter items for its slot.
  const LEVELS = { light: { mult: 1, keep: 2, flat: 0 }, counter: { mult: 1, keep: Infinity, flat: 0 }, heavy: { mult: 1.6, keep: Infinity, flat: 4 } };

  function scoreItem(item, hero, route, enemyIds, traits, stats, level) {
    let s = Math.min(6, (hero.pop[item.id] || 0) / 10); // this hero's staples first
    const r = ROUTES[route];
    s += r.bias[item.slot] || 0;
    for (const tg of tagOf[item.name] || []) s += r.tags[tg] || 0;
    let rb = 0; // bonus for countering the enemy team
    for (const [t, rule] of Object.entries(R)) {
      const hit = traits.on[t] && rule.items[item.name];
      // Normally only the two strongest counters per trait get full credit, so one trait can't fill the build.
      const full = level === "heavy" || Object.keys(rule.items).indexOf(item.name) < 2;
      if (hit) rb += hit[0] * (full ? 1 : 0.5);
    }
    const md = stats && enemyIds.length ? matchupDelta(item, enemyIds, stats) : { pts: 0, score: 0, n: 0 };
    s += 1.5 * md.score;
    return { s, rb, md };
  }

  const TIER_MIX = { 4: 4, 3: 5, 2: 3 };

  function build(heroId, route, enemyIds, overrides, stats, level = "counter") {
    const hero = heroById[heroId];
    const traits = activeTraits(enemyIds, overrides);
    const lv = LEVELS[level] || LEVELS.counter;
    const pool = D.items.filter(it => !stats || (stats.base[it.id] && stats.base[it.id][1] >= MIN_BASE) || hero.pop[it.id]);
    const scored = pool.map(it => ({ it, ...scoreItem(it, hero, route, enemyIds, traits, stats, level) }));
    // Apply the counter bonus; on Light only the strongest few counters keep theirs.
    const keep = new Set(scored.filter(x => x.rb > 0).sort((a, b) => b.rb - a.rb).slice(0, lv.keep));
    for (const x of scored) x.s += keep.has(x) ? x.rb * lv.mult + lv.flat : 0;
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
    return { hero, traits, lane, chosen, alts };
  }

  const TIER_TIP = {
    1: "Lane item: cheap stats that pay off early. Sell it when you need the slot for something bigger.",
    2: "An early core item. Buy it on your first or second trip back to the shop.",
    3: "A mid-game power item. Prioritize it before tier 4 items.",
    4: "A late-game item. Save up for it once your tier 3 items are done.",
  };

  function explain(x, hero, enemyIds, traits, route, stats) {
    const out = [];
    out.push({ kind: "what", text: window.LINES[x.it.name] || x.it.desc || "A plain stat item. Check the in-game tooltip for exact numbers." });
    for (const [t, rule] of Object.entries(R)) {
      if (traits.on[t] && rule.items[x.it.name]) out.push({ kind: "rule", text: rule.items[x.it.name][1], trait: rule.label });
    }
    out.push({ kind: "tip", text: window.TIPS[x.it.name] || TIER_TIP[x.it.tier] });
    const secs = stats && stats.buy[x.it.id];
    if (secs && x.it.tier > 1) out.push({ kind: "when", text: `Most ${hero.name} players buy it around minute ${Math.max(1, Math.round(secs / 60))}.` });
    if (enemyIds.length && x.md.n >= 1500 && Math.abs(x.md.pts) >= 0.3) {
      const p = x.md.pts, n = x.md.n.toLocaleString("en-US");
      out.push(p > 0
        ? { kind: "data", text: `Data leans the same way: vs these heroes, ${hero.name} players with this item did ${p.toFixed(1)} win-rate points better than their usual with it (a small effect, ${n} games).` }
        : { kind: "warn", text: `Data disagrees: vs these heroes, ${hero.name} players with it did ${Math.abs(p).toFixed(1)} win-rate points worse than their usual with it (${n} games).` });
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

  window.Engine = { LEVELS, heroById, heroTraits, defaultRoute, activeTraits, build, explain, buyOrder, diffRoutes };
})();

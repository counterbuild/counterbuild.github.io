import json, re
heroes = json.load(open("data/heroes.json", encoding="utf-8"))
items = json.load(open("data/items.json", encoding="utf-8"))

def clean(x):
    t = x.get("description")
    t = t.get("desc") if isinstance(t, dict) else t
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t or "")).strip()

ability_name = {x["class_name"]: x.get("name") for x in items if x.get("type") == "ability"}
def charges(cls):
    a = next((x for x in items if x.get("class_name") == cls), {})
    try: return float(((a.get("properties") or {}).get("AbilityCharges") or {}).get("value") or 0)
    except ValueError: return 0
# Automatic kit facts for each hero, read from the ability data. The hand-written lists in
# site/knowledge.js win when a hero is in them; these cover new heroes until someone adds them.
ability_by_class = {x["class_name"]: x for x in items if x.get("type") == "ability"}
CC_KEYS = [("Sleep", "sleep"), ("Petrify", "petrify"), ("Immobilize", "root"), ("Silence", "silence"),
           ("Hex", "hex"), ("Disarm", "disarm"), ("Tether", "tether"), ("Stun", "stun"), ("Lift", "lift")]
MOVE_WORDS = re.compile(r"\b(dash(?:es)? (?:forward|to|toward)|teleport|leap|fly|flies|flight|grapple|burrow|launch(?:es)? (?:you|yourself)|blink)", re.I)
HEAL_KEYS = re.compile(r"Heal|Lifesteal|Regen|HealthSteal", re.I)

def num(v):
    try: return float(str(v).rstrip("m"))
    except (TypeError, ValueError): return 0.0

def kit(h):
    cc, move, heal, damage = [], [], False, []
    for k in range(1, 5):
        a = ability_by_class.get((h.get("items") or {}).get(f"signature{k}"), {})
        props = a.get("properties") or {}
        live = {n: num(p.get("value")) for n, p in props.items() if num(p.get("value")) > 0}
        kind = next((kd for key, kd in CC_KEYS if any(key in n and "Self" not in n for n in live)), None)
        if kind: cc.append([a.get("name"), kind])
        if k < 4 and MOVE_WORDS.search(clean(a)): move.append(a.get("name"))
        if any(HEAL_KEYS.search(n) and "Enemy" not in n and "Amp" not in n for n in live): heal = True
        dmg = max([v for n, v in live.items() if (props[n].get("css_class") or "") in ("tech_damage", "damage")] + [0])
        cd = live.get("AbilityCooldown", 0)
        if k < 4 and dmg > 0: damage.append((cd or 99, k))
    # Imbue target: the basic damage ability with the shortest cooldown.
    imbue = min(damage)[1] if damage else 1
    return {"autoCC": cc, "autoMove": move, "autoHeal": heal, "autoImbue": imbue}

# Matches per hero in the last 30 days (from tools/update_data.py). A hero still flagged
# "in development" is included once it's really being played.
try:
    played = {}
    for r in json.load(open("data/hero_matches.json", encoding="utf-8")):
        played[r["hero_id"]] = played.get(r["hero_id"], 0) + r["matches_played"]
except FileNotFoundError:
    played = {}
MIN_RECENT_MATCHES = 5000

H = []
for h in heroes:
    if not h.get("player_selectable") or h.get("disabled"): continue
    if h.get("in_development") and played.get(h["id"], 0) < MIN_RECENT_MATCHES: continue
    pop = {}
    for ph in (h.get("popular_items") or {}).values():
        if isinstance(ph, list):
            for e in ph: pop[str(e["item_id"])] = max(pop.get(str(e["item_id"]), 0), round(e["pick_pct"], 1))
    H.append({"id": h["id"], "name": h["name"], "type": h.get("hero_type"), "tags": h.get("tags"),
              "img": h["images"].get("icon_image_small_webp") or h["images"].get("icon_image_small"), "pop": pop,
              # Ability names in key order 1-4 (4 is the ultimate), used by the imbue tips.
              "abilities": [ability_name.get((h.get("items") or {}).get(f"signature{k}"), "") for k in range(1, 5)],
              # Abilities 1-3 that use charges (for Extra Charge and Rapid Recharge).
              "charged": [ability_name.get(h["items"][f"signature{k}"], "") for k in range(1, 4) if charges((h.get("items") or {}).get(f"signature{k}")) > 1],
              **kit(h)})
by_class = {x["class_name"]: x for x in items if x.get("type") == "upgrade"}
upgrades_to = {}
for x in items:
    if x.get("type") == "upgrade" and x.get("shopable") and not x.get("disabled"):
        for c in x.get("component_items") or []:
            upgrades_to.setdefault(c, []).append(x["name"])

def fmt(prop):
    v = str(prop.get("value", "")).strip()
    num = re.match(r"-?[\d.]+", v)
    if not prop.get("label") or not num or float(num.group()) in (0, -1): return None
    post = prop.get("postfix") or ""
    if post.strip() and v.endswith(post.strip()): post = ""
    # The prefix is either "{s:sign}" (show + on positives) or a literal sign such as "-" for
    # slows and debuffs (Hunter's Aura: -15% Fire Rate), whose values come through as positive.
    prefix = (prop.get("prefix") or "").strip()
    if v.startswith(("-", "+")): pre = ""
    elif "{s:sign}" in prefix: pre = "+"
    elif prefix in ("-", "+"): pre = prefix
    else: pre = ""
    out = {"label": prop["label"], "value": pre + v + post}
    sf = prop.get("scale_function") or {}
    if sf.get("specific_stat_scale_type") == "ETechPower" and sf.get("stat_scale"):
        out["scale"] = round(float(sf["stat_scale"]), 2)
    return out

def loc(t):
    t = re.sub(r"<svg.*?</svg>", "", t or "", flags=re.S)
    t = re.sub(r'<span class="highlight[^"]*">(.*?)</span>', lambda m: "**" + m.group(1) + "**", t, flags=re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t)).strip()

def details(x):
    props = x.get("properties") or {}
    secs = []
    for sec in x.get("tooltip_sections") or []:
        out = {"type": sec.get("section_type") or "passive", "parts": []}
        for a in sec.get("section_attributes") or []:
            part = {"text": loc(a.get("loc_string")), "important": [], "props": []}
            for key, names in (("important", a.get("important_properties")), ("props", (a.get("elevated_properties") or []) + (a.get("properties") or []))):
                for n in names or []:
                    f = props.get(n) and fmt(props[n])
                    if f: part[key].append(f)
            if part["text"] or part["important"] or part["props"]: out["parts"].append(part)
        if out["parts"]: secs.append(out)
    # Some items grant flat stats the tooltip list leaves out (e.g. Improved Spirit's bonus
    # health). Anything that's a real stat modifier and always applies goes in the stats block.
    listed = {n for sec in x.get("tooltip_sections") or [] for a in sec.get("section_attributes") or []
              for k in ("properties", "important_properties", "elevated_properties") for n in a.get(k) or []}
    extra = []
    for n, prop in props.items():
        if n in listed or not prop.get("provided_property_type") or "ConditionallyApplied" in (prop.get("usage_flags") or []): continue
        f = fmt(prop)
        if f: extra.append(f)
    if extra:
        innate = next((sec for sec in secs if sec["type"] == "innate"), None)
        if not innate:
            innate = {"type": "innate", "parts": [{"text": "", "important": [], "props": []}]}
            secs.insert(0, innate)
        innate["parts"][0]["props"].extend(extra)
    return {"sections": secs, "upgradesTo": upgrades_to.get(x["class_name"], []),
            "from": [by_class[c]["name"] for c in x.get("component_items") or [] if c in by_class]}

# Same picture order deadlock-api's own item cards use (ui.deadlock-api.com dl-item-card).
def item_img(x):
    return x.get("shop_image_webp") or x.get("shop_image") or x.get("image_webp") or x.get("image")

I = [{"id": x["id"], "name": x["name"], "slot": x["item_slot_type"], "tier": x["item_tier"], "cost": x["cost"],
      "active": bool(x.get("is_active_item")), "img": item_img(x), "desc": clean(x)[:220], "details": details(x)}
     for x in items if x.get("type") == "upgrade" and x.get("shopable") and not x.get("disabled") and x.get("item_tier", 0) <= 4]
open("site/data.js", "w", encoding="utf-8").write("window.DATA=" + json.dumps({"heroes": H, "items": I}, separators=(",", ":")) + ";")
print(len(H), "heroes", len(I), "items", sum(1 for h in H if h["pop"]), "with popular")

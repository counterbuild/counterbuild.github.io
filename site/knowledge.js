// Hand-written game knowledge. Everything the engine "explains" comes from here;
// the API data is only used as evidence on top.

// Extra enemy traits that can't be derived from hero type/tags. Edit freely.
// heal: heroes whose own kit heals them (or their team) enough that healing reduction pays off.
window.HERO_TRAITS = {
  heal: ["Lady Geist", "Dynamo", "Abrams", "Paige", "Rem", "Mo & Krill", "Lash", "Yamato", "Ivy", "Kelvin", "McGinnis", "Warden"],
};

// Abilities that actually lock you down, with what they do, from each ability's in-game description.
// Basic abilities first, ultimate last. Heroes whose kit only slows (Kelvin, Paradox, McGinnis...)
// aren't listed. A hero counts as lockdown for the counter rules when a basic ability is here.
window.HERO_CC = {
  "Infernus": [["Concussive Combustion", "stun"]],
  "Seven": [["Static Charge", "stun"]],
  "Vindicta": [["Stake", "tether"]],
  "Abrams": [["Shoulder Charge", "stun"], ["Seismic Impact", "stun"]],
  "Wraith": [["Telekinesis", "lift"]],
  "Dynamo": [["Kinetic Pulse", "knockup"], ["Singularity", "stun"]],
  "Haze": [["Sleep Dagger", "sleep"]],
  "Holliday": [["Powder Keg", "knockup"], ["Spirit Lasso", "stun"]],
  "Bebop": [["Grapple Arm", "pull"]],
  "Grey Talon": [["Spirit Snare", "tether"], ["Guided Owl", "stun"]],
  "Mo & Krill": [["Burrow", "knockup"], ["Sand Blast", "disarm"], ["Combo", "stun"]],
  "Ivy": [["Stone Form", "stun"], ["Air Drop", "silence"]],
  "Warden": [["Binding Word", "root"]],
  "Lash": [["Death Slam", "stun"]],
  "Viscous": [["Puddle Punch", "knockup"], ["Goo Ball", "stun"]],
  "Mirage": [["Dust Devil", "lift"]],
  "Vyper": [["Petrifying Bola", "petrify"]],
  "Sinclair": [["Rabbit Hex", "hex"]],
  "Mina": [["Nox Nostra", "silence"]],
  "Venator": [["Gutshot", "stun"], ["Hex-Lined Snap Trap", "root"]],
  "Victor": [["Shocking Reanimation", "stun"]],
  "Paige": [["Captivating Read", "root"], ["Rallying Charge", "stun"]],
  "The Doorman": [["Luggage Cart", "pull"], ["Hotel Guest", "banish"]],
  "Billy": [["Bashdown", "knockup"], ["Chain Gang", "pull"]],
  "Graves": [["Grasping Hands", "root"]],
  "Apollo": [["Riposte", "stun"]],
  "Deadman Danny": [["Chimera Mk1", "knockup"], ["Close The Deal", "grab"]],
  "Rem": [["Tag Along", "stun"], ["Naptime", "sleep"]],
  "Celeste": [["Dazzling Trick", "silence"]],
  "Solomon": [["Rook Battery", "root"], ["Develop Queen", "stun"]],
};

// Lockdown counters that only work on some kinds of lockdown (from the items' own text).
// Dispel Magic and Divine Barrier can't clear stuns or sleeps, and Dispel can't be pressed while
// stunned or asleep and doesn't remove ultimate effects (like Pocket's Affliction), so they only
// count against basic-ability roots, tethers, silences, disarms and hexes.
// Items not listed (Debuff Reducer) work on every kind.
window.CC_ITEM_KINDS = {
  "Dispel Magic": { kinds: ["root", "tether", "silence", "disarm", "hex"], noUlt: true },
  "Divine Barrier": { kinds: ["root", "tether", "silence", "disarm", "hex"], noUlt: true },
  "Indomitable": { kinds: ["stun", "sleep", "root", "tether", "silence", "lift", "petrify"] },
  "Reactive Barrier": { kinds: ["stun", "sleep", "root", "tether", "silence", "lift", "petrify"] },
  "Unstoppable": { kinds: ["stun", "sleep", "root", "tether", "silence", "disarm", "lift", "petrify", "hex"] },
};

// trait -> { label, need (how many enemies), items: name -> [weight, why] }
window.RULES = {
  heal: {
    label: "Healing / Lifesteal", need: 1,
    items: {
      "Healbane": [6, "Your spirit damage reduces their healing, and you heal when an affected enemy dies."],
      "Toxic Bullets": [6, "The bleed deals damage based on max health and reduces healing on the target."],
      "Crippling Headshot": [6, "Headshots lower bullet resist, spirit resist and healing in one item."],
      "Inhibitor": [4, "Cuts their outgoing damage and applies healing reduction."],
    },
  },
  tank: {
    label: "Tanky Frontline", need: 2,
    items: {
      "Weakening Headshot": [5, "Headshots reduce bullet resist, which is effective against durable targets."],
      "Armor Piercer": [5, "Bullets can pierce and ignore bullet resistance."],
      "Crippling Headshot": [4, "Lowers bullet and spirit resist on headshot."],
      "Toxic Bullets": [4, "Bleed scales with their max health, so durable targets take more damage."],
      "Decay": [3, "Damage over time based on current health suits high-health targets."],
      "Mystic Vulnerability": [3, "Your spirit damage lowers their spirit resist, so durable targets go down faster."],
    },
  },
  spirit: {
    label: "Spirit Damage", need: 2,
    items: {
      "Spirit Shielding": [5, "Gives a barrier when you take a burst of spirit damage."],
      "Spirit Resilience": [4, "Spirit resist at all times, plus more when you're below half health."],
      "Counterspell": [4, "A parry that blocks the next ability or item effect."],
      "Colossus": [3, "Gives bullet and spirit resist plus a slow aura around you."],
      "Silencer": [4, "Bullets build up a silence that cuts off their ability combos."],
      "Cursed Relic": [4, "Active: silences, disarms and blocks items on their main ability user."],
      "Spellbreaker": [3, "Reduces the next large hit of spirit damage you take."],
      "Silence Wave": [3, "Active: silence them before they can land their combo."],
      "Witchmail": [3, "Heavy spirit hits shorten your cooldowns, so you can fight back."],
    },
  },
  gun: {
    label: "Gun Damage", need: 3,
    items: {
      "Weapon Shielding": [5, "Gives a barrier when you take a burst of weapon damage."],
      "Bullet Resilience": [4, "Bullet resist at all times, plus more when you're below half health."],
      "Plated Armor": [3, "Chance to deflect bullets or negate on-hit effects."],
      "Return Fire": [2, "Fires back at anyone who damages you."],
      "Metal Skin": [3, "Active: become immune to bullets for a moment when gun heroes focus you."],
      "Disarming Hex": [3, "Active: disarm their main gun hero for a few seconds."],
    },
  },
  cc: {
    label: "Lockdown", need: 2,
    items: {
      "Debuff Reducer": [5, "Shortens stuns, slows and silences on you."],
      "Reactive Barrier": [4, "Gives a barrier when stunned, silenced or rooted."],
      "Unstoppable": [4, "Active: shrug off stuns, silences, roots and disarms."],
      "Dispel Magic": [4, "Active: clears roots, silences and slows. Not stuns or sleeps."],
      "Divine Barrier": [3, "Active: clears roots, silences and slows and gives a barrier."],
      "Indomitable": [3, "Automatically cleanses the next stun, sleep, root or silence."],
    },
  },
  mobile: {
    label: "Slippery / Hard to Catch", need: 2,
    items: {
      "Slowing Bullets": [4, "Builds a slow so they can't just run away."],
      "Silencer": [5, "Bullets build to a silence, shutting down escapes and abilities."],
      "Capacitor": [5, "Strong slow that also blocks stamina and silences movement items."],
      "Slowing Hex": [3, "Active: slows them and blocks their movement abilities."],
      "Knockdown": [3, "Active: a delayed stun that lasts longer on targets in the air."],
      "Cursed Relic": [3, "Active: shuts down their items and abilities so they can't escape."],
    },
  },
};

// Build routes. "fit" = hero types the route suits, used to pick a default.
window.ROUTES = {
  gun: {
    name: "Gun Carry", blurb: "Weapon-focused damage. The fastest kills, but the least forgiving.", fit: ["marksman", "assassin"],
    quota: { weapon: 5, spirit: 3, vitality: 4 }, bias: { weapon: 2, spirit: 0, vitality: -1 }, tags: { burst: 1.5, tank: -1 },
  },
  spirit: {
    name: "Spirit Caster", blurb: "Ability damage and cooldowns first, gun second.", fit: ["mystic"],
    quota: { weapon: 3, spirit: 5, vitality: 4 }, bias: { weapon: -0.5, spirit: 2.5, vitality: 0 }, tags: { cd: 2, burst: 0.5 },
  },
  hybrid: {
    name: "Hybrid", blurb: "A mix of weapon and spirit damage with some defense.", fit: [],
    quota: { weapon: 4, spirit: 4, vitality: 4 }, bias: { weapon: 1, spirit: 1.5, vitality: 0 }, tags: { burst: 1, cd: 1.5 },
  },
  tank: {
    name: "Tank / Bruiser", blurb: "Survive longer and win the long fight.", fit: ["brawler"],
    quota: { weapon: 4, spirit: 3, vitality: 5 }, bias: { weapon: 0.5, spirit: 0, vitality: 2.5 }, tags: { tank: 1.5, sustain: 1.5, burst: -0.5 },
  },
  support: {
    name: "Support", blurb: "Keep your team alive and lock enemies down.", fit: [],
    quota: { weapon: 3, spirit: 4, vitality: 5 }, bias: { weapon: -0.5, spirit: 1, vitality: 1.5 }, tags: { team: 3, cd: 1, burst: -1 },
  },
};

// Tags used by route bias (by item name).
window.TAGS = {
  burst: ["Spellslinger", "Mercurial Magnum", "Quicksilver Reload", "Escalating Exposure", "Lucky Shot", "Glass Cannon", "Headshot Booster", "Opening Rounds", "Frenzy", "Burst Fire", "Spiritual Overflow", "Ricochet", "Tesla Bullets"],
  cd: ["Superior Cooldown", "Transcendent Cooldown", "Compress Cooldown", "Boundless Spirit", "Enchanter's Emblem", "Echo Shard", "Refresher", "Mystic Reverb"],
  tank: ["Extra Health", "Juggernaut", "Colossus", "Fortitude", "Battle Vest", "Cheat Death", "Diviner's Kevlar", "Plated Armor", "Spirit Shielding", "Weapon Shielding", "Bullet Resilience", "Spirit Resilience", "Divine Barrier", "Guardian Ward"],
  team: ["Guardian Ward", "Divine Barrier", "Healing Nova", "Rescue Beam", "Restorative Locket", "Healing Rite", "Heroic Aura", "Hunter's Aura", "Silence Wave", "Knockdown", "Slowing Hex", "Healing Tempo", "Enchanter's Emblem"],
  sustain: ["Bullet Lifesteal", "Spirit Lifesteal", "Spiritual Overflow", "Siphon Bullets", "Lifestrike", "Healing Rite", "Restorative Locket", "Leech", "Healing Booster"],
};

// What each item does, in plain words. Falls back to the game description.
window.LINES = {
  "Spellslinger": "Every ability or item you use stacks fire rate and reload speed. Ideal if you cast often.",
  "Silencer": "Bullets build up a silence, which shuts down escapes and key abilities.",
  "Crippling Headshot": "Headshots lower bullet resist, spirit resist and healing.",
  "Mercurial Magnum": "Your imbued ability charges up and reloads your gun on cast, with bonus spirit damage on the next bullets.",
  "Quicksilver Reload": "Your imbued ability charges up over time and reloads your weapon on use. An inexpensive staple.",
  "Escalating Exposure": "Your spirit damage stacks spirit amplification on the target.",
  "Spiritual Overflow": "Fire rate, spirit power and spirit lifesteal build up while shooting enemy heroes.",
  "Boundless Spirit": "A large spirit power boost for all your ability damage.",
  "Cheat Death": "Gives you a second chance in a fight. Useful when you're the enemy's main target.",
  "Siphon Bullets": "Bullets steal health, so long fights favor you.",
  "Ricochet": "Bullets bounce to nearby enemies and carry your on-hit effects.",
  "Lucky Shot": "Bullets can be empowered for bonus damage that can't crit.",
  "Glass Cannon": "Each kill adds permanent fire rate, up to 8 stacks. Dying removes a stack.",
  "Capacitor": "An active projectile with a strong slow that also blocks stamina and silences movement items.",
  "Armor Piercer": "Bullets can pierce and ignore bullet resistance.",
  "Toxic Bullets": "Bleed that scales with max health and cuts healing.",
  "Rapid Rounds": "Fire rate for the laning phase. It's inexpensive and pays for itself early.",
  "Swift Striker": "Extra fire rate. A safe early weapon item.",
  "Extended Magazine": "More ammo per clip, so you can shoot longer before reloading.",
  "Monster Rounds": "Bonus damage against non-hero targets. Good for farming camps and lanes.",
  "Extra Health": "A simple health boost for lane and early fights.",
  "Extra Spirit": "An inexpensive spirit power boost so your abilities hit harder early.",
  "Bullet Lifesteal": "Heals you off the damage your bullets deal.",
  "Spirit Lifesteal": "Heals you off the damage your spirit abilities deal.",
  "Kinetic Dash": "Dash-jumping gives fire rate and bonus ammo for a few seconds.",
  "Fleetfoot": "An active speed boost for chasing or escaping.",
  "Slowing Bullets": "Builds a movement slow so targets can't just run away.",
  "Weakening Headshot": "Headshots reduce bullet resist.",
  "Spirit Shredder": "Bullets reduce spirit resist and give spirit lifesteal against them.",
  "Opening Rounds": "Extra weapon damage against enemies above half health, which is useful for opening a fight.",
  "Headshot Booster": "Your next headshot on a hero deals bonus damage.",
  "Close Quarters": "Bonus damage at close range.",
  "Titanic Magazine": "A much larger clip, so you rarely run out of ammo mid-fight.",
  "Healbane": "Spirit damage reduces their healing, and you heal when an affected enemy dies.",
  "Spirit Shielding": "Gives a barrier when you take a burst of spirit damage.",
  "Weapon Shielding": "Gives a barrier when you take a burst of weapon damage.",
  "Debuff Reducer": "Shortens negative effects on you.",
  "Reactive Barrier": "Gives a barrier when you get stunned, silenced or rooted.",
  "Unstoppable": "Active: become immune to stuns, silences, roots and disarms for a moment.",
  "Colossus": "Grow larger with bullet and spirit resist, and slow nearby enemies.",
  "Inhibitor": "Bullets reduce the target's outgoing damage and healing.",
  "Superior Cooldown": "Shorter ability cooldowns, so you cast more often.",
  "Transcendent Cooldown": "Shorter ability and item cooldowns.",
  "Compress Cooldown": "Imbue one ability to cut its cooldown.",
  "Enchanter's Emblem": "Spirit power and cooldown reduction while above 65% health.",
  "Echo Shard": "Lets you reuse an ability right after casting it.",
  "Refresher": "Resets all your ability cooldowns. A powerful late-game fight tool.",
  "Burst Fire": "Fire rate and move speed after hitting an enemy hero.",
  "Point Blank": "Weapon damage and a slow when you're close to the target.",
  "Tesla Bullets": "Bullets can shock the target and chain to a nearby enemy.",
  "Frenzy": "Fire rate stacks up as you keep shooting.",
  "Plated Armor": "Chance to deflect incoming bullets or negate their on-hit effects.",
  "Juggernaut": "A large durability boost for long fights.",
  "Fortitude": "Health regen after you stay out of damage for a while.",
  "Warp Stone": "An active forward teleport that grants bullet resist. A reliable escape.",
  "Veil Walker": "Gives stealth, healing and speed when you walk through a cosmic veil.",
  "Lifestrike": "Your melee slows and heals you.",
  "Rebuttal": "A good parry heals you and returns the damage.",
  "Return Fire": "Automatically shoots back at attackers.",
  "Divine Barrier": "An active barrier and debuff cleanse that can be cast on an ally.",
  "Guardian Ward": "An active barrier and speed boost that can be cast on an ally.",
  "Spirit Sap": "An active debuff that reduces a target's spirit resist and spirit power.",
  "Mystic Slow": "Spirit damage slows the target.",
  "Silence Wave": "An active silence that stops key abilities.",
  "Decay": "Damage over time based on the target's current health.",
  "Dispel Magic": "Active: removes non-ultimate debuffs from you. It can't be used while stunned or asleep.",
  "Sprint Boots": "More move speed for rotating and chasing.",
  "Extra Stamina": "More stamina for dashes and slides.",
  "Extra Regen": "Faster health regen between fights.",
  "Improved Spirit": "A straightforward spirit power boost.",
  "Indomitable": "Automatically cleanses the next stun, sleep, root or silence that hits you.",
  "Restorative Locket": "An active heal you can use on yourself or an ally.",
  "Counterspell": "Your next parry blocks the damage and effects of an enemy ability or item.",
  "Spirit Resilience": "Gives 30% spirit resist at all times, plus another 15% when you're below half health.",
  "Bullet Resilience": "Gives 30% bullet resist at all times, plus another 15% when you're below half health.",
  "Surge of Power": "Imbue an ability with permanent spirit power and a speed burst on use.",
  "Mystic Burst": "Charges up spirit damage, then your next large ability hit deals bonus damage.",
  "Hollow Point": "Bonus weapon damage while you're above 65% health.",
  "Headhunter": "Your next headshot on a hero does bonus damage, heals you and gives a short bonus.",
  "Long Range": "Bonus weapon damage when you're far from the target.",
  "Hunter's Aura": "Nearby enemies lose bullet resist and fire rate.",
  "Berserker": "Weapon damage rises the more damage you take.",
  "High-Velocity Rounds": "Faster bullets and extra weapon damage, so long-range shots land more easily.",
  "Extra Charge": "Adds a charge to your abilities that use charges, plus spirit power for them.",
  "Rapid Recharge": "Abilities with charges get extra charges, recharge faster and gain spirit power.",
};

// The ability (key 1-3) each hero usually imbues with damage and cast items like Surge of Power,
// Quicksilver Reload and Mercurial Magnum: the damage ability they cast most in fights.
window.HERO_IMBUE = {
  "Infernus": 1, "Seven": 1, "Vindicta": 3, "Lady Geist": 1, "Abrams": 1, "Wraith": 1, "McGinnis": 1,
  "Paradox": 1, "Dynamo": 1, "Kelvin": 1, "Haze": 1, "Holliday": 1, "Bebop": 2, "Calico": 1,
  "Grey Talon": 1, "Mo & Krill": 1, "Shiv": 1, "Ivy": 1, "Warden": 1, "Yamato": 1, "Lash": 1,
  "Viscous": 1, "Pocket": 1, "Mirage": 2, "Vyper": 1, "Sinclair": 1, "Mina": 1, "Drifter": 1,
  "Venator": 3, "Victor": 1, "Paige": 1, "The Doorman": 1, "Billy": 1, "Graves": 2, "Apollo": 1,
  "Deadman Danny": 2, "Rem": 1, "Silver": 3, "Celeste": 1, "Rat King": 2, "Solomon": 1,
};

// Items that only do something for abilities with charges.
window.CHARGE_ITEMS = ["Extra Charge", "Rapid Recharge"];

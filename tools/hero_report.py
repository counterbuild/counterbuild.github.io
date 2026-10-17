"""Compare site/data.js with a saved hero list and describe any heroes that are new.

  python tools/hero_report.py names  > before.txt    # save the current hero names
  python tools/hero_report.py report before.txt      # after updating: Markdown for new heroes

The report prints nothing when no hero is new. It lists what the site guessed automatically for
each new hero, so someone can check it and add the hero to the hand-written lists in knowledge.js.
"""
import json, sys

def load():
    text = open("site/data.js", encoding="utf-8").read().strip()
    return json.loads(text[len("window.DATA="):].rstrip(";"))["heroes"]

if sys.argv[1] == "names":
    print("\n".join(sorted(h["name"] for h in load())))
    sys.exit()

before = set(open(sys.argv[2], encoding="utf-8").read().split("\n"))
new = [h for h in load() if h["name"] not in before]
if not new:
    sys.exit()
for h in new:
    ab = h["abilities"]
    cc = ", ".join(f"{a} ({k})" for a, k in h["autoCC"]) or "none found"
    print(f"### {h['name']}\n")
    print(f"- Abilities: {', '.join(f'{i + 1}. {a}' for i, a in enumerate(ab))}")
    print(f"- Imbue target (guessed): {ab[h['autoImbue'] - 1]}")
    print(f"- Lockdown (guessed): {cc}")
    print(f"- Movement abilities (guessed): {', '.join(h['autoMove']) or 'none found'}")
    print(f"- Self-healing (guessed): {'yes' if h['autoHeal'] else 'no'}")
    print()

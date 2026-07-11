"""Ad-hoc prose dumper for the human-sound review. Prints only reader-facing
text from a Facts post (headline, teasers, prose sections, quiz, misconceptions,
open_questions), skipping SVG, URLs, captions and attributions."""
import json, sys

SKIP_KEYS = {"visual_svg", "image_url", "image_caption", "image_attribution",
             "url", "birth_year", "lifespan", "featured"}

def show(path):
    with open(path, encoding="utf-8") as fh:
        d = json.load(fh)
    fc = d.get("feed_card", {})
    print("HEADLINE:", fc.get("headline", ""))
    print("TEASERS:")
    for t in fc.get("teasers", []):
        print("   -", t)
    print("DIFFICULTY:", fc.get("post_difficulty"))
    print()
    for s in d.get("sections", []):
        t = s.get("type")
        c = s.get("content")
        if t in ("see_it", "sources", "key_numbers"):
            continue
        print(f"### {t} (order {s.get('order')})")
        if isinstance(c, str):
            print(c)
        elif t == "tangible":
            for it in c.get("items", []):
                print("  -", it)
        elif t == "story":
            print(c.get("body", ""))
            for kf in c.get("key_figures", []):
                print(f"  [figure] {kf.get('name')} - {kf.get('role')}: {kf.get('one_line','')}")
        elif t == "angles":
            for a in c:
                print(f"  TITLE: {a.get('title')}")
                print(f"    {a.get('body')}")
        elif t == "misconceptions":
            for m in c:
                print(f"  MYTH: {m.get('myth')}")
                print(f"  REALITY: {m.get('reality')}")
        elif t == "open_questions":
            print(c.get("body", ""))
            for it in c.get("items", []):
                print("  Q-", it)
        elif t == "quiz":
            for q in c:
                print("  Q:", q.get("question"))
                print("     EXPL:", q.get("explanation"))
        print()

if __name__ == "__main__":
    show(sys.argv[1])

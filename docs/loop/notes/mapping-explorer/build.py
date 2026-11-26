"""Builds data.json (for the published page) and preview.html (data inlined, for a local look)."""
import json, pathlib

here = pathlib.Path(__file__).parent
raw = json.load(open(here / "raw.json")  # not in git: the query result, see ../mapping-explorer.md)
profile = json.load(open("/Users/nimishshah/cornerstone/cornerstone-platform/supabase/seed/profile.json"))
subjects = {"NUM": "Mathematics — Number", "HIN": "Hindi", "MAR": "Marathi", "SCI": "Science", "GP": "Global perspectives",
            "HSC": "Home Science", "COM": "Primary Computing", "ART": "Visual Arts", "MUS": "Music", "FMS": "Fine motor skills",
            "GMS": "Gross motor skills", "PE": "Physical education", "ENG": "English"}

skills = raw["skills"]
sidx = {s[0]: i for i, s in enumerate(skills)}
links = {}
for lo, sk in raw["links"]:
    links.setdefault(lo, []).append(sidx[sk])  # KeyError here = a link to a missing skill
units = sorted({l[3] for l in raw["los"]})
uidx = {u: i for i, u in enumerate(units)}
groups = {f"{c['code']}.{g['code']}" for c in profile["capabilities"] for g in c["groups"]}

los = []
for code, band, subj, unit, _topic, title, signal, kind, grp, acts, conf in raw["los"]:
    assert grp == "" or grp in groups, grp
    los.append([code, band, subj, uidx[unit], title, signal, kind, grp, acts, conf, links.get(code, [])])

data = {
    "asOf": "26-Nov-2026",
    "grades": [g[:2] for g in raw["grades"]],
    "subjects": subjects,
    "levels": profile["levels"],
    "caps": [{"code": c["code"], "name": c["name"], "def": c["definition"],
              "groups": [{"code": g["code"], "name": g["name"], "can": g["can"], "stages": g["stages"], "words": g["words"]}
                         for g in c["groups"]]} for c in profile["capabilities"]],
    "skills": skills,
    "units": units,
    "los": los,
}
assert len(los) == 2593 and sum(len(v) for v in links.values()) == 2753
blob = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
(here / "data.json").write_text(blob)
page = (here / "mapping-explorer.html").read_text()
(here / "preview.html").write_text(page.replace("<!--DATA-->", f"<script>window.__DATA={blob}</script>"))
print("data.json", len(blob), "bytes;", len(los), "objectives;", sum(len(v) for v in links.values()), "links")

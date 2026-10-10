"""Trasformazione di una riga del registro IR (foglio 'IR Purchase list', scheda IR) in una richiesta.
Prototipo in Python; la stessa logica gira nell'Apps Script del foglio (ir_sync.gs)."""
import re
import datetime

PROC_RE = re.compile(r"^\s*([A-Z])\)\s*(\S+)")


def clean(s):
    return (s or "").strip()


def money(s):
    s = clean(s).replace("\xa0", " ")
    m = re.search(r"-?\d[\d.]*(?:,\d+)?", s)
    if not m:
        return None
    return float(m.group(0).replace(".", "").replace(",", "."))


def date(s):
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", clean(s))
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return None


def flag(s):
    return clean(s).lower() in ("x", "si", "sì", "yes", "true", "1", "ok")


def norm_ws(s):
    return re.sub(r"\s+", " ", (s or "").replace(" ", " ")).strip()


def proc_from_price(price):
    for code, mx in (("DIR", 200), ("SQ", 2500), ("3Q", 20000), ("SP", 100000)):
        if price <= mx:
            return code
    return "TEN"


def row_to_request(r, prev_date=None):
    """r = lista di celle (stringhe) di una riga della scheda IR. None se la riga non va importata.
    prev_date: data della riga precedente (usata quando la data manca)."""
    r = (list(r) + [""] * 20)[:20]
    ir = clean(r[0])
    description = norm_ws(r[11])
    if not ir or not description:
        return None
    m = PROC_RE.match(r[8])
    if m:
        proc = m.group(2).upper()
    elif clean(r[8]).upper() in ("DIR", "SQ", "3Q", "SP", "TEN"):
        proc = clean(r[8]).upper()
    else:
        proc = None
    price = money(r[9]) or 0.0
    if proc is None:
        proc = proc_from_price(price)
    project = clean(r[6]) or "NA"
    notes = [n for n in (clean(r[2]), clean(r[15])) if n]
    return dict(
        ir=ir, project=project, budget=clean(r[7]) or "NA", description=description, price=price,
        proc=proc, cup=norm_ws(r[5]) or None, supplier=clean(r[10]) or None,
        coordination=project.lower() == "struttura",
        institutional=flag(r[12]), occasional=flag(r[13]),
        created=date(r[3]) or prev_date, initiator=clean(r[4]) or None,
        protocol=clean(r[1]) or None, note=" | ".join(notes) or None,
    )

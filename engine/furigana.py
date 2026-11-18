"""Japanese furigana annotation used by the interview assistant overlay."""

import re

try:
    from pykakasi import kakasi

    _KAKASI = kakasi()
except Exception:  # pragma: no cover - dependency is prepared at install time
    _KAKASI = None

_KANJI = re.compile(r"[\u3400-\u9fff]")


def annotate_tokens(text):
    if not text:
        return []
    if _KAKASI is None:
        return [{"t": text, "r": ""}]
    tokens = []
    for item in _KAKASI.convert(text):
        original = item.get("orig") or ""
        if original == "":
            continue
        reading = (item.get("hira") or "").replace(" ", "").replace("\u3000", "")
        if not _KANJI.search(original) or not reading or reading == original:
            reading = ""
        tokens.append({"t": original, "r": reading})
    return tokens


def annotate_lines(text):
    value = str(text or "")
    lines = value.split("\n")
    if not lines:
        lines = [""]
    return [annotate_tokens(line) for line in lines]

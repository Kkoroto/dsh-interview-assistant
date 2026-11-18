#!/usr/bin/env python
"""Annotate Japanese text with hiragana readings; JSON on stdout, no file writes."""

import argparse
import base64
import json
import sys

from furigana import annotate_lines

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text-base64", required=True)
    args = parser.parse_args()
    try:
        text = base64.b64decode(args.text_base64).decode("utf-8")
    except Exception as exc:
        sys.stderr.write("invalid text: %s\n" % exc)
        return 2
    sys.stdout.write(json.dumps({"lines": annotate_lines(text)}, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

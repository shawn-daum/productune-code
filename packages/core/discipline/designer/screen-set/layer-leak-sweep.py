#!/usr/bin/env python3
"""Layer-leak sweep for a Define screen set (designer `hifi` §Define screen set, check 1 + check 2).

    python3 layer-leak-sweep.py <screen-set.html> [--frame-class frame] [--allow TERM ...] [--term TERM ...]

A screen set is two layers in one file: the spec layer (head card · roster · condition radio ·
description) and the product layer (everything inside an element of class `frame`). Spec
vocabulary must never render inside a frame. This script reads the vocabulary OFF the spec layer,
so it needs no per-project list:

  terms  = visible text of `.r-name` (screen names) + `.cond-name` (condition labels)
         + every element carrying `data-spec-fact` (the document's own facts: title, scope line)
         + `--term` extras
  scan   = visible text of every `.frame` subtree, minus `<script>`/`<style>` and minus any
           subtree carrying data-content="repo" (real repository text rendered inside a screen)
  hit    = a term found in a frame's text, or a `#<digits>` row badge in a frame
  --allow TERM  drops a term that is ALSO the product's own label for something (say why in summary)

Also prints the key equality (check 2): the set of roster `data-screen` values against the set of
`id="screen-<key>"` values.

Exit 0 = no hits and keys equal; exit 1 otherwise. Standard library only.
"""
import argparse
import re
import sys
from html.parser import HTMLParser


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []  # Node or str
        self.parent = parent

    def classes(self):
        return self.attrs.get("class", "").split()


VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def walk(node):
    yield node
    for c in node.children:
        if isinstance(c, Node):
            yield from walk(c)


def text_of(node, skip_repo=False):
    out = []

    def rec(n):
        if isinstance(n, str):
            out.append(n)
            return
        if n.tag in ("script", "style"):
            return
        if skip_repo and n.attrs.get("data-content") == "repo":
            return
        for c in n.children:
            rec(c)

    rec(node)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--frame-class", default="frame", help="class of the product-frame element (default: frame)")
    ap.add_argument("--allow", action="append", default=[], metavar="TERM", help="spec term that is also a product label")
    ap.add_argument("--term", action="append", default=[], metavar="TERM", help="extra spec term to sweep for")
    args = ap.parse_args()

    with open(args.file, encoding="utf-8") as fh:
        doc = fh.read()
    tb = TreeBuilder()
    tb.feed(doc)
    root = tb.root

    # ---- vocabulary off the spec layer
    terms = []
    for n in walk(root):
        cls = n.classes()
        if "r-name" in cls or "cond-name" in cls or "data-spec-fact" in n.attrs:
            t = text_of(n)
            if t:
                terms.append(t)
    terms += args.term
    terms = [t for t in dict.fromkeys(terms) if len(t) >= 2 and t not in set(args.allow)]

    # ---- keys: roster data-screen vs id="screen-<key>"
    roster_keys = {n.attrs["data-screen"] for n in walk(root) if "data-screen" in n.attrs and "roster-item" in n.classes()}
    screen_keys = {n.attrs["id"][7:] for n in walk(root) if n.attrs.get("id", "").startswith("screen-")}
    keys_equal = roster_keys == screen_keys

    # ---- sweep every frame
    frames = [n for n in walk(root) if args.frame_class in n.classes()]
    hits = []
    for i, fr in enumerate(frames):
        screen_ids = [n.attrs["id"] for n in walk(fr) if n.attrs.get("id", "").startswith("screen-")]
        label = screen_ids[0] if len(screen_ids) == 1 else (fr.attrs.get("id") or f"frame#{i}")
        txt = text_of(fr, skip_repo=True)
        for t in terms:
            c = txt.count(t)
            if c:
                hits.append((label, t, c))
        for m in re.finditer(r"(?<![\w&])#\d+\b", txt):
            hits.append((label, m.group(0), 1))

    # ---- report
    print(f"file: {args.file}")
    print(f"spec terms: {len(terms)} · frames: {len(frames)} · screens: {len(screen_keys)} · roster: {len(roster_keys)}")
    print(f"keys equal: {'yes' if keys_equal else 'NO — roster-only ' + str(sorted(roster_keys - screen_keys)) + ' · screen-only ' + str(sorted(screen_keys - roster_keys))}")
    print(f"hits: {sum(c for _, _, c in hits)}")
    for label, t, c in hits:
        print(f"  {label}: {t!r} x{c}")
    if not frames:
        print("  (no frame found — wrong --frame-class?)", file=sys.stderr)
    sys.exit(0 if (not hits and keys_equal and frames) else 1)


if __name__ == "__main__":
    main()

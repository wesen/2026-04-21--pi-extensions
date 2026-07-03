#!/usr/bin/env python3
"""Reference prompto JSONL plugin: docmgr ticket helpers.

Install by copying (or symlinking) into a prompts layer and marking
executable, e.g.:

    cp tickets.plugin.py ~/.pi/agent/prompts/docmgr/tickets
    chmod +x ~/.pi/agent/prompts/docmgr/tickets

Protocol (see docs/plugin-protocol.md):
  --describe          → one {"type":"template",...} line per template, then {"type":"end"}
  render via stdin    → {"type":"render","template":...,"values":{...},"cwd":...}
                      ← optional {"type":"log",...}, then {"type":"prompt","text":...}
"""

import json
import subprocess
import sys


def existing_ticket_ids(cwd):
    """Ticket ids found via docmgr, so the form can offer a computed choice list."""
    try:
        out = subprocess.run(
            ["docmgr", "ticket", "list"],
            capture_output=True, text=True, timeout=3, cwd=cwd, check=False,
        ).stdout
    except Exception:
        return []
    ids = []
    for line in out.splitlines():
        if line.startswith("### "):
            ids.append(line[4:].split(" ")[0])
    return ids[:20]


def describe():
    print(json.dumps({
        "type": "template",
        "name": "close-ticket",
        "title": "Close a docmgr ticket",
        "description": "Pick an existing ticket and generate the closing checklist prompt",
        "fields": [
            {"name": "ticket", "label": "Ticket", "type": "choice",
             "choices": existing_ticket_ids(".") or ["NO-TICKETS-FOUND"], "required": True},
            {"name": "summary", "label": "Closing summary", "type": "text", "required": True},
        ],
    }))
    print(json.dumps({
        "type": "template",
        "name": "ticket-status",
        "title": "Ticket status report",
        "fields": [],
    }))
    print(json.dumps({"type": "end"}))


def render():
    req = json.loads(sys.stdin.readline())
    values = req.get("values", {})
    template = req.get("template")
    if template == "close-ticket":
        print(json.dumps({"type": "log", "message": "building closing prompt"}))
        text = (
            f"Close docmgr ticket {values.get('ticket')}.\n\n"
            f"Closing summary:\n{values.get('summary', '')}\n\n"
            "Check all remaining tasks, update the changelog with a final entry, "
            "run docmgr doctor, and then run: docmgr ticket close --ticket "
            f"{values.get('ticket')}"
        )
        print(json.dumps({"type": "prompt", "text": text}))
    elif template == "ticket-status":
        print(json.dumps({"type": "prompt", "text": "Run docmgr status and summarize every active ticket with open task counts."}))
    else:
        print(json.dumps({"type": "error", "message": f"unknown template {template!r}"}))


if __name__ == "__main__":
    if "--describe" in sys.argv:
        describe()
    else:
        render()

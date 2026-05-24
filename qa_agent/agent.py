#!/usr/bin/env python3
"""
Autonomous QA Agent — 自动找bug并修复
架构：Orchestrator → Tester Agent + Fixer Agent

用法：
  python qa_agent/agent.py          # 每30分钟运行一次
  python qa_agent/agent.py 10       # 每10分钟运行一次
  python qa_agent/agent.py --once   # 只运行一次后退出

环境变量：
  ANTHROPIC_API_KEY  （必须）
  QA_PROJECT_DIR     （可选，默认 /tmp/woyao）
  QA_URL             （可选，已部署的 URL）
"""

import anthropic
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# ── Config ─────────────────────────────────────────────────────────────────────

PROJECT_DIR  = Path(os.environ.get("QA_PROJECT_DIR", "/tmp/woyao"))
DEPLOYED_URL = os.environ.get("QA_URL", "https://woyao-growth-production.up.railway.app")
LOG_FILE     = PROJECT_DIR / "qa_agent_log.jsonl"

# Models: orchestrator uses opus (smarter decisions), workers use sonnet (faster/cheaper)
ORCH_MODEL = "claude-opus-4-7"
WORK_MODEL = "claude-sonnet-4-6"

client = anthropic.Anthropic()

# ── Tools available to all agents ─────────────────────────────────────────────

TOOLS = [
    {
        "name": "read_file",
        "description": "Read a file. Path is relative to project root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "relative path from project root"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Write or overwrite a file.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path":    {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the project directory. Returns stdout + stderr.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string"},
                "timeout": {"type": "integer", "description": "seconds, default 120"},
            },
            "required": ["command"],
        },
    },
    {
        "name": "list_files",
        "description": "List files matching a glob pattern (relative to project root).",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "e.g. app/**/*.tsx"}
            },
            "required": ["pattern"],
        },
    },
]


def _handle_tool(name: str, inp: dict) -> str:
    """Execute a tool call and return the result as a string."""
    if name == "read_file":
        p = PROJECT_DIR / inp["path"]
        try:
            return p.read_text(encoding="utf-8")
        except Exception as e:
            return f"ERROR reading {inp['path']}: {e}"

    if name == "write_file":
        p = PROJECT_DIR / inp["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(inp["content"], encoding="utf-8")
        return f"Wrote {len(inp['content'])} chars to {inp['path']}"

    if name == "run_command":
        timeout = inp.get("timeout", 120)
        try:
            r = subprocess.run(
                inp["command"], shell=True, capture_output=True,
                text=True, cwd=PROJECT_DIR, timeout=timeout,
            )
            out = (r.stdout + r.stderr).strip()
            # Truncate long output to avoid blowing up context
            if len(out) > 5000:
                out = out[-5000:]
            return f"[exit {r.returncode}]\n{out}"
        except subprocess.TimeoutExpired:
            return f"ERROR: timed out after {timeout}s"
        except Exception as e:
            return f"ERROR: {e}"

    if name == "list_files":
        import glob
        files = glob.glob(str(PROJECT_DIR / inp["pattern"]), recursive=True)
        rel = [f.replace(str(PROJECT_DIR) + "/", "") for f in sorted(files)[:60]]
        return "\n".join(rel) if rel else "(no files matched)"

    return f"Unknown tool: {name}"


def run_agent(system: str, user_msg: str, model: str = WORK_MODEL, max_turns: int = 25) -> str:
    """
    Run an agentic loop until the model stops calling tools or reaches max_turns.
    Returns the final text response.
    """
    messages = [{"role": "user", "content": user_msg}]

    for turn in range(max_turns):
        resp = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system,
            tools=TOOLS,
            messages=messages,
        )

        # Accumulate assistant content
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason == "end_turn":
            # Return the last text block
            for block in reversed(resp.content):
                if hasattr(block, "text"):
                    return block.text
            return ""

        if resp.stop_reason == "tool_use":
            results = []
            for block in resp.content:
                if block.type == "tool_use":
                    print(f"      → tool: {block.name}({list(block.input.keys())})")
                    result_text = _handle_tool(block.name, block.input)
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_text,
                    })
            messages.append({"role": "user", "content": results})
        else:
            # Unexpected stop reason
            break

    return "(agent reached max turns)"


# ── Tester Agent ───────────────────────────────────────────────────────────────

TESTER_SYSTEM = f"""You are a senior QA engineer reviewing a Next.js/TypeScript/React web app
(basketball coaching platform deployed at {DEPLOYED_URL}).

Your job: find REAL bugs that would cause visible problems for users.
Focus areas for this project:
1. Promises / async that can hang forever (no timeout, no error handling)
2. WeChat/WKWebView compatibility issues (blob URL video, large WASM, fetch restrictions)
3. TypeScript runtime errors (null/undefined access, wrong type assertions)
4. FFmpeg.wasm lifecycle issues (loading, exec, file cleanup)
5. Infinite loops or runaway setInterval/setTimeout
6. Logic errors in scoring/window selection algorithms

Do NOT report:
- Style issues, missing comments, code smell
- Issues that only affect non-existent edge cases
- Things already caught by TypeScript

When finished, output a JSON block and nothing else after it:
```json
[
  {{
    "file": "app/parent/highlights/page.tsx",
    "line": 42,
    "severity": "high",
    "issue": "One-sentence description of the bug",
    "fix_hint": "Concrete suggestion for how to fix it"
  }}
]
```
Use severity: "high" = crash/infinite hang, "medium" = wrong output, "low" = edge case.
Output `[]` if no real bugs found."""


def run_tester() -> list[dict]:
    print("  🔍 Tester Agent running...")
    raw = run_agent(
        TESTER_SYSTEM,
        """Investigate this project for bugs:
1. run_command: git log --oneline -10   (see recent changes)
2. run_command: npm run build           (catch type/build errors)
3. read_file: app/parent/highlights/page.tsx  (most active file)
4. Check any other recently changed files you spotted in git log
5. Report your findings as JSON per the schema in your instructions.""",
        model=WORK_MODEL,
    )

    # Extract JSON from response
    try:
        for marker in ("```json", "```"):
            start = raw.rfind(marker)
            if start >= 0:
                inner_start = raw.find("\n", start) + 1
                end = raw.find("```", inner_start)
                bugs = json.loads(raw[inner_start:end].strip())
                return bugs
        # Fallback: find bare JSON array
        start = raw.rfind("[")
        end = raw.rfind("]") + 1
        return json.loads(raw[start:end])
    except Exception as e:
        print(f"    ⚠️  Could not parse tester output: {e}")
        return []


# ── Fixer Agent ────────────────────────────────────────────────────────────────

FIXER_SYSTEM = """You are an expert software engineer who fixes bugs in Next.js/TypeScript apps.
Rules:
- Make the minimal change needed to fix the bug
- Never change unrelated code
- After editing, always run: npm run build
- If build fails: revert your edit, report FAILED
- If build passes: run git add + git commit with a clear message
- End your response with exactly one line: "RESULT: FIXED" or "RESULT: FAILED — <reason>"
"""


def run_fixer(bug: dict) -> bool:
    print(f"  🔧 Fixer Agent: {bug['issue'][:65]}")
    raw = run_agent(
        FIXER_SYSTEM,
        f"""Fix this bug:
  File:     {bug['file']}
  Line:     {bug.get('line', '?')}
  Severity: {bug['severity']}
  Issue:    {bug['issue']}
  Hint:     {bug.get('fix_hint', '(none)')}

Steps:
1. read_file: {bug['file']}
2. write_file with the fixed content
3. run_command: npm run build
4. If build OK → run_command: git add {bug['file']} && git commit -m "auto-fix: {bug['issue'][:60]}"
5. If build FAILED → write_file to restore original, then report FAILED""",
        model=WORK_MODEL,
    )

    success = "RESULT: FIXED" in raw
    status  = "✅ FIXED" if success else "❌ FAILED"
    result_line = next((l for l in raw.splitlines() if "RESULT:" in l), raw[-80:])
    print(f"    {status} — {result_line}")
    return success


# ── Orchestrator ────────────────────────────────────────────────────────────────

def orchestrate() -> dict:
    """One full QA cycle: test → fix → push. Returns a summary dict."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{'─'*60}")
    print(f"  QA cycle  {ts}")
    print(f"{'─'*60}")

    # 1. Find bugs
    bugs = run_tester()
    actionable = [b for b in bugs if b.get("severity") in ("high", "medium")]
    print(f"  Bugs found: {len(bugs)} total, {len(actionable)} actionable")

    # 2. Fix bugs (up to 5 per cycle to stay safe)
    fixed, failed = [], []
    for bug in actionable[:5]:
        ok = run_fixer(bug)
        (fixed if ok else failed).append(bug)

    # 3. Push all successful fixes in one shot
    if fixed:
        result = subprocess.run(
            "git push", shell=True, capture_output=True, text=True, cwd=PROJECT_DIR
        )
        if result.returncode == 0:
            print(f"  🚀 Pushed {len(fixed)} fix(es) to origin")
        else:
            print(f"  ⚠️  Push failed: {result.stderr.strip()}")

    # 4. Log this cycle
    entry = {
        "time": ts,
        "bugs_found": len(bugs),
        "bugs_actionable": len(actionable),
        "bugs_fixed": len(fixed),
        "bugs_failed": len(failed),
        "details": bugs[:10],
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"  Summary: found={len(bugs)}, fixed={len(fixed)}, failed={len(failed)}")
    return entry


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = sys.argv[1:]
    run_once = "--once" in args
    interval_min = 30
    for a in args:
        if a.isdigit():
            interval_min = int(a)

    print("🤖 Autonomous QA Agent")
    print(f"   Project : {PROJECT_DIR}")
    print(f"   URL     : {DEPLOYED_URL}")
    print(f"   Log     : {LOG_FILE}")
    if run_once:
        print("   Mode    : run once\n")
    else:
        print(f"   Mode    : loop every {interval_min} min (Ctrl+C to stop)\n")

    while True:
        try:
            orchestrate()
        except KeyboardInterrupt:
            print("\n👋 QA Agent stopped.")
            sys.exit(0)
        except Exception as e:
            print(f"\n  ❌ Orchestrator error: {e}")
            import traceback; traceback.print_exc()

        if run_once:
            break

        print(f"\n  💤 Next run in {interval_min} min...")
        try:
            time.sleep(interval_min * 60)
        except KeyboardInterrupt:
            print("\n👋 QA Agent stopped.")
            sys.exit(0)

#!/bin/bash
# 启动 QA Agent（后台运行，日志写到 qa_agent.out）
# 用法:
#   ./qa_agent/run.sh          # 每30分钟运行
#   ./qa_agent/run.sh 10       # 每10分钟运行
#   ./qa_agent/run.sh --once   # 只跑一次

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV="$SCRIPT_DIR/.venv"
LOG="$PROJECT_DIR/qa_agent.out"

# 检查 API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY not set. Add to ~/.zshrc or ~/.bash_profile:"
  echo '   export ANTHROPIC_API_KEY="sk-ant-..."'
  exit 1
fi

# 创建 venv（首次）
if [ ! -d "$VENV" ]; then
  echo "📦 Creating virtualenv..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"
  echo "✅ Dependencies installed"
fi

export QA_PROJECT_DIR="$PROJECT_DIR"
export QA_URL="https://woyao-growth-production.up.railway.app"

INTERVAL="${1:-30}"

if [ "$1" = "--once" ]; then
  echo "▶ Running QA Agent once..."
  "$VENV/bin/python" "$SCRIPT_DIR/agent.py" --once
else
  echo "▶ Starting QA Agent in background (every $INTERVAL min)..."
  echo "   Logs: $LOG"
  echo "   Stop: kill \$(cat $PROJECT_DIR/qa_agent.pid)"
  nohup "$VENV/bin/python" "$SCRIPT_DIR/agent.py" "$INTERVAL" \
    > "$LOG" 2>&1 &
  echo $! > "$PROJECT_DIR/qa_agent.pid"
  echo "✅ Started (PID $(cat $PROJECT_DIR/qa_agent.pid))"
fi

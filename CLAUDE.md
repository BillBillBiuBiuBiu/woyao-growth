@AGENTS.md

## 团队 Agent 角色

本项目使用三个专职 Agent 协作，系统提示词位于 `agents/` 目录：

| 角色 | 文件 | 职责 |
|------|------|------|
| 小龙（PM） | `agents/xiaolong.md` | 需求过滤 → PRD → 任务分发给沃兹 |
| 沃兹（Dev） | `agents/woz.md` | 接收任务清单，编码实现，提测给柯南 |
| 柯南（QA） | `agents/conan.md` | 极限测试，破案定位 Bug，打回沃兹修复 |

每次循环工作流（三角协作，顺序不可跳过）：
1. **小龙** 审视现有产品 → 决定砍什么 / 做什么 → 输出 PRD + 沃兹任务清单
2. **沃兹** 实现任务 → build 验证 → commit → 提测申请
3. **柯南** 白盒审查 + 逻辑审查 → 绿灯通行 / 打回修复 → 写入日志 → git push

完整循环 prompt 见 `agents/loop_prompt.md`，直接复制粘贴使用。

### 历史记录
循环历史见 `qa_cron_log.jsonl`（只追加，禁止修改）。
`qa_agent/` 目录为旧循环脚本，禁止修改。

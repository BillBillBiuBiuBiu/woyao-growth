@AGENTS.md

## 团队 Agent 角色

本项目使用三个专职 Agent 协作，系统提示词位于 `agents/` 目录：

| 角色 | 文件 | 职责 |
|------|------|------|
| 小龙（PM） | `agents/xiaolong.md` | 需求过滤 → PRD → 任务分发给沃兹 |
| 沃兹（Dev） | `agents/woz.md` | 接收任务清单，编码实现，提测给柯南 |
| 柯南（QA） | `agents/conan.md` | 极限测试，破案定位 Bug，打回沃兹修复 |

工作流：主神 → 小龙（PRD）→ 沃兹（代码）→ 柯南（测试）→ 交付 / 打回

### QA 自动循环
柯南的自动 QA 循环由 `qa_agent/` 驱动，任务方向见 `qa_mission.txt`，历史记录见 `qa_cron_log.jsonl`。
禁止修改这两个文件。

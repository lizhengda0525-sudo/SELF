# 开源实现调研

核对日期：2026-09-14。本次复用的是设计思路，业务实现为 SELF 新写；未复制以下项目源码、图片或品牌资产。

| 项目与固定版本 | 已查看实现 | SELF 采用的做法 | 差异 |
| --- | --- | --- | --- |
| [Super Productivity](https://github.com/super-productivity/super-productivity/tree/23fcdae6195f4742086d7a6099cf69c0079da283)，MIT | src/app/features/tasks/task.model.ts；src/app/op-log/sync/conflict-journal.model.ts | 区分任务日与具体时间；任务关联专注；保留冲突版本 | SELF 0.2 采用客户端三方逐记录冲突，不移植 Angular/NgRx 操作日志系统 |
| [Actual Budget](https://github.com/actualbudget/actual/tree/f8ad7c0ebd76e09c3431ed085c4d336c907bbcd1)，MIT | packages/loot-core/src/shared/util.ts 的 amountToInteger / integerToAmount；README 的 core/client/server 分层 | 整数最小货币单位、本地优先、业务计算独立于 UI | SELF 对人民币金额做十进制字符串解析；暂不采用其预算和 CRDT 实现 |
| [Wallos](https://github.com/ellite/Wallos/tree/52820e87ca5a6e105fdbb7f1c0c681bc0cfee2fd)，GPL-3.0 | endpoints/subscription/renew.php；README | 会员周期与续费操作独立；到期与周期成本分开展示 | 按 SELF PRD 保留已付款周期，不自动跳过逾期月份；新增周期账单需主动勾选；不复制其 PHP 实现 |

基础库：React（MIT）、Dexie / dexie-react-hooks（Apache-2.0）、Lucide（ISC）、Vite（MIT）、vite-plugin-pwa（MIT）。以锁文件对应包的许可证为准。后续如直接引入源码，应在本文件登记路径、固定 SHA、修改说明及原许可全文。

## 用户补充的体验参考

- [滴答清单](https://ticktick.com/features)：今天、快速添加、清单、专注与习惯入口的组织。仅依据公开产品说明参考交互，没有引入其源码或素材。
- [Microsoft To Do](https://support.microsoft.com/en-US/ToDo/my-day-and-suggestions)：My Day 的当日聚焦和清单组织。TODO 在本轮暂按 Microsoft To Do 理解。
- [Loop / uHabits](https://github.com/iSoron/uhabits/blob/7e993e17b2b674d4b5b1291ebd18677b74810df2/uhabits-core/src/commonMain/kotlin/org/isoron/uhabits/core/models/Entry.kt)，GPL-3.0：核对 Entry.kt 的 UNKNOWN / NO / SKIP / YES_MANUAL 状态。SELF 独立实现未记录、未完成、跳过、完成；不复制 Kotlin 源码。首版只支持每日习惯，跳过不增加连续完成次数，也不中断连续段；历史缺失中断连续段，当天未记录不提前中断。每个习惯每日最多一个状态。

参考文档：[Dexie React](https://dexie.org/docs/Tutorial/React)、[Capacitor](https://capacitorjs.com/docs)、[Tauri 2](https://v2.tauri.app/start/)。

## 0.2 直接使用的依赖

- FullCalendar 6.1.21（MIT）：React、dayGrid、timeGrid、interaction，用于日周月显示与拖拽；重复实例、保存事务与金额校验由 SELF 实现。参见 [eventDrop](https://fullcalendar.io/docs/v6/eventDrop)。
- Capacitor 8.5.2（MIT）及本地通知/文件/分享插件：Android 系统桥接；[通知权限与非精确提醒](https://capacitorjs.com/docs/apis/local-notifications)。
- Tauri 2（MIT/Apache-2.0）与 notification / single-instance 插件：Windows 容器、托盘、通知与单实例。[通知限制](https://v2.tauri.app/plugin/notification/)、[单实例](https://v2.tauri.app/plugin/single-instance/)。Rust 和 JS 的确切版本分别锁在 Cargo.lock 和 pnpm-lock.yaml。

原生工程由对应官方脚手架生成；没有复制滴答、Microsoft To Do 或 uHabits 源码。

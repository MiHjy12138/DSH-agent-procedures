# 工具-pnpm版本不存在

> **触发**：pnpm 安装时报 `ERR_PNPM_NO_MATCHING_VERSION`，或 lockfile 的可选依赖版本在 registry 不存在
> **验证**：`pnpm install` 成功，lockfile 中的可选依赖版本可解析。

## 首选

删除 lockfile 中不存在的可选依赖条目，重新生成 lockfile。

## 被挡时

1. 固定到 registry 中存在的版本。
2. 用 `--no-optional` 跳过该可选依赖。

## 别再来

| 弯路 | 为什么不通 |
| --- | --- |
| 只删 node_modules | lockfile 里仍是坏版本 |
| 直接升级 pnpm | 版本不存在与 pnpm 版本无关 |

## 注意

- 报错指向的是 lockfile，不是缓存。
- 判据是 `pnpm install` 真能跑完。

证据：fixture

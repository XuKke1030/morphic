# Admin Dashboard Table 重构方案

## 目标页面

`components/admin-dashboard.tsx`

## 当前问题

- 4 个原生 `<table>`（用户表、示例问题表、主题绑定表、日志表）+ 若干卡片列表
- 分页器是假按钮，没有真实逻辑
- 表格没有滚动容器，数据多时整个页面滚
- 宽表格没有横向滚动

## 改造方案

### 1. 安装 shadcn/ui Table 组件

```bash
npx shadcn@latest add table
```

生成 `components/ui/table.tsx`，内含 Table/TableHeader/TableBody/TableHead/TableRow/TableCell 5 个子组件。

### 2. 封装通用分页 Table 容器组件

新建 `components/ui/paginated-table.tsx`

**Props:**

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| columns | ColumnDef[] | - | 列定义 |
| data | T[] | - | 数据源 |
| pageSize | number | 10 | 每页条数 |
| scrollY | number | 400 | 表格区域最大高度(px)，超出滚动 |

**功能:**

- 内部 `useState` 维护 `currentPage`，前端分页
- 表格区域 `max-h-[scrollY] overflow-y-auto`，表头 sticky 固定
- 外层容器 `overflow-x-auto`，宽表格可横向滚动
- 底部分页器：上一页/下一页 + 页码按钮 + "共 N 条"

### 3. 逐个替换 4 个 table

| 表格 | 列数 | 数据量 | 分页 | 横向滚动 |
|------|------|--------|------|----------|
| 用户表 | 6 | 不定 | 10条/页 | 不需要 |
| 示例问题表 | 6 | 不定 | 10条/页 | 不需要 |
| 主题绑定表 | 5 | 少量 | 10条/页 | 不需要 |
| 日志表 | 5 | 少量 | 10条/页 | 不需要 |

- 替换标签名，保留现有自定义 className
- 搜索过滤逻辑保留（filter → 再分页）

### 4. 页面布局调整

- 主内容区 `main` 去掉 `overflow-y-auto`，改为 `overflow-hidden`
- 每个 Panel 内部自行管理滚动
- 表格用 scrollY 限制高度，卡片列表同理
- 页面整体不再出滚动条

### 5. 不动的部分

- 卡片列表（Candidates、Metrics、Sync Tasks 等）保持原样，暂不改造
- 侧边栏不变
- Modal 不变

## 验证清单

- [ ] 翻页功能正常
- [ ] 表头固定、表体可滚
- [ ] 搜索过滤后分页重置到第1页
- [ ] 页面无整体滚动条
- [ ] 视觉与当前一致
- [ ] 宽表格横向滚动正常

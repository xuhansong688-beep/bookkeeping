# Bookkeeping Demo

这是一个纯前端交互 Demo，用于验证 Bookkeeping MVP 的界面和操作流程。

## 运行

直接用浏览器打开：

```text
demo/index.html
```

不需要安装依赖，也不需要启动后端。

## 可体验内容

- 查看本月收入和支出汇总
- 手动新增收入或支出
- 上传本地图片，体验模拟识别流程
- 使用内置示例小票
- 查看账单详情
- 编辑和删除账单
- 恢复初始演示数据
- 使用浏览器本地存储保存演示数据

## 模拟规则

- 图片识别由前端根据文件名返回稳定的模拟结果
- 识别结果可以修改后再保存
- 账单数据默认保存在 `localStorage`
- 刷新页面后数据仍然存在

## 测试

在项目根目录运行：

```bash
node --test demo/app.test.js
```

## 文件结构

```text
demo/
├── index.html
├── styles.css
├── app.js
├── app.test.js
└── README.md
```

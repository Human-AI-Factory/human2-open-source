# 沪漫二厂 | Human-AI-Factory 2

<p align="center">
  <b>致敬上海美术电影制片厂</b><br>
  让中国动画的"精气神"焕发新生
</p>

---

AI 动漫创作平台的工作流引擎。Organize your projects by Drama and Episode, manage character/scene/prop assets, generate storyboards, and produce videos with multi-vendor AI integration.

## 产品系列

| 工厂 | 状态 | 描述 |
|:---:|:---:|---|
| [沪漫一厂](https://github.com/human-ai-factory/human-ai-factory-web) | 开发中 | 0成本短篇小说生成器 |
| 沪漫二厂 | 可用 | AI 动漫 Agent 工作流 |
| 沪漫三厂 | 规划中 | IP Generator |

## Features

- **剧集管理** - 以 Drama/Episode 结构组织项目
- **域对象工作台** - 管理角色、场景、道具资产
- **资产工作台** - AI 生成和管理角色/场景/道具资产
- **分镜生成** - 从剧本自动生成故事板
- **时间线编辑** - 多轨非线性视频编辑
- **多厂商 AI 集成** - 支持多种 AI 服务商:
  - 文本生成 (LLM)
  - 图像生成 (T2I)
  - 视频生成
  - 音频/TTS 合成

## Tech Stack

- **Backend**: Node.js + Express + SQLite + TypeScript
- **Frontend**: Vue 3 + Vite + TypeScript
- **AI Providers**: HTTP-based abstraction layer supporting multiple vendors

## Quick Start

### 前置要求

- Node.js 18+
- yarn (推荐)
- ffmpeg (用于视频处理)

### 安装

```bash
# 克隆仓库
git clone https://github.com/human-ai-factory/human2-open-source.git
cd human2-open-source

# 安装后端依赖
cd backend
yarn install

# 安装前端依赖
cd ../frontend
yarn install
```

### 启动应用

```bash
# 终端 1: 启动后端 (端口 60000)
cd backend
yarn dev

# 终端 2: 启动前端 (端口 5173)
cd frontend
yarn dev
```

在浏览器打开 http://localhost:5173

### 默认登录

```
用户名: admin
密码: admin123
```

> **注意**: 生产环境请修改默认密码!

## AI 厂商配置

应用支持多种 AI 服务商。可以通过 **设置 → 模型连接** 进行配置:

1. **DashScope** (阿里云) - 文本、图像、视频、音频
2. **OpenAI** - 文本、图像、视频
3. **Runway** - 视频生成
4. **Kling** - 视频生成
5. **Minimax** - 文本、音频
6. **Vidu** - 视频生成
7. **Wan** (通义万相) - 图像生成
8. **ElevenLabs** - 音频/TTS

添加新厂商:
1. 进入设置 → 模型连接
2. 点击 "添加模型配置"
3. 从 AI 厂商文档中粘贴 curl/requests 示例
4. 系统会自动解析端点、模型和 API Key

## 项目结构

```
human2-open-source/
├── backend/           # Express API 服务
│   ├── src/
│   │   ├── config/        # 环境配置
│   │   ├── core/          # 核心类型
│   │   ├── db/            # SQLite 数据层
│   │   ├── modules/       # 功能模块
│   │   │   ├── auth/      # 认证
│   │   │   ├── domain/    # 项目/剧集/集管理
│   │   │   ├── pipeline/  # AI 任务流水线
│   │   │   └── settings/  # 系统设置
│   │   └── app.ts         # 入口文件
│   └── test/              # 单元测试
├── frontend/          # Vue 3 单页应用
│   ├── src/
│   │   ├── api/           # API 客户端
│   │   ├── components/    # 可复用组件
│   │   ├── features/      # 功能模块
│   │   │   ├── auth/      # 登录
│   │   │   ├── domain/    # 项目管理
│   │   │   ├── asset-workbench/  # 资产生成
│   │   │   ├── timeline-editor/   # 视频编辑
│   │   │   └── settings/  # 配置
│   │   └── composables/   # Vue 组合式 API
│   └── test/              # 单元测试
├── docker-compose.yml # Docker 部署
└── Dockerfile         # 容器构建
```

## Docker 部署

```bash
# 构建并运行
docker-compose up --build
```

## 开发

```bash
# 运行后端测试
cd backend
yarn test

# 运行前端测试
cd frontend
yarn test

# 类型检查
cd backend
yarn typecheck

cd frontend
yarn typecheck
```

## 相关链接

- [沪漫工厂官网](https://human-ai-factory.github.io)
- [沪漫一厂 (短篇小说生成器)](https://github.com/human-ai-factory/human-ai-factory-web)

---

<p align="center">
  <sub>© 2026 沪漫工厂 · Human-AI-Factory</sub>
</p>

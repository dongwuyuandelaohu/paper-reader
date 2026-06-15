# 引擎打包系统

本目录包含将 Marker 和 MinerU 引擎打包为独立可执行文件的脚本和工具。

## 打包策略

我们采用**轻量级包装器**策略：
- 不打包引擎本身及其依赖（避免 PyInstaller 打包复杂依赖导致的模块重复加载问题）
- 只打包一个简单的 Python 脚本，通过 `subprocess` 调用系统中已安装的引擎命令
- 要求用户系统中已安装对应的引擎包（`marker-pdf` 或 `mineru`）

**优点：**
- 可执行文件体积极小（约 6.8MB）
- 避免依赖冲突和模块重复加载问题
- 打包速度快（约 1-2 分钟）

**缺点：**
- 需要用户预先安装引擎包
- 不是完全独立的"绿色软件"

## 打包结果

| 引擎 | 可执行文件 | 大小 | 依赖 |
|------|-----------|------|------|
| Marker | `marker-engine` | 6.8 MB | `marker-pdf` |
| MinerU | `mineru-engine` | 6.8 MB | `mineru` |

## 使用方法

### 打包所有引擎

```bash
./build.sh
```

### 只打包特定引擎

```bash
# 只打包 Marker
./build.sh marker

# 只打包 MinerU
./build.sh mineru
```

### 输出位置

打包完成后，可执行文件位于 `dist/` 目录：
- `dist/marker-engine`
- `dist/mineru-engine`

## 包装器工作原理

### marker-wrapper-v4.py

```python
def find_marker_single():
    """查找 marker_single 命令"""
    # 1. 检查 PATH
    # 2. 检查常见安装位置
    
def main():
    marker_path = find_marker_single()
    cmd = [marker_path] + sys.argv[1:]
    result = subprocess.run(cmd)
    sys.exit(result.returncode)
```

### mineru-wrapper-v4.py

```python
def find_mineru():
    """查找 mineru 命令"""
    # 1. 检查 PATH
    # 2. 检查常见安装位置
    
def main():
    mineru_path = find_mineru()
    cmd = [mineru_path] + sys.argv[1:]
    result = subprocess.run(cmd)
    sys.exit(result.returncode)
```

## 引擎安装系统

### 后端 API

#### 安装引擎

```http
POST /api/v1/system/engines/{engine_name}/install?use_precompiled=true
```

**参数：**
- `engine_name`: `marker` 或 `mineru`
- `use_precompiled`: 是否优先使用预编译包（默认 `true`）

**响应：**
```json
{
  "status": "started",
  "message": "开始安装 marker（使用预编译包）",
  "use_precompiled": true
}
```

#### 查询安装状态（SSE）

```http
GET /api/v1/system/engines/{engine_name}/install/status
```

**响应（SSE 流）：**
```
data: {"status": "installing", "progress": 15, "logs": [...]}
data: {"status": "installing", "progress": 45, "logs": [...]}
data: {"status": "completed", "progress": 100, "logs": [...]}
```

### 安装流程

1. **预编译包安装**（推荐）
   - 从 GitHub Releases 下载预编译的可执行文件
   - 验证 SHA256 哈希
   - 解压到 `~/.paperlens/engines/{engine_name}/`
   - 设置可执行权限

2. **pip 安装**（回退方案）
   - 如果预编译包安装失败，自动回退到 pip 安装
   - 执行 `pip install marker-pdf` 或 `pip install mineru`

3. **验证安装**
   - 调用引擎检测器验证引擎是否可用
   - 更新数据库中的引擎状态

### 配置文件

`backend/config/engine_packages.json` 定义了各平台的预编译包信息：

```json
{
  "marker": {
    "version": "1.10.2",
    "packages": {
      "darwin-arm64": {
        "url": "https://github.com/paper-reader/engines/releases/download/marker-1.10.2/marker-engine-darwin-arm64.tar.gz",
        "sha256": "placeholder_sha256_hash",
        "size_mb": 6.8,
        "binary": "marker-engine"
      },
      "darwin-x86_64": { ... },
      "linux-x86_64": { ... },
      "windows-x86_64": { ... }
    },
    "fallback_pip_package": "marker-pdf==1.10.2"
  },
  "mineru": { ... }
}
```

## 发布预编译包

### 步骤 1：打包引擎

```bash
cd build-engines
./build.sh
```

### 步骤 2：创建发布包

```bash
cd dist

# 创建 tar.gz 包（Unix）
tar -czf marker-engine-darwin-arm64.tar.gz marker-engine
tar -czf mineru-engine-darwin-arm64.tar.gz mineru-engine

# 创建 zip 包（Windows）
zip marker-engine-windows-x86_64.zip marker-engine.exe
zip mineru-engine-windows-x86_64.zip mineru-engine.exe
```

### 步骤 3：计算 SHA256 哈希

```bash
shasum -a 256 marker-engine-darwin-arm64.tar.gz
shasum -a 256 mineru-engine-darwin-arm64.tar.gz
```

### 步骤 4：上传到 GitHub Releases

1. 创建新的 Release（例如 `marker-1.10.2`）
2. 上传所有平台的压缩包
3. 更新 `engine_packages.json` 中的 URL 和 SHA256

## 前端集成

### EngineModal.tsx

引擎选择弹窗现在支持：
- 显示引擎状态（可用/不可用/正在安装）
- 显示安装进度条
- 显示实时安装日志
- 自动刷新引擎列表

### 使用示例

```tsx
<EngineModal
  open={showEngineModal}
  onClose={() => setShowEngineModal(false)}
  engines={engines}
  selectedEngine={selectedEngine}
  onSelect={setSelectedEngine}
  onStartParse={handleStartParse}
  parsing={parsing}
  onRecheck={handleRecheckEngines}
  onEnginesUpdate={fetchEngines}
/>
```

## 故障排查

### 问题 1：打包后运行报错 "cannot load module more than once per process"

**原因：** PyInstaller 打包复杂依赖时导致模块重复加载

**解决方案：** 使用 v4 包装器（轻量级 subprocess 调用）

### 问题 2：找不到 marker_single 或 mineru 命令

**原因：** 引擎包未安装或不在 PATH 中

**解决方案：**
```bash
# 安装 Marker
pip install marker-pdf

# 安装 MinerU
pip install mineru

# 添加到 PATH
export PATH="$HOME/.local/bin:$PATH"
```

### 问题 3：打包时 PyInstaller 权限错误

**原因：** PyInstaller 试图写入系统目录

**解决方案：** 设置环境变量
```bash
export PYINSTALLER_CACHE_DIR="$SCRIPT_DIR/.pyinstaller-cache"
export PYINSTALLER_CONFIG_DIR="$SCRIPT_DIR/.pyinstaller-config"
```

## 未来改进

1. **自动构建 CI/CD**
   - 使用 GitHub Actions 自动构建各平台的预编译包
   - 自动上传到 GitHub Releases

2. **增量更新**
   - 支持只下载差异部分
   - 减少更新时的下载量

3. **完全独立打包**
   - 研究使用 Docker 或 AppImage 技术
   - 实现真正的"绿色软件"

4. **多引擎管理**
   - 支持同时安装多个版本的引擎
   - 支持引擎的卸载和降级

## 相关文件

- `build.sh` - 主打包脚本
- `marker-wrapper-v4.py` - Marker 包装器
- `mineru-wrapper-v4.py` - MinerU 包装器
- `backend/services/engine_installer.py` - 引擎安装服务
- `backend/api/system.py` - 系统 API
- `backend/config/engine_packages.json` - 预编译包配置
- `frontend/src/components/EngineModal.tsx` - 引擎选择弹窗

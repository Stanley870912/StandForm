# 🏪 攤位登記系統 (Booth Scheduler)

一個可自動將登記資料同步到 GitHub 的攤位排程管理系統，支援模糊搜尋地點、防重複登記，並可透過 Netlify 自動部署。

## ✨ 功能特色

- ✅ **攤主管理**：從固定清單選擇攤主
- 🏷️ **類別分類**：支援糖果、餅乾兩種攤位類別篩選
- 🔍 **模糊搜尋**：支援攤位地點自動完成與模糊搜尋
- ➕ **自動新增**：輸入新地點時自動加入系統
- 🚫 **防重複**：同攤主+日期 或 同地點+日期 不可重複登記
- ✏️ **修改地點**：可修改已登記的攤位地點
- 🗑️ **自動清理**：每次登記時自動刪除一個月前的舊資料
- � **GitHub 同步**：每次登記、修改或清理自動 commit 至 GitHub
- 📊 **多條件篩選**：可依攤主、類別、地點、日期篩選檢視紀錄
- 📱 **響應式設計**：支援各種螢幕尺寸

## 📁 專案結構

```
booth-scheduler/
├── index.html              # 登記頁面
├── view.html               # 檢視紀錄頁面
├── data/
│   ├── vendors.json        # 攤主清單
│   ├── booths.json         # 攤位清單（可自動擴充）
│   └── schedule.json       # 登記紀錄
├── netlify/
│   └── functions/
│       ├── submit.js       # 表單提交、自動清理舊資料與 GitHub API
│       └── update.js       # 修改地點與 GitHub API
└── README.md
```

## 🚀 部署步驟

### 1️⃣ 準備 GitHub Repository

1. 在 GitHub 建立新的 repository（例如：`booth-scheduler`）
2. 將此專案所有檔案上傳至該 repository
3. 確保 `data/` 資料夾中的三個 JSON 檔案都已上傳

### 2️⃣ 建立 GitHub Personal Access Token

1. 前往 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 點擊 "Generate new token" → "Generate new token (classic)"
3. 設定：
   - Note: `Booth Scheduler`
   - Expiration: 選擇適當的有效期限
   - **勾選權限**: `repo` (完整權限)
4. 點擊 "Generate token"，**複製並妥善保存** token（只會顯示一次）

### 3️⃣ 部署到 Netlify

#### 方法一：透過 Netlify UI（推薦）

1. 前往 [Netlify](https://www.netlify.com/) 並登入
2. 點擊 "Add new site" → "Import an existing project"
3. 選擇 "GitHub"，授權並選擇你的 repository
4. 建置設定：
   - **Build command**: 留空
   - **Publish directory**: `/`（專案根目錄）
5. 點擊 "Deploy site"

#### 方法二：透過 Netlify CLI

```bash
# 安裝 Netlify CLI
npm install -g netlify-cli

# 登入
netlify login

# 初始化並部署
netlify init
netlify deploy --prod
```

### 4️⃣ 設定環境變數

在 Netlify 專案後台設定以下環境變數：

1. 前往 Site settings → Environment variables
2. 新增以下變數：

| 變數名稱            | 說明                          | 範例值                        |
| --------------- | --------------------------- | -------------------------- |
| `GITHUB_TOKEN`  | 你的 GitHub Personal Token   | `ghp_xxxxxxxxxxxx`         |
| `GITHUB_REPO`   | GitHub repository 完整路徑     | `username/booth-scheduler` |
| `GITHUB_BRANCH` | 分支名稱                        | `main`                     |
| `VENDOR_FILE`   | 攤主資料檔案路徑                    | `data/vendors.json`        |
| `BOOTH_FILE`    | 攤位資料檔案路徑                    | `data/booths.json`         |
| `SCHEDULE_FILE` | 登記紀錄檔案路徑                    | `data/schedule.json`       |

3. 儲存後重新部署網站

### 5️⃣ 測試系統

1. 開啟部署後的網址（例如：`https://your-site.netlify.app`）
2. 在登記頁面填寫資料並提交
3. 檢查 GitHub repository 是否有新的 commit
4. 前往檢視頁面確認資料是否正確顯示

## 📝 使用說明

### 登記新攤位

1. 開啟 `index.html`
2. 選擇攤主
3. 輸入或選擇攤位地點（支援模糊搜尋）
4. 選擇日期
5. 點擊「提交登記」

### 檢視登記紀錄

1. 開啟 `view.html`
2. 使用篩選功能：
   - **攤主篩選**：下拉選單選擇特定攤主
   - **類別篩選**：選擇「糖果」或「餅乾」
   - **地點篩選**：輸入關鍵字模糊搜尋
   - **日期篩選**：選擇特定日期
3. 點擊「套用篩選」查看結果
4. 點擊「清除篩選」重置條件

### 修改攤位地點

1. 在 `view.html` 檢視頁面找到要修改的紀錄
2. 點擊該紀錄列的「✏️ 改地點」按鈕
3. 在彈出的對話框中：
   - 查看當前地點資訊
   - 輸入或選擇新的攤位地點（支援模糊搜尋）
   - 若輸入新地點，系統會自動新增
4. 點擊「儲存變更」完成修改
5. 系統會自動檢查新地點在該日期是否已被佔用
6. 修改成功後會自動同步到 GitHub

### 自動清理舊資料

系統會在**每次登記新攤位時自動執行清理**：

1. 自動檢測並刪除 `schedule.json` 中一個月前的所有紀錄
2. 在 commit 訊息中註記清理筆數
3. 如果有清理資料，成功訊息會顯示清理筆數
4. 完全自動化，無需手動操作

> **範例**：2025年11月2日登記時，會自動刪除 2025年10月2日之前的所有紀錄。

### 修改攤主清單

編輯 `data/vendors.json`：

```json
[
  { "vendor_id": "北一", "vendor_name": "北一", "category": "糖果" },
  { "vendor_id": "南一", "vendor_name": "南一", "category": "餅乾" },
  { "vendor_id": "V004", "vendor_name": "新攤主名稱", "category": "糖果" }
]
```

**類別選項**：
- `糖果`
- `餅乾`

### 預設攤位地點

編輯 `data/booths.json`：

```json
[
  { "booth_location": "A1", "booth_name": "中庭攤位A1" },
  { "booth_location": "B2", "booth_name": "走廊攤位B2" },
  { "booth_location": "C3", "booth_name": "新攤位地點" }
]
```

> **注意**：使用者在登記時輸入不存在的地點，系統會自動新增到 `booths.json`

## 🛡️ 防重複機制

系統會檢查以下兩種重複情況：

1. **同攤主 + 同日期**
   - 錯誤訊息：`攤主「XXX」已在 YYYY-MM-DD 登記過了（地點：XXX）`

2. **同地點 + 同日期**
   - 錯誤訊息：`攤位「XXX」在 YYYY-MM-DD 已被登記（攤主：XXX）`

## 🔧 技術架構

- **前端框架**：Bootstrap 5
- **後端**：Netlify Functions (Node.js)
- **資料儲存**：GitHub Repository (JSON 檔案)
- **API**：GitHub REST API v3
- **部署平台**：Netlify

## 📊 資料格式

### Vendor（攤主）

```json
{
  "vendor_id": "北一",
  "vendor_name": "北一",
  "category": "糖果"
}
```

### Schedule Record（登記紀錄）

```json
{
  "vendor_id": "北一",
  "vendor_name": "北一",
  "vendor_category": "糖果",
  "booth_location": "A1",
  "booth_name": "中庭攤位A1",
  "date": "2025-11-02",
  "submitted_at": "2025-11-02T08:30:00.000Z"
}
```

## 🐛 常見問題

### Q1: 提交後顯示「網路錯誤」

**解決方法**：
1. 檢查 Netlify 環境變數是否正確設定
2. 確認 GitHub Token 是否有效且具有 `repo` 權限
3. 檢查 `GITHUB_REPO` 格式是否正確（`owner/repo`）

### Q2: 資料無法寫入 GitHub

**解決方法**：
1. 確認 GitHub Token 權限包含 `repo`
2. 檢查 branch 名稱是否正確
3. 查看 Netlify Functions 的執行日誌（Functions → Deploy log）

### Q3: 檢視頁面無法顯示資料

**解決方法**：
1. 確認 `data/schedule.json` 檔案存在
2. 檢查瀏覽器 Console 是否有錯誤訊息
3. 確認 JSON 格式正確（可用線上工具驗證）

### Q4: 如何清空所有登記紀錄？

直接編輯 `data/schedule.json`，將內容改為：
```json
[]
```
然後 commit 到 GitHub。

## 📜 授權

本專案採用 MIT 授權條款。

## 🤝 貢獻

歡迎提交 Issue 或 Pull Request！

## 📧 聯絡方式

如有任何問題，請透過 GitHub Issues 聯繫。

---

**製作日期**：2025年11月2日  
**版本**：1.0.0

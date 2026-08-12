# 兩台 Edge 使用相同 Extension ID

這個專案已在 `manifest.json` 設定固定的公開金鑰，因此目前版本的 Extension ID 是：

```text
hjhkdadbnmlgkdnjjlfbklackeaeaefg
```

公開金鑰可以放在 GitHub；私密金鑰不能放進 GitHub，也不能透過聊天或截圖分享。

## 第一次設定

本機私密金鑰保存在：

```text
C:\Users\muen1\AppData\Local\ntu-course-extension-key\ntu-course-extension.pem
```

這個檔案只在日後用 Chrome／Edge 的「封裝擴充功能」或製作更新套件時需要。`.gitignore` 已排除 `*.pem`、`*.der`、`*.crx` 與 ZIP 檔案。

## 兩台 Edge 的安裝步驟

1. 從 GitHub 取得最新版本：

   ```powershell
   git pull origin main
   ```

2. 開啟 `edge://extensions/`，開啟「開發人員模式」。
3. 如果舊版本已安裝，先移除舊版本，再按「載入解壓縮」選擇這個專案資料夾。
4. 在兩台 Edge 的擴充功能頁確認 ID 都是：

   ```text
   hjhkdadbnmlgkdnjjlfbklackeaeaefg
   ```

5. 兩台 Edge 登入同一個 Microsoft 帳號，開啟 `edge://settings/profiles/sync`，確認 **Extensions** 與同步功能已開啟。
6. 在臺大志願序頁面看到「已儲存並同步」後，另一台 Edge 重新整理頁面即可讀取相同順序。

## 重要限制

- GitHub 只負責同步程式碼，不負責同步志願序資料。
- 志願序資料由 Edge 的 `storage.sync` 與 Edge Sync 處理。
- 兩台同時修改時，最後同步的順序可能覆蓋較早的修改。
- 不要刪除或遺失私密金鑰；遺失後仍可使用目前已安裝的版本，但不能安全地製作同一 ID 的新封裝版本。

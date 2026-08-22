# 臺大選課志願序規劃器

這是一個 Chrome／Edge Manifest V3 擴充功能。它保留臺大課程網原有的「志願序」介面與操作方式，使用瀏覽器同步儲存記住排序。

目前版本除了規劃與記憶順序，也支援把「其他科目」匯入臺大選課系統。匯入一定先顯示差異預覽；只有使用者按下「確認並匯入」後，才會逐筆送出尚未登記課程。已登記課程一律忽略，不會調整志願序。國文、英外文與微積分目前仍需在選課系統中手動操作。

## 安裝

兩台 Edge 若要使用同一個 Extension ID，請先閱讀 [`docs/edge-key-setup.md`](docs/edge-key-setup.md)。目前版本已設定固定公開金鑰；私密金鑰只保存在 repo 外，不要提交到 GitHub。

### Edge

1. 開啟 `edge://extensions/`
2. 打開左側的「開發人員模式」
3. 選擇「載入解壓縮」
4. 選取這個專案資料夾

### Chrome

1. 開啟 `chrome://extensions/`
2. 打開右上角的「開發人員模式」
3. 選擇「載入未封裝項目」
4. 選取這個專案資料夾

安裝後可點擊工具列中的擴充功能圖示，再選「先用示範頁試試」。

## 使用方式

1. 進入 `https://course.ntu.edu.tw/priority/list/common` 或其他志願序分類頁面。
2. 照網站原本的方式拖曳課程，或直接修改志願序數字。
3. 看到「已儲存並同步」後，排序已寫入瀏覽器同步區域；同步暫時不可用時會先保存於本機。
4. 切換到「課表」時，同一時段內重疊的課程會依列表志願序排列；切換前尚未完成的排序也會先儲存，不會因換頁被洗掉。
5. 重新整理或稍後再回到頁面，擴充功能會依課程識別碼還原排序。

### 匯入選課系統（其他科目）

1. 先在課程網的「一般科目」列表完成排序，並確認畫面顯示「已儲存並同步」。
2. 登入 `https://if192.aca.ntu.edu.tw/rtcourse/coutake/rt1-runo2-new`。
3. 按「預覽匯入」，確認每門課的目前志願序、匯入後志願序與動作。
4. 按「確認並匯入」後，擴充功能才會逐筆送出；每一步都會從選課系統回傳頁面驗證結果。

如果希望保留插入課程的空間，可在預覽前勾選「只使用奇數志願序（1、3、5…）」。新增課程會依課程網順序使用尚未占用的奇數順位；既有登記仍保持原順位。

所有已登記課程都會忽略並保留原志願序，新的課程依課程網中的相對順序使用尚未占用的志願序。選課系統列為「不開放初選」等目前無法登記的課程，會在預覽中保留課名與原因並明確列為略過；真正未出現在匯入頁面的課程則以流水號列為略過，不會以其他課程替代。

若單門課送出後被選課系統以資格不符或其他課程條件拒絕，擴充功能會記錄該門課與校方回傳原因，略過後繼續處理下一門。只有登入逾時、網路錯誤或正式表單結構無法辨識等系統性錯誤才會停止整批。

當網站新增一門尚未記錄的課程時，既有課程順序會保持不變，新課程預設接在最後；之後仍可照原本方式手動調整。

擴充功能只會在志願序頁面初次載入時還原一次排序。頁面保持開啟期間，拖曳與數字修改只會更新儲存資料，不會由背景同步或畫面更新再次重排，避免操作中的順序跳動。

課程是否新增以臺大課程網目前載入的課程識別碼判斷，因此從其他裝置新增課程後，這台裝置第一次看到它也會套用相同規則。

Chrome 使用者需要在各台裝置登入同一個 Google 帳號並開啟 Chrome 同步；Edge 使用者需要登入同一個 Microsoft 帳號並開啟 Edge 同步。Chrome 與 Edge 的同步資料彼此不共用。

## 隱私與資料

- 只要求瀏覽器的 `storage` 權限。
- 只在 `course.ntu.edu.tw/priority/list/*`、`course.ntu.edu.tw/priority/table` 與選課系統的「匯入預選課程／其他科目」頁面注入介面。
- 擴充功能本身不連線到自有伺服器；同步資料由瀏覽器的同步服務處理。
- 同步的內容只有課程識別碼、排序與時間戳，不包含密碼、Cookie 或帳號資料。
- 不讀取密碼、Cookie 或帳號資料。
- 課程網上的藍色志願序數字只是本機規劃提示。選課系統只有在使用者查看差異並按下「確認並匯入」後，才會送出列出的尚未登記課程；不會修改既有登記。

## 開發驗證

```powershell
npm test
npm run check
```

介面視覺基準位於 [`docs/design-concept.png`](docs/design-concept.png)，功能只在原網站標題旁增加儲存狀態。

## 上架 Chrome Web Store

目前專案可以直接用「載入未封裝項目」測試；正式上架前，請先準備商店素材：

- 在 `manifest.json` 加入至少一個 PNG 圖示，建議提供 16、48、128 px 三種尺寸；128 px 會用於安裝與商店頁面。
- 準備至少一張 1280×800 或 640×400 的實際操作截圖（例如拖曳排序後顯示「已儲存並同步」的頁面）。
- 準備商店名稱、132 字元內的摘要、詳細描述、支援聯絡方式，以及隱私權／資料使用說明。

隱私權說明草稿在 [`docs/privacy-policy.md`](docs/privacy-policy.md)，上架時請補上實際聯絡方式，並把它放到可公開存取的支援／隱私權頁面（若 Dashboard 要求 URL）。

上架流程：

1. 以 Google 帳號開啟 [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)，註冊 Chrome Web Store 開發者帳號並支付一次性註冊費。
   - 若要在「載入未封裝項目」階段也跨裝置測試，先建立草稿項目，從 **Package → View public key** 取得公開金鑰，放進 `manifest.json` 的 `key` 欄位，再把同一份資料夾載入各裝置；官方說明見 [保持一致的 extension ID](https://developer.chrome.com/docs/extensions/reference/manifest/key)。正式上架後則以商店項目的 ID 為準。
2. 將這個資料夾壓成 ZIP；`manifest.json` 必須位於 ZIP 根目錄，不要多包一層專案資料夾。可用 PowerShell：

   ```powershell
   Compress-Archive -Path manifest.json,popup.html,popup.css,popup.js,src,demo.html,demo.css,demo-native.js,demo-runtime.js,docs -DestinationPath ntu-course-priority.zip -Force
   ```

3. Dashboard → **Add new item** → **Choose file** 上傳 ZIP。
4. 填寫 **Store Listing**、**Privacy**、**Distribution**、**Test instructions**；資料使用欄位要如實說明排序資料會寫入 `chrome.storage.sync`，由瀏覽器同步到同一帳號的裝置，本擴充功能沒有自有伺服器。
5. 按 **Submit for Review**，通過審查後再選擇立即發布或延後發布。日後更新時提高 `manifest.json` 的 `version`，重新打包並上傳新 ZIP。

Chrome Web Store 會要求非空白描述、圖示與截圖；因此目前這個開發版仍需補上你的品牌圖示與商店截圖後，才適合送審。

## 後續範圍

目前自動匯入涵蓋「其他科目」。國文、英外文與微積分的選課頁面採不同的整批表單，待有可驗證的預選資料頁面後，再以相同的「預覽差異 → 使用者確認 → 寫入正式志願序」原則支援。

# Chrome Web Store 上架資料

適用版本：1.0.0<br>
文件日期：2026 年 9 月 6 日

本文件中的文案可以直接貼入 Chrome Web Store Developer Dashboard。正式送審前，請先確認公開網址可在無登入、無 GitHub 權限的無痕視窗中開啟。

## 公開網址

- Homepage URL：`https://muen1019.github.io/ntu-course/`
- Support URL：`https://github.com/muen1019/ntu-course/issues`
- Privacy policy URL：`https://muen1019.github.io/ntu-course/privacy-policy.html`
- Contact email：`muen1019@gmail.com`

Privacy policy URL 需要先在 GitHub repository 的 Settings → Pages，將發布來源設為 `main` branch 的 `/docs`。若 repository 尚未公開或 GitHub Pages 尚未啟用，不可先把此網址填入 Dashboard。

## Store Listing

### 名稱

```text
臺大選課志願序規劃器
```

### Summary

```text
在臺大課程網安排並同步保存志願序，預覽差異與衝堂後，再將確認的操作送至官方選課系統。
```

### Detailed description

```text
臺大選課志願序規劃器協助你整理臺大課程網上的選課志願序，並在正式送出前看清楚每一項變更。

主要功能：
• 在臺大課程網以拖曳或數字調整志願序。
• 透過瀏覽器同步保存排序，換到同一帳號的其他裝置仍可使用。
• 在預選課表中依保存的順序顯示同時段課程。
• 在初選一階匯入前，預覽將新增的課程與志願序。
• 在初選二階檢查課程狀態、剩餘名額及上課時間衝堂。
• 只有在使用者檢視預覽並明確確認後，才會向臺大官方選課系統送出登記或退選操作。
• 每筆操作後重新讀取校方回應，顯示成功或失敗結果。

隱私與安全：
• 僅在指定的臺大課程與選課頁面運作。
• 沒有開發者後端、廣告、分析或使用者追蹤。
• 不讀取或保存密碼、Cookie 或帳號資料。
• 課程排序只存於瀏覽器 local/sync storage。
• 不下載或執行遠端程式碼。

重要提醒：
初選二階若選擇先退選衝堂課程，後續登記仍可能因名額、資格或校方系統狀態失敗；擴充功能無法保證重新選回已退選的課程。送出前請仔細確認預覽內容。

本擴充功能並非國立臺灣大學官方產品，與國立臺灣大學之間沒有代理、授權或背書關係。
```

### 分類與地區

- Primary category：`Productivity`
- Language：`中文（繁體）`
- Visibility：`Public`
- Regions：`All regions`；若只希望臺灣商店可見，可改選 Taiwan
- In-app purchases：`No`
- Mature content：`No`

## Privacy practices

### Single purpose description

```text
協助使用者在臺大課程網調整及保存課程志願序，並在使用者檢視差異、衝堂與風險且明確確認後，將指定操作直接送至臺大官方選課系統。
```

### storage permission justification

```text
用來將課程識別碼、使用者安排的志願序及更新時間保存在 chrome.storage.sync，並在同步暫時不可用時使用 chrome.storage.local。資料只用於還原排序及產生匯入預覽，不會傳送至開發者伺服器。
```

### Host access justification：course.ntu.edu.tw

```text
僅用於臺大課程網。擴充功能讀取課程清單與預選課表、顯示志願序調整介面、保存使用者安排的排序，並在課程網的單頁式路由進出志願序頁面時確保對應功能正確載入。
```

### Host access justification：if192.aca.ntu.edu.tw

```text
僅用於臺大初選一階官方匯入頁面。擴充功能讀取目前可登記及已登記課程，產生差異預覽；只有使用者明確確認後，才以目前登入狀態向同一官方網站送出表單，並讀取回應驗證結果。
```

### Host access justification：if177.aca.ntu.edu.tw

```text
僅用於臺大初選二階官方頁面。擴充功能讀取登記、已選、名額與課程時間資料，產生狀態及衝堂預覽；只有使用者明確確認後，才以目前登入狀態向同一官方網站送出所選登記或退選表單，並讀取回應驗證結果。
```

### Remote code

選擇：

```text
No, I am not using remote code.
```

說明備查：所有 JavaScript 均包含在上傳的 ZIP 內。`fetch()` 只用來讀取或提交臺大官方網站的 HTML 與表單資料，不會取得或執行外部 JavaScript、Wasm、指令或設定邏輯。

### Data usage disclosure

依目前程式行為，保守且一致的揭露方式是勾選：

- `Website content`：課程流水號、名稱、時間、名額、志願序及選課狀態。
- `User activity`：使用者安排的排序、輸入的志願序，以及明確選擇的登記或退選操作。

不要勾選：

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history

本擴充功能雖會在已登入的臺大頁面發送同源請求，但沒有 `cookies` 權限、不會直接讀取 Cookie，也不會取得或保存密碼，因此不宣告收集 Authentication information。若未來新增帳號、Cookie、分析或其他遙測功能，必須先同步修改程式內揭露、隱私權政策及 Dashboard 選項。

Limited Use certification 的所有聲明必須依實際情況逐項閱讀後勾選。現有程式沒有出售資料、廣告用途、信用評估或開發者伺服器，與文件中的聲明一致。

## Test instructions

```text
本擴充功能的正式匯入流程只在國立臺灣大學官方選課頁面上運作，正式頁面需要有效的臺大帳號。請勿要求或使用開發者的個人校務帳密。

不需帳號的主要功能測試：
1. 安裝後點擊 Chrome 工具列上的擴充功能圖示。
2. 點擊「先用示範頁試試」。
3. 在示範頁拖曳任一課程列，或修改左側志願序數字。
4. 確認列表會依新順序排列，並顯示已保存狀態。
5. 重新整理示範頁，確認排序仍然保留。
6. 回到擴充功能 popup，按「清除所有排序資料」；重新整理示範頁後可再次從預設狀態測試。

需要臺大帳號的正式流程：
1. 「開啟志願序頁面」會前往 course.ntu.edu.tw，並在志願序清單加入拖曳、數字排序及同步保存功能。
2. 「開啟初選一階匯入頁面」會比較保存的課程順序與 if192.aca.ntu.edu.tw 的目前登記狀態。使用者必須先查看預覽並再次確認，程式才會提交表單。
3. 「開啟初選二階匯入頁面」會在 if177.aca.ntu.edu.tw 顯示名額、狀態與衝堂預覽。任何登記或退選同樣需要使用者明確確認。
4. 所有網路請求都送往目前操作的臺大 HTTPS 網站；沒有開發者後端或遠端程式碼。
```

## Graphic assets checklist

- [x] ZIP 內的 128×128 PNG extension icon：`icons/icon-128.png`
- [x] 16×16、32×32、48×48 工具列與管理頁 icon
- [x] 三張 1280×800 實際功能截圖：`store-assets/screenshots/`
- [x] 440×280 small promotional tile：`store-assets/promo/small-promo-440x280.png`
- [ ] 1400×560 marquee promotional tile（選填）
- [ ] YouTube promotional video（選填）

建議截圖不要出現姓名、學號、Cookie、完整個人課表或其他真實學生資料；可優先使用內建示範頁製作商店截圖。

## 送審前 checklist

- [ ] GitHub repository 與隱私權政策頁面均可由無痕視窗公開開啟
- [ ] `npm test` 通過
- [ ] `npm run check` 通過
- [ ] `npm run package:chrome` 成功產生 ZIP
- [ ] 解壓 ZIP 後 `manifest.json` 位於根目錄
- [ ] ZIP 內的 manifest 不含 source manifest 的 Edge/local development `key`
- [ ] ZIP 不含測試、README、私密金鑰、`.git` 或未使用的原始碼
- [ ] 在全新 Chrome profile 以「載入未封裝項目」測試正式檔案
- [ ] Dashboard 的資料揭露、商店說明與隱私權政策完全一致
- [ ] 選擇是否核准後自動發布；若不自動發布，需在核准後期限內手動發布

## 官方參考資料

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)

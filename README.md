# Polymarket 多制式賠率

在 Polymarket 交易價格旁顯示換算後的賠率，不會點擊按鈕、登入或送出訂單。

## 功能

- 支援 Polymarket 全站的 `¢`、百分比及動態價格。
- 十進位賠率：`58.2¢ → 1.72x`（預設）。
- 香港盤：`58.2¢ → HK 0.72`。
- 美式賠率：`58.2¢ → US -139`。
- 從 Tampermonkey 選單切換格式並保存選擇。
- 透過 GitHub 自動取得新版腳本。

## 安裝

1. 安裝 Tampermonkey。
2. 開啟 [polymarket-decimal-odds.user.js](https://raw.githubusercontent.com/anlo1220/polymarket-decimal-odds-userscript/main/polymarket-decimal-odds.user.js)。
3. 選擇「安裝」；若已安裝舊版，請覆蓋更新。

## 使用

開啟任一 Polymarket 頁面即可顯示賠率。若要切換格式，開啟 Tampermonkey 選單並選擇：

- 十進位（`1.72x`）
- 香港盤（`HK 0.72`）
- 美式（`US ±139`）

設定保存在 Tampermonkey；切換後目前頁面會立即更新，不會重新載入。選單以 `✓` 標示目前格式（需要 Tampermonkey 5.0 以上）。

## 1.4.1 修復

- 支援「Buy Yes／No」、「買入 是／否」、「买入 是／否」與價格共用文字節點。
- 一般及動態數字共用價格驗證；`%` 僅用於市場連結，避免把其他百分比當成賠率。
- 頁面更新只掃描受影響控制元件與新加入的子樹，不因無關元素變動重掃整頁。
- 延遲建立的 Shadow DOM 會接上價格監聽；只有待就緒數字元件每 250ms 檢查一次，就緒或移除後停止追蹤，不輪詢整頁。
- 清除失效價格，避免動態元件、巢狀按鈕與重複掃描產生多份標記。
- 滑鼠移入才顯示價格的卡片，倍率獨立置於按鈕內下方，不再被透明價格容器隱藏；不增加按鈕寬高。極長數字在窄按鈕內使用省略號。

## 開發檢查

在此 repository 目錄執行：

```sh
node --check polymarket-decimal-odds.user.js
node polymarket-decimal-odds.user.js
npx --yes --package @playwright/cli playwright-cli -s=odds-check open about:blank
npx --yes --package @playwright/cli playwright-cli -s=odds-check run-code --filename dom-check.js
npx --yes --package @playwright/cli playwright-cli -s=odds-check close
```

Windows PowerShell 可使用 `npx.cmd`。DOM 檢查使用 Playwright CLI 的隔離瀏覽器與模擬 GM API，不需建立測試框架；不會登入或交易。它驗證價格更新、選單與保存呼叫，但不等於實際 Tampermonkey 的持久儲存／自動更新驗收。

## 更新與安全

Tampermonkey 會依自身排程從 GitHub Raw 檢查 `@version`。腳本沒有下單、登入或額外網路請求功能，只修改頁面顯示。

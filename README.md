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

設定保存在 Tampermonkey；切換後目前頁面會立即更新，不會重新載入。

## 更新與安全

Tampermonkey 會依自身排程從 GitHub Raw 檢查 `@version`。腳本沒有下單、登入或額外網路請求功能，只修改頁面顯示。

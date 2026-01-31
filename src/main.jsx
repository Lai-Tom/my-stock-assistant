import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // 可以留空或建立一個空的 index.css
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
    * 建立 `index.html` (在根目錄)，內容：
```html
<!doctype html>
<html lang="zh-TW">
  <head><meta charset="UTF-8" /><title>個股快訊</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
5.  **建立自動化設定：**

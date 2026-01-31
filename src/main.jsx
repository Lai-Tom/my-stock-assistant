import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// 這段程式碼負責把 App 元件畫到網頁上的 "root" 區塊
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

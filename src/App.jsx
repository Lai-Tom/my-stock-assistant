import React, { useState, useEffect } from 'react';
import { Plus, X, Copy, TrendingUp, Globe, Terminal, RefreshCw } from 'lucide-react';

const App = () => {
  const [targetDate, setTargetDate] = useState('');
  const [targetStock, setTargetStock] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);

  // 初始化：設定日期並讀取真實數據
  useEffect(() => {
    const today = new Date();
    setTargetDate(today.toISOString().split('T')[0]);

    // 嘗試讀取 Python 產生的 stocks.json
    // 注意：這個檔案是由 GitHub Action 執行 fetch_data.py 後自動產生的
    fetch('./stocks.json')
      .then(res => {
        if (!res.ok) throw new Error("找不到資料檔 (可能是剛建立尚未執行自動化更新)");
        return res.json();
      })
      .then(data => {
        setTargetStock(data);
        setLoading(false);
        showNotification('已載入最新真實股價資料');
      })
      .catch(err => {
        console.log('讀取失敗:', err);
        setLoading(false);
      });
  }, []);

  // 新增股票 (僅前端暫存)
  const handleAddStock = () => {
    if (!inputValue) return;
    const code = inputValue.toUpperCase().trim();
    
    if (targetStock.some(s => s.code === code)) {
      showNotification('該股票代碼已在列表中');
      return;
    }

    const newStock = {
      id: Date.now(),
      code: code,
      name: code,
      industry: '新增觀察(無歷史數據)',
      history: [] 
    };
    
    setTargetStock(prev => [...prev, newStock]);
    setInputValue('');
    showNotification('提醒：在此新增僅為暫存，請修改 GitHub 的 fetch_data.py 以獲取真實數據');
  };

  const handleRemoveStock = (code) => {
    setTargetStock(prev => prev.filter(s => s.code !== code));
  };

  const generateAndCopyPrompt = () => {
    if (targetStock.length === 0) return;

    const stockListString = targetStock.map(s => s.code).join('、');
    
    // 格式化數據
    let allStocksData = "";
    targetStock.forEach(stock => {
      if (stock.history && stock.history.length > 0) {
        allStocksData += `\n[${stock.code} - 歷史數據 (最新30日)]\n`;
        allStocksData += `日期 | 收盤 | 量 | K | D | MACD\n`;
        allStocksData += `---|---|---|---|---|---\n`;
        stock.history.forEach(day => {
          allStocksData += `${day.date} | ${day.close} | ${day.volume} | ${day.k} | ${day.d} | ${day.macd}\n`;
        });
      }
    });

    const promptText = `請提供 ${stockListString} 的完整每日快訊，以 ${targetDate} 最新的資訊為主。內容需包含：
1. 根據提供的 Raw Data (最近30個交易日收盤價、交易量及 KD/MACD 技術指標) 進行走勢分析；
2. 按 ${stockListString} 業務項目分類說明的最新消息與里程碑；
3. 指數影響分析與分析師評級/預估；
4. ${stockListString} 所屬產業重大消息。

以下是真實市場數據 (Raw Data) 供分析參考：
${allStocksData}`;

    navigator.clipboard.writeText(promptText).then(() => {
      showNotification('完整提示詞 (含真實數據) 已複製！');
    });
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  const groupedStocks = targetStock.reduce((acc, stock) => {
    if (!acc[stock.industry]) acc[stock.industry] = [];
    acc[stock.industry].push(stock);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">個股情報站 (Real Data)</h1>
              <p className="text-xs text-slate-500">Auto-updated by GitHub Actions</p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 px-4 py-2 bg-slate-100 rounded-full text-xs font-mono text-slate-600 flex items-center gap-2">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "載入數據中..." : `Target: ${targetDate}`}
          </div>
        </header>

        {/* List */}
        <section className="space-y-4">
          <div className="flex justify-between items-end">
             <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
              <Terminal size={18} />
              監控清單
            </h2>
            <div className="text-xs text-slate-400">
              提示：若要永久新增股票，請修改 GitHub 中的 fetch_data.py
            </div>
          </div>
         
          {targetStock.length === 0 && !loading ? (
             <div className="p-8 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
               暫無資料，請等待 GitHub Action 執行完畢 (約需 1-2 分鐘)
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(groupedStocks).map(([industry, stocks]) => (
                <div key={industry} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                     <Globe size={16} className="text-blue-500"/>
                    <h3 className="font-bold text-slate-700 text-sm">{industry}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {stocks.map((stock) => (
                      <div key={stock.code} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{stock.code}</span>
                          <span className="text-[10px] text-slate-500">
                             {stock.history && stock.history.length > 0 
                               ? `收盤: ${stock.history[0].close} | Vol: ${(stock.history[0].volume/1000).toFixed(0)}k` 
                               : '無數據'}
                          </span>
                        </div>
                         {stock.history && stock.history.length > 0 && (
                           <div className="flex flex-col items-end text-[10px] font-mono text-slate-600">
                             <span>K:{stock.history[0].k}</span>
                             <span>D:{stock.history[0].d}</span>
                           </div>
                         )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Prompt Section */}
        <section className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-2xl shadow-lg text-white">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold flex items-center gap-2">
              <Terminal className="text-yellow-400" size={20} />
              Gemini Prompt 生成
            </h2>
            <button
              onClick={generateAndCopyPrompt}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors"
            >
              <Copy size={16} />
              複製指令
            </button>
          </div>
          <div className="h-24 overflow-hidden text-xs font-mono text-slate-400 whitespace-pre-wrap border border-white/10 p-2 rounded">
             {targetStock.length > 0 
               ? `預覽: 請提供 ${targetStock.map(s=>s.code).join('、')} 的完整每日快訊...`
               : '等待數據中...'}
          </div>
        </section>

        {/* Notification */}
        {notification && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-50 text-sm animate-bounce">
            {notification}
          </div>
        )}

      </div>
    </div>
  );
};

export default App;

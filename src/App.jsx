import React, { useState, useEffect } from 'react';
import { Plus, X, Copy, TrendingUp, Cpu, Globe, Rocket, Terminal, RefreshCw, FileText } from 'lucide-react';

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
    fetch('./stocks.json')
      .then(res => {
        if (!res.ok) throw new Error("找不到資料檔");
        return res.json();
      })
      .then(data => {
        // 將 Python 抓到的資料加入 state
        setTargetStock(data);
        setLoading(false);
        showNotification('已載入最新真實股價資料');
      })
      .catch(err => {
        console.log('讀取失敗 (可能是剛建立或尚未執行 Action):', err);
        setLoading(false);
      });
  }, []);

  // 新增股票 (前端暫存)
  const handleAddStock = () => {
    if (!inputValue) return;
    const code = inputValue.toUpperCase().trim();
    
    if (targetStock.some(s => s.code === code)) {
      showNotification('該股票代碼已在列表中');
      return;
    }

    // 簡單判斷產業分類 (前端暫時分類，真實分類由後端 Python 處理較佳)
    let industry = '其他產業';
    if (['TSM', 'NVDA', 'AMD', 'INTC', '2330', '2454', '2303'].includes(code)) industry = '半導體業';
    else if (['FLY', 'LMT', 'RTX'].includes(code)) industry = '航太與國防';
    else if (/^\d{4}$/.test(code)) industry = '台灣上市櫃股票';
    else industry = '美股/國際股票';

    const newStock = {
      id: Date.now(),
      code: code,
      name: code,
      industry: industry,
      history: [] // 新增的暫時沒有數據
    };
    
    setTargetStock(prev => [...prev, newStock]);
    setInputValue('');
    showNotification('提醒：手動新增為暫存，請修改 GitHub fetch_data.py 以永久追蹤');
  };

  const handleRemoveStock = (code) => {
    setTargetStock(prev => prev.filter(s => s.code !== code));
  };

  const generateAndCopyPrompt = () => {
    if (targetStock.length === 0) {
      showNotification('請先加入至少一支股票');
      return;
    }

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
    }).catch(err => {
        showNotification('複製失敗，請手動複製');
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
            <div className="bg-blue-600 p-2 rounded-lg">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">個股情報整合助手</h1>
              <p className="text-sm text-slate-500">Auto-updated by GitHub Actions</p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 px-4 py-2 bg-slate-100 rounded-full text-xs font-mono text-slate-600 flex items-center gap-2">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            {loading ? "更新數據中..." : `Target Date: ${targetDate}`}
          </div>
        </header>

        {/* 1. 找回消失的輸入區 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            臨時新增股票代碼 (台股/美股)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={20}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
              placeholder="例如: TSM, 2330, FLY, NVDA"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-lg uppercase placeholder:normal-case"
            />
            <button
              onClick={handleAddStock}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={20} />
              <span className="hidden md:inline">加入清單</span>
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            * 此處新增為臨時顯示。若要永久追蹤並獲取數據，請修改 GitHub 中的 <code>fetch_data.py</code>
          </p>
        </section>

        {/* 2. 找回消失的標籤與刪除按鈕 */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
            <Terminal size={18} />
            Target Stock 監控清單
          </h2>
          
          {targetStock.length === 0 && !loading ? (
             <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
               暫無資料，請等待 GitHub Action 執行完畢，或在上方手動新增
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(groupedStocks).map(([industry, stocks]) => (
                <div key={industry} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                     {industry.includes('半導體') ? <Cpu size={18} className="text-purple-500"/> : 
                      industry.includes('航太') ? <Rocket size={18} className="text-orange-500"/> :
                      <Globe size={18} className="text-blue-500"/>}
                    <h3 className="font-bold text-slate-700">{industry}</h3>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {stocks.map((stock) => (
                      <div key={stock.code} className="group flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-all">
                        {/* 左側：股票資訊 */}
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-lg">{stock.code}</span>
                          <span className="text-xs text-slate-500">
                             {stock.history && stock.history.length > 0 
                               ? `收盤: ${stock.history[0].close} | 量: ${(stock.history[0].volume/1000).toFixed(0)}k` 
                               : '等待數據抓取...'}
                          </span>
                        </div>
                        
                        {/* 右側：KD/MACD 與 刪除按鈕 */}
                        <div className="flex items-center gap-3">
                            {stock.history && stock.history.length > 0 && (
                                <div className="text-right">
                                    <div className="text-[10px] font-mono text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                                        KD: {stock.history[0].k}/{stock.history[0].d}
                                    </div>
                                    <div className="text-[10px] font-mono text-blue-600 mt-1">
                                        MACD: {stock.history[0].macd}
                                    </div>
                                </div>
                            )}
                            <button
                            onClick={() => handleRemoveStock(stock.code)}
                            className="p-2 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                            >
                            <X size={16} />
                            </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Prompt 生成區 */}
        <section className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Terminal className="text-blue-200" size={24} />
                Gemini Prompt 生成器
              </h2>
              <p className="text-blue-100 text-sm mt-1">
                已準備好 {targetStock.length} 支標的的詳細技術指標數據
              </p>
            </div>
            <button
              onClick={generateAndCopyPrompt}
              className="bg-white text-blue-600 hover:bg-blue-50 px-6 py-3 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <Copy size={20} />
              複製完整指令
            </button>
          </div>
          <div className="h-32 overflow-y-auto bg-black/20 rounded-xl p-4 font-mono text-xs text-blue-100 whitespace-pre-wrap border border-white/10 custom-scrollbar">
             {targetStock.length > 0 
               ? `預覽: 請提供 ${targetStock.map(s=>s.code).join('、')} 的完整每日快訊...`
               : '等待數據中...'}
          </div>
        </section>

      </div>

      {notification && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce">
          {notification}
        </div>
      )}
    </div>
  );
};

export default App;

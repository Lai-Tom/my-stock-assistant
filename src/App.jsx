import React, { useState, useEffect } from 'react';
import { Plus, X, Copy, TrendingUp, Cpu, Globe, Rocket, Terminal, RefreshCw, AlertCircle, Save, Settings, Check } from 'lucide-react';

const App = () => {
  const [targetDate, setTargetDate] = useState('');
  const [targetStock, setTargetStock] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // GitHub 設定狀態 (Token, 帳號, 倉庫名)
  const [ghConfig, setGhConfig] = useState({
    token: '',
    owner: '',
    repo: ''
  });

  // 初始化
  useEffect(() => {
    const today = new Date();
    setTargetDate(today.toISOString().split('T')[0]);

    // 1. 先讀取瀏覽器記憶體中的 GitHub 設定
    const savedConfig = JSON.parse(localStorage.getItem('gh_config')) || {};
    setGhConfig(prev => ({ ...prev, ...savedConfig }));

    initData();
  }, []);

  const initData = async () => {
    setLoading(true);
    let serverData = [];
    let combinedData = [];

    // 2. 讀取 GitHub 上的真實數據 (stocks.json)
    try {
        const res = await fetch('./stocks.json');
        if (res.ok) {
            serverData = await res.json();
            combinedData = [...serverData];
        }
    } catch (err) {
        console.log('讀取 stocks.json 失敗:', err);
    }

    // 3. 讀取瀏覽器暫存 (Local Storage) 作為備用顯示
    const localCodes = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    const serverCodeSet = new Set(serverData.map(s => s.code));

    localCodes.forEach(code => {
        if (!serverCodeSet.has(code)) {
            const mockStock = generateMockData(code);
            combinedData.push(mockStock);
        }
    });

    setTargetStock(combinedData);
    setLoading(false);
  };

  // 輔助函數：產業與模擬數據
  const determineIndustry = (code) => {
    if (['TSM', 'NVDA', 'AMD', 'INTC', '2330', '2454', '2303'].includes(code)) return '半導體業';
    if (['FLY', 'LMT', 'RTX'].includes(code)) return '航太與國防';
    if (/^\d{4}$/.test(code)) return '台灣上市櫃股票';
    return '美股/國際股票';
  };

  const generateMockData = (code) => {
    const dates = [];
    const history = [];
    const industry = determineIndustry(code);
    let priceBase = 100;
    if(['2330','TSM'].includes(code)) priceBase=1000;
    else if(['NVDA'].includes(code)) priceBase=130;
    else if(['AAPL'].includes(code)) priceBase=220;
    else if(industry.includes('台')) priceBase=50;

    const today = new Date();
    for(let i=0; i<30; i++){
        const d = new Date(today);
        d.setDate(today.getDate()-i);
        if(d.getDay()!==0 && d.getDay()!==6) dates.push(d.toISOString().split('T')[0]);
    }
    let currentPrice = priceBase;
    dates.forEach(date => {
        currentPrice += currentPrice * ((Math.random()-0.5)*0.04);
        history.push({
            date, close: currentPrice.toFixed(2), volume: Math.floor(Math.random()*50000+5000),
            k:(Math.random()*80+10).toFixed(1), d:(Math.random()*80+10).toFixed(1), macd:(Math.random()*4-2).toFixed(2)
        });
    });
    return { id: `local-${code}-${Date.now()}`, code, name: code, industry, history, isMock: true };
  };

  // --- 核心：寫入 GitHub API ---
  const saveToGitHub = async (newStockCode, isDelete = false) => {
    const { token, owner, repo } = ghConfig;
    
    // 如果使用者還沒設定 Token，就只做本地儲存，不報錯
    if (!token || !owner || !repo) {
        if (!isDelete) showNotification('已暫存於瀏覽器 (未設定 GitHub 連線，無法永久儲存)');
        return;
    }

    try {
        showNotification('正在連線 GitHub 更新檔案...', 10000);
        
        // 1. 取得目前檔案的 SHA (GitHub 修改檔案需要提供 SHA)
        const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/stock_list.json`;
        const getRes = await fetch(fileUrl, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (!getRes.ok) throw new Error('無法讀取 GitHub 檔案 (請檢查設定)');
        const fileData = await getRes.json();
        
        // 解碼 Base64 內容
        const currentContent = JSON.parse(decodeURIComponent(escape(atob(fileData.content))));
        
        // 2. 修改內容
        let newContent = [];
        if (isDelete) {
            newContent = currentContent.filter(c => c !== newStockCode);
        } else {
            if (currentContent.includes(newStockCode)) return; // 已存在
            newContent = [...currentContent, newStockCode];
        }

        // 3. 寫回 GitHub
        const putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: isDelete ? `Remove ${newStockCode} via Web` : `Add ${newStockCode} via Web`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))),
                sha: fileData.sha
            })
        });

        if (putRes.ok) {
            showNotification(`成功！GitHub Action 將在幾分鐘後自動更新真實數據。`);
        } else {
            throw new Error('寫入失敗');
        }

    } catch (error) {
        console.error(error);
        showNotification(`GitHub 同步失敗: ${error.message}`);
    }
  };

  // 新增股票
  const handleAddStock = () => {
    if (!inputValue) return;
    const code = inputValue.toUpperCase().trim();
    if (targetStock.some(s => s.code === code)) return;

    // 1. 本地 UI 立即更新 (Mock)
    const newStock = generateMockData(code);
    setTargetStock(prev => [newStock, ...prev]);
    
    // 2. 存入 LocalStorage (備份)
    const currentSaved = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    if (!currentSaved.includes(code)) {
        localStorage.setItem('my_saved_stocks', JSON.stringify([...currentSaved, code]));
    }
    
    setInputValue('');
    
    // 3. 嘗試寫入 GitHub
    saveToGitHub(code, false);
  };

  // 刪除股票
  const handleRemoveStock = (code) => {
    setTargetStock(prev => prev.filter(s => s.code !== code));
    
    const currentSaved = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    localStorage.setItem('my_saved_stocks', JSON.stringify(currentSaved.filter(c => c !== code)));

    // 同步刪除 GitHub
    saveToGitHub(code, true);
  };

  const handleSaveConfig = () => {
    localStorage.setItem('gh_config', JSON.stringify(ghConfig));
    setIsSettingsOpen(false);
    showNotification('設定已儲存！下次新增股票將自動同步至 GitHub。');
  };

  const showNotification = (msg, duration = 4000) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), duration);
  };

  const groupedStocks = targetStock.reduce((acc, stock) => {
    if (!acc[stock.industry]) acc[stock.industry] = [];
    acc[stock.industry].push(stock);
    return acc;
  }, {});

  const generateAndCopyPrompt = () => {
      if (targetStock.length === 0) return;
      const stockListString = targetStock.map(s => s.code).join('、');
      let allStocksData = "";
      targetStock.forEach(stock => {
        if (stock.history && stock.history.length > 0) {
          allStocksData += `\n[${stock.code} - 歷史數據]\n`;
          allStocksData += `日期 | 收盤 | 量 | K | D | MACD\n---|---|---|---|---|---\n`;
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

Raw Data:
${allStocksData}`;
      navigator.clipboard.writeText(promptText).then(() => showNotification('指令已複製'));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header (含設定按鈕) */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">個股情報整合助手</h1>
              <p className="text-sm text-slate-500">API Status: {ghConfig.token ? 'Connected' : 'Local Only'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 mt-4 md:mt-0">
             <div className="px-4 py-2 bg-slate-100 rounded-full text-xs font-mono text-slate-600 flex items-center gap-2">
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                {loading ? "更新中..." : targetDate}
            </div>
            {/* 設定按鈕 */}
            <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                className={`p-2 rounded-full transition-colors ${ghConfig.token ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
                title="GitHub API 設定"
            >
                <Settings size={20} />
            </button>
          </div>

          {/* 設定視窗 (彈出式) */}
          {isSettingsOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                  <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
                      <Settings size={16} /> GitHub 連線設定
                  </h3>
                  <div className="space-y-3">
                      <div>
                          <label className="text-xs text-slate-500 block mb-1">Owner (您的 GitHub 帳號)</label>
                          <input 
                            type="text" 
                            value={ghConfig.owner} 
                            onChange={e=>setGhConfig({...ghConfig, owner:e.target.value})} 
                            className="w-full border rounded p-2 text-sm" 
                            placeholder="例如: Lai-Tom" 
                          />
                      </div>
                      <div>
                          <label className="text-xs text-slate-500 block mb-1">Repo (倉庫名稱)</label>
                          <input 
                            type="text" 
                            value={ghConfig.repo} 
                            onChange={e=>setGhConfig({...ghConfig, repo:e.target.value})} 
                            className="w-full border rounded p-2 text-sm" 
                            placeholder="例如: my-stock-assistant" 
                          />
                      </div>
                      <div>
                          <label className="text-xs text-slate-500 block mb-1">Token (Personal Access Token)</label>
                          <input 
                            type="password" 
                            value={ghConfig.token} 
                            onChange={e=>setGhConfig({...ghConfig, token:e.target.value})} 
                            className="w-full border rounded p-2 text-sm" 
                            placeholder="ghp_xxxx..." 
                          />
                      </div>
                      <button onClick={handleSaveConfig} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded p-2 text-sm font-bold mt-2">
                          儲存連線資訊
                      </button>
                      <div className="text-[10px] text-slate-400 mt-2 bg-slate-50 p-2 rounded">
                          <p>• 這些資訊只會存在您的瀏覽器中。</p>
                          <p>• Token 必須要有 <code>repo</code> 權限。</p>
                      </div>
                  </div>
              </div>
          )}
        </header>

        {/* 輸入區 */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2">追蹤新股票 (同步寫入 GitHub)</label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={20}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
              placeholder="例如: TSM, 2330"
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-lg uppercase"
            />
            <button onClick={handleAddStock} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2">
              <Plus size={20} /> <span className="hidden md:inline">加入</span>
            </button>
          </div>
        </section>

        {/* 列表區 */}
        <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(groupedStocks).map(([industry, stocks]) => (
                <div key={industry} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                     <Globe size={18} className="text-blue-500"/>
                    <h3 className="font-bold text-slate-700">{industry}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {stocks.map((stock) => (
                      <div key={stock.code} className={`flex items-center justify-between p-3 border rounded-lg transition-all ${stock.isMock ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 text-lg">{stock.code}</span>
                            {stock.isMock ? 
                                <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="暫存數據，等待 GitHub 同步"><RefreshCw size={8} className="animate-spin"/> Syncing</span> : 
                                <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded" title="真實數據 (已確認)"><Check size={8}/> Real</span>
                            }
                          </div>
                          <span className="text-xs text-slate-500">
                             {stock.history?.length > 0 ? `收盤: ${stock.history[0].close}` : '等待數據...'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => handleRemoveStock(stock.code)} className="p-2 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded-lg">
                                <X size={16} />
                            </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
        </section>

        {/* Prompt Section */}
        <section className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Terminal className="text-blue-200" size={24} /> Gemini Prompt</h2>
                <button onClick={generateAndCopyPrompt} className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2"><Copy size={20} /> 複製指令</button>
            </div>
            <div className="h-32 overflow-y-auto bg-black/20 rounded-xl p-4 font-mono text-xs text-blue-100 border border-white/10 custom-scrollbar">
                {targetStock.length > 0 ? `預覽: 請提供 ${targetStock.map(s=>s.code).join('、')} 的完整每日快訊...` : '等待數據中...'}
            </div>
        </section>

        {notification && <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce text-sm">{notification}</div>}
      </div>
    </div>
  );
};

export default App;

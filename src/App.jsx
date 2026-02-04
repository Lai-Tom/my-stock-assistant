import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Copy, TrendingUp, Globe, Rocket, Terminal, RefreshCw, Settings, Check, AlertTriangle, Play, FileText, Clock } from 'lucide-react';

const App = () => {
  const [targetDate, setTargetDate] = useState('');
  const [targetStock, setTargetStock] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [notification, setNotification] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const [ghConfig, setGhConfig] = useState({
    token: '',
    owner: '',
    repo: ''
  });

  function useInterval(callback, delay) {
    const savedCallback = useRef();
    useEffect(() => {
      savedCallback.current = callback;
    }, [callback]);
    useEffect(() => {
      if (delay !== null) {
        const id = setInterval(() => savedCallback.current(), delay);
        return () => clearInterval(id);
      }
    }, [delay]);
  }

  useInterval(() => {
    const hasPendingStocks = targetStock.some(s => s.isMock && !s.error);
    if (hasPendingStocks || isUpdating) {
        console.log('正在背景檢查新數據...');
        initData(true);
    }
  }, 30000);

  useEffect(() => {
    const today = new Date();
    setTargetDate(today.toISOString().split('T')[0]);
    const savedConfig = JSON.parse(localStorage.getItem('gh_config')) || {};
    setGhConfig(prev => ({ ...prev, ...savedConfig }));
    initData(false);
  }, []);

  const initData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    
    let serverData = [];
    let combinedData = [];

    try {
        const res = await fetch(`./stocks.json?t=${Date.now()}`);
        if (res.ok) {
            serverData = await res.json();
            combinedData = [...serverData];
            
            // 使用 24小時制顯示時間，比較短，適合手機
            const now = new Date();
            setLastUpdatedTime(now.toLocaleTimeString('zh-TW', { hour12: false }));
        }
    } catch (err) {
        console.log('讀取 stocks.json 失敗:', err);
    }

    const localCodes = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    const serverCodeSet = new Set(serverData.map(s => s.code));

    if (isBackground) {
        const justUpdated = localCodes.filter(code => {
             const currentIsMock = targetStock.find(s => s.code === code)?.isMock;
             return currentIsMock && serverCodeSet.has(code);
        });
        if (justUpdated.length > 0) {
            showNotification(`數據更新成功！${justUpdated.join(', ')} 已取得真實報價。`);
            setIsUpdating(false);
        }
    }

    localCodes.forEach(code => {
        if (!serverCodeSet.has(code)) {
            const mockStock = generateMockData(code);
            combinedData.push(mockStock);
        }
    });

    setTargetStock(combinedData);
    setLoading(false);
  };

  const determineIndustry = (code) => {
    if (['TSM', 'NVDA', 'AMD', 'INTC', '2330', '2454', '2303', '3491'].includes(code)) return '半導體業';
    if (['FLY', 'LMT', 'RTX', 'USAR', 'LUNR', 'RKLB', 'SMR', 'OKLO'].includes(code)) return '航太與國防';
    if (/^\d{4}$/.test(code)) return '台灣上市櫃股票';
    return '美股/國際股票';
  };

  const generateMockData = (code) => {
    const dates = [];
    const history = [];
    const industry = determineIndustry(code);
    let priceBase = 100;
    let currency = 'USD';

    if (['2330', '2454', '2303', '3491'].includes(code) || /^\d{4}$/.test(code)) {
        currency = 'TWD';
        if(code === '2330') priceBase = 1000;
        else priceBase = 100;
    } else {
        if(['NVDA'].includes(code)) priceBase = 130;
        else if(['TSM'].includes(code)) priceBase = 180;
    }
    
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
    
    const mockChange = (Math.random() * 10 - 5).toFixed(2);
    const mockPctChange = (mockChange / priceBase * 100).toFixed(2);

    return { 
        id: `local-${code}-${Date.now()}`, 
        code, 
        name: code, 
        industry, 
        currency, 
        history, 
        isMock: true,
        change: parseFloat(mockChange),      
        pctChange: parseFloat(mockPctChange) 
    };
  };

  const triggerGitHubAction = async () => {
    const { token, owner, repo } = ghConfig;
    if (!token || !owner || !repo) {
        showNotification('請先設定 GitHub 連線資訊才能使用手動更新');
        return;
    }

    setIsUpdating(true);
    showNotification('正在呼叫 GitHub Action 執行爬蟲...', 5000);

    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/daily_update.yml/dispatches`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        if (res.ok) {
            showNotification('成功觸發！機器人正在抓取最新數據，請稍候約 2-3 分鐘...');
        } else {
            throw new Error(`GitHub API 回傳錯誤 (${res.status})`);
        }
    } catch (error) {
        console.error(error);
        showNotification(`觸發失敗: ${error.message}`);
        setIsUpdating(false);
    }
  };

  const saveToGitHub = async (newStockCode, isDelete = false) => {
    const { token, owner, repo } = ghConfig;
    if (!token || !owner || !repo) {
        if (!isDelete) showNotification('已暫存 (未設定 GitHub 連線)');
        return;
    }

    try {
        const fileUrl = `https://api.github.com/repos/${owner}/${repo}/contents/stock_list.json`;
        const getRes = await fetch(fileUrl, { headers: { 'Authorization': `token ${token}` } });
        
        if (!getRes.ok) throw new Error('讀取檔案失敗');
        const fileData = await getRes.json();
        const currentContent = JSON.parse(decodeURIComponent(escape(atob(fileData.content))));
        
        let newContent = [];
        if (isDelete) {
            newContent = currentContent.filter(c => c !== newStockCode);
        } else {
            if (currentContent.includes(newStockCode)) return;
            newContent = [...currentContent, newStockCode];
        }

        const putRes = await fetch(fileUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: isDelete ? `Remove ${newStockCode}` : `Add ${newStockCode}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(newContent, null, 2)))),
                sha: fileData.sha
            })
        });

        if (putRes.ok) showNotification(isDelete ? `已刪除 ${newStockCode}` : `已新增 ${newStockCode}，系統將自動更新...`);
        else throw new Error('寫入失敗');
    } catch (error) {
        showNotification(`GitHub 同步失敗: ${error.message}`);
    }
  };

  const handleAddStock = () => {
    if (!inputValue) return;
    const code = inputValue.toUpperCase().trim();
    if (targetStock.some(s => s.code === code)) return;

    const newStock = generateMockData(code);
    setTargetStock(prev => [newStock, ...prev]);
    
    const currentSaved = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    if (!currentSaved.includes(code)) {
        localStorage.setItem('my_saved_stocks', JSON.stringify([...currentSaved, code]));
    }
    
    setInputValue('');
    saveToGitHub(code, false);
  };

  const handleRemoveStock = (code) => {
    setTargetStock(prev => prev.filter(s => s.code !== code));
    const currentSaved = JSON.parse(localStorage.getItem('my_saved_stocks')) || [];
    localStorage.setItem('my_saved_stocks', JSON.stringify(currentSaved.filter(c => c !== code)));
    saveToGitHub(code, true);
  };

  const handleSaveConfig = () => {
    localStorage.setItem('gh_config', JSON.stringify(ghConfig));
    setIsSettingsOpen(false);
    showNotification('設定已儲存！');
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

  const buildPromptText = (stocks) => {
      const stockListString = stocks.map(s => s.code).join('、');
      let allStocksData = "";
      stocks.forEach(stock => {
        if (stock.history && stock.history.length > 0) {
          allStocksData += `\n[${stock.code} - 歷史數據]\n`;
          allStocksData += `日期 | 收盤 | 量 | K | D | MACD\n---|---|---|---|---|---\n`;
          stock.history.forEach(day => {
            allStocksData += `${day.date} | ${day.close} | ${day.volume} | ${day.k} | ${day.d} | ${day.macd}\n`;
          });
        }
      });
      return `請提供 ${stockListString} 的完整每日快訊，以 ${targetDate} 最新的資訊為主。內容需包含：
1. 根據提供的 Raw Data (最近30個交易日收盤價、交易量及 KD/MACD 技術指標) 進行走勢分析；
2. 按 ${stockListString} 業務項目分類說明的最新消息與里程碑；
3. 指數影響分析與分析師評級/預估；
4. ${stockListString} 所屬產業重大消息。

Raw Data:
${allStocksData}`;
  };

  const generateAndCopyPrompt = () => {
      if (targetStock.length === 0) return;
      const validStocks = targetStock.filter(s => !s.error);
      if (validStocks.length === 0) {
          showNotification('沒有有效數據');
          return;
      }
      const promptText = buildPromptText(validStocks);
      navigator.clipboard.writeText(promptText).then(() => showNotification('全體股票指令已複製'));
  };

  const generateSinglePrompt = (stock) => {
      if (!stock || stock.error) {
          showNotification('無有效數據可複製');
          return;
      }
      const promptText = buildPromptText([stock]);
      navigator.clipboard.writeText(promptText).then(() => showNotification(`已複製 ${stock.code} 的專屬指令`));
  };

  const formatChange = (val) => {
    if (val > 0) return `+${val}`;
    return val;
  };

  const getChangeColor = (val) => {
    if (val > 0) return 'text-red-500';
    if (val < 0) return 'text-green-500';
    return 'text-slate-500';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header - 手機排版優化版 */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 relative">
          <div className="flex items-center gap-3 w-full md:w-auto mb-4 md:mb-0">
            <div className="bg-blue-600 p-2 rounded-lg shrink-0"><TrendingUp className="text-white w-6 h-6" /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">個股情報整合助手</h1>
              <p className="text-xs md:text-sm text-slate-500">API Status: {ghConfig.token ? 'Connected' : 'Local Only'}</p>
            </div>
          </div>
          
          {/* Controls - 強制同一行 */}
          <div className="flex flex-row items-center gap-2 w-full md:w-auto justify-between md:justify-end">
             {/* 頁面更新按鈕 */}
             {ghConfig.token && (
                 <button 
                    onClick={triggerGitHubAction}
                    disabled={isUpdating}
                    className={`flex-1 md:flex-none justify-center px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all whitespace-nowrap
                        ${isUpdating 
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' 
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 shadow-sm'}`}
                 >
                    {isUpdating ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {isUpdating ? '更新中' : '立即更新'}
                 </button>
             )}
             
             {/* 時間/狀態標籤 */}
             <div className="flex-1 md:flex-none justify-center px-3 py-2 bg-slate-100 rounded-full text-[10px] md:text-xs font-mono text-slate-600 flex items-center gap-1 whitespace-nowrap">
                <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                {loading ? "讀取中" : lastUpdatedTime ? lastUpdatedTime : targetDate}
            </div>

            {/* 設定按鈕 */}
            <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                className={`p-2 rounded-full transition-colors shrink-0 ${ghConfig.token ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}
            >
                <Settings size={20} />
            </button>
          </div>

          {/* Settings Modal */}
          {isSettingsOpen && (
              <div className="absolute top-full right-0 mt-2 w-full md:w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50">
                  <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><Settings size={16} /> GitHub 連線設定</h3>
                  <div className="space-y-3">
                      <input type="text" value={ghConfig.owner} onChange={e=>setGhConfig({...ghConfig, owner:e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="Owner (e.g., Lai-Tom)" />
                      <input type="text" value={ghConfig.repo} onChange={e=>setGhConfig({...ghConfig, repo:e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="Repo (e.g., my-stock-assistant)" />
                      <input type="password" value={ghConfig.token} onChange={e=>setGhConfig({...ghConfig, token:e.target.value})} className="w-full border rounded p-2 text-sm" placeholder="Token" />
                      <button onClick={handleSaveConfig} className="w-full bg-blue-600 text-white rounded p-2 text-sm font-bold mt-2">儲存</button>
                  </div>
              </div>
          )}
        </header>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-sm font-medium text-slate-700 mb-2">追蹤新股票</label>
          <div className="flex gap-2">
            <input type="text" maxLength={20} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddStock()} placeholder="例如: TSM, LUNR" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-lg uppercase" />
            <button onClick={handleAddStock} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2"><Plus size={20} /> <span className="hidden md:inline">加入</span></button>
          </div>
        </section>

        <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(groupedStocks).map(([industry, stocks]) => (
                <div key={industry} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                     <Globe size={18} className="text-blue-500"/><h3 className="font-bold text-slate-700">{industry}</h3>
                  </div>
                  <div className="flex flex-col gap-2">
                    {stocks.map((stock) => (
                      <div key={stock.code} className={`flex flex-col p-3 border rounded-lg transition-all ${stock.error ? 'bg-red-50 border-red-200' : stock.isMock ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                        {/* 上半部：代碼與狀態 + 複製按鈕 */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 text-xl">{stock.code}</span>
                                {stock.error ? (
                                    <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded flex items-center gap-1" title={stock.error_msg}><AlertTriangle size={8}/> 查無資料</span>
                                ) : stock.isMock ? (
                                    <span className="text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1" title="Action 執行中"><RefreshCw size={8} className="animate-spin"/> Syncing</span>
                                ) : (
                                    <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded"><Check size={8}/> Real</span>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {!stock.error && (
                                    <button 
                                        onClick={() => generateSinglePrompt(stock)}
                                        className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors"
                                    >
                                        <FileText size={12} />
                                        複製提示詞
                                    </button>
                                )}
                                <button onClick={() => handleRemoveStock(stock.code)} className="p-1 hover:bg-red-100 text-slate-400 hover:text-red-500 rounded"><X size={16} /></button>
                            </div>
                        </div>

                        {/* 下半部：詳細數據 */}
                        {!stock.error && (
                            <div className="text-sm">
                                <div className="text-slate-500 mb-1">
                                    收盤: 
                                    <span className={`font-mono text-lg font-bold ml-1 ${getChangeColor(stock.change)}`}>
                                        {stock.history?.[0]?.close || '-'}
                                    </span>
                                    <span className="text-xs ml-1 font-normal text-slate-400">
                                        {stock.currency || (stock.isMock ? 'USD/TWD' : '')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-medium font-mono">
                                    <span className={getChangeColor(stock.change)}>
                                        漲跌: {formatChange(stock.change || 0)}
                                    </span>
                                    <span className={getChangeColor(stock.pctChange)}>
                                        漲幅: {formatChange(stock.pctChange || 0)}%
                                    </span>
                                    <span className="text-slate-600">
                                        總量: {stock.history?.[0]?.volume ? (stock.history[0].volume / 1000).toFixed(0) + 'k' : '-'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {stock.error && <div className="text-xs text-red-500 mt-1">無法取得資料，請檢查代碼。</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
        </section>

        <section className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 rounded-2xl shadow-lg text-white">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Terminal className="text-blue-200" size={24} /> Gemini Prompt</h2>
                <button onClick={generateAndCopyPrompt} className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold flex items-center gap-2"><Copy size={20} /> 複製全部指令</button>
            </div>
            <div className="h-32 overflow-y-auto bg-black/20 rounded-xl p-4 font-mono text-xs text-blue-100 border border-white/10 custom-scrollbar">
                {targetStock.length > 0 ? `預覽: 請提供 ${targetStock.filter(s=>!s.error).map(s=>s.code).join('、')} 的完整每日快訊...` : '等待數據中...'}
            </div>
        </section>
        {notification && <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-bounce text-sm">{notification}</div>}
      </div>
    </div>
  );
};

export default App;

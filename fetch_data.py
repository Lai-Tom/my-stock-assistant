import yfinance as yf
import pandas as pd
import json
import os
from datetime import datetime, timedelta

# 設定您要追蹤的股票清單
# 格式：台股請加 .TW (上市) 或 .TWO (上櫃)，美股直接輸入代碼
TARGET_STOCKS = [
    "2330.TW",  # 台積電
    "3491.TW",  # 鴻海
    "RKLB",     # RKLB
    "LEU",     # LEU
    "OKLO",      # OKLO
    "FLY"       # Firefly Aerospace (依您需求設定代號，若 yfinance 查無此代號會跳過)
]

def calculate_technical_indicators(df):
    # 確保資料足夠
    if len(df) < 35:
        return df

    # 1. 計算 KD 值 (9日 RSV)
    # RSV = (今日收盤 - 最近9天最低) / (最近9天最高 - 最近9天最低) * 100
    low_min = df['Low'].rolling(window=9).min()
    high_max = df['High'].rolling(window=9).max()
    rsv = (df['Close'] - low_min) / (high_max - low_min) * 100
    
    # K = 2/3 * 昨日K + 1/3 * 今日RSV
    # D = 2/3 * 昨日D + 1/3 * 今日K
    # Pandas 沒有直接的遞迴計算，這裡用簡單的平滑模擬或迴圈
    k_values = [50] # 初始值
    d_values = [50]
    
    for i in range(len(df)):
        if pd.isna(rsv.iloc[i]):
            k_values.append(50)
            d_values.append(50)
        else:
            curr_rsv = rsv.iloc[i]
            curr_k = (2/3) * k_values[-1] + (1/3) * curr_rsv
            curr_d = (2/3) * d_values[-1] + (1/3) * curr_k
            k_values.append(curr_k)
            d_values.append(curr_d)
            
    df['K'] = k_values[1:] # 移除初始的 50
    df['D'] = d_values[1:]

    # 2. 計算 MACD
    # EMA 12, EMA 26
    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    df['DIF'] = ema12 - ema26
    df['MACD_Signal'] = df['DIF'].ewm(span=9, adjust=False).mean() # DEA
    df['MACD_Hist'] = df['DIF'] - df['MACD_Signal'] # 柱狀圖

    return df

def fetch_all_stocks():
    results = []
    print(f"開始抓取資料，目標日期: {datetime.now().strftime('%Y-%m-%d')}")

    for code in TARGET_STOCKS:
        try:
            print(f"正在處理: {code}...")
            # 抓取最近 60 天資料 (為了計算技術指標，需要多抓一點)
            stock = yf.Ticker(code)
            hist = stock.history(period="60d")
            
            if hist.empty:
                print(f"  -> 警告: 找不到 {code} 的資料")
                continue

            # 計算指標
            hist = calculate_technical_indicators(hist)
            
            # 只取最後 30 筆交易日資料供前端顯示
            last_30 = hist.tail(30).reset_index()
            
            history_data = []
            for _, row in last_30.iterrows():
                # 處理日期格式
                date_str = row['Date'].strftime('%Y-%m-%d')
                
                history_data.append({
                    "date": date_str,
                    "close": round(row['Close'], 2),
                    "volume": int(row['Volume']),
                    "k": round(row.get('K', 50), 1),
                    "d": round(row.get('D', 50), 1),
                    "macd": round(row.get('MACD_Hist', 0), 2)
                })

            # 簡單分類產業
            industry = "其他"
            if "2330" in code or "TSM" in code or "NVDA" in code: industry = "半導體業"
            elif "FLY" in code: industry = "航太與國防"
            elif ".TW" in code: industry = "台灣上市櫃"
            else: industry = "美股/國際"

            results.append({
                "id": code,
                "code": code.replace(".TW", ""), # 顯示時拿掉後綴比較美觀
                "name": code,
                "industry": industry,
                "history": history_data[::-1] # 反轉陣列，讓最新的在最前面
            })
            
        except Exception as e:
            print(f"  -> 錯誤: 處理 {code} 時發生異常: {e}")

    # 確保輸出目錄存在
    os.makedirs('public', exist_ok=True)
    
    # 寫入 JSON 檔案
    with open('public/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("資料更新完成，已儲存至 public/stocks.json")

if __name__ == "__main__":
    fetch_all_stocks()

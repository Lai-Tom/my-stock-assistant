import yfinance as yf
import pandas as pd
import json
import os
from datetime import datetime

# 讀取清單
def load_stock_list():
    try:
        with open('stock_list.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print("警告: 找不到 stock_list.json，使用預設清單")
        return ["2330.TW", "NVDA"] 

TARGET_STOCKS = load_stock_list()

def calculate_technical_indicators(df):
    if len(df) < 65: 
        return df

    # 均線 (MA)
    df['5MA'] = df['Close'].rolling(window=5).mean()
    df['20MA'] = df['Close'].rolling(window=20).mean()
    df['60MA'] = df['Close'].rolling(window=60).mean() # 季線

    # 計算 KD
    low_min = df['Low'].rolling(window=9).min()
    high_max = df['High'].rolling(window=9).max()
    rsv = (df['Close'] - low_min) / (high_max - low_min) * 100
    
    k_values = [50]
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
            
    df['K'] = k_values[1:]
    df['D'] = d_values[1:]

    # 計算 MACD 家族
    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    df['DIF'] = ema12 - ema26
    df['MACD'] = df['DIF'].ewm(span=9, adjust=False).mean()
    df['OSC'] = df['DIF'] - df['MACD']

    # 新增 RSI (6日與14日)
    delta = df['Close'].diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    
    # 6日 RSI
    ema_up_6 = up.ewm(com=5, adjust=False).mean()
    ema_down_6 = down.ewm(com=5, adjust=False).mean()
    rs_6 = ema_up_6 / ema_down_6
    df['RSI6'] = 100 - (100 / (1 + rs_6))

    # 14日 RSI
    ema_up_14 = up.ewm(com=13, adjust=False).mean()
    ema_down_14 = down.ewm(com=13, adjust=False).mean()
    rs_14 = ema_up_14 / ema_down_14
    df['RSI14'] = 100 - (100 / (1 + rs_14))

    return df

def fetch_all_stocks():
    results = []
    print(f"開始抓取資料，目標日期: {datetime.now().strftime('%Y-%m-%d')}")
    
    for code in TARGET_STOCKS:
        try:
            # 1. 智慧判斷代碼
            search_ticker = code
            if code.isdigit() and len(code) == 4:
                search_ticker = f"{code}.TW"
            
            print(f"正在處理: {code} (查詢代號: {search_ticker})...")
            
            stock = yf.Ticker(search_ticker)
            # 抓取 6 個月，以確保 60MA 算得出來
            hist = stock.history(period="6mo") 
            
            # 2. 上櫃股票救援機制 (.TWO)
            if hist.empty and search_ticker.endswith('.TW'):
                print(f"  -> .TW 無資料，嘗試 .TWO (上櫃)...")
                search_ticker = f"{code}.TWO"
                stock = yf.Ticker(search_ticker)
                hist = stock.history(period="6mo")

            industry = "其他"
            clean_code = code.replace(".TW", "").replace(".TWO", "")
            
            # 簡單分類
            if clean_code in ["2330", "2454", "3491", "TSM", "NVDA", "AMD"]: industry = "半導體業"
            elif "FLY" in code or "LMT" in code: industry = "航太與國防"
            elif ".TW" in search_ticker or ".TWO" in search_ticker: industry = "台灣上市櫃股票"
            else: industry = "美股/國際"

            # 3. 錯誤處理
            if hist.empty:
                print(f"  -> 警告: 找不到 {search_ticker} 的資料，標記為 Error")
                results.append({
                    "id": clean_code,
                    "code": clean_code,
                    "name": code,
                    "industry": industry,
                    "history": [],
                    "error": True,
                    "error_msg": "查無資料 (Yahoo Finance)"
                })
                continue

            # 漲跌幅與幣別
            change = 0
            pct_change = 0
            if len(hist) >= 2:
                today_close = hist['Close'].iloc[-1]
                yesterday_close = hist['Close'].iloc[-2]
                change = today_close - yesterday_close
                pct_change = (change / yesterday_close) * 100
            
            currency = "USD"
            if ".TW" in search_ticker or ".TWO" in search_ticker:
                currency = "TWD"
                
            # --- 新增：嘗試取得下一次財報日期 ---
            earnings_date_str = None
            try:
                calendar = stock.calendar
                if calendar is not None and not calendar.empty:
                    # 依據 yfinance 版本不同，財報日可能以不同格式存在
                    if 'Earnings Date' in calendar:
                        dates = calendar['Earnings Date']
                        if len(dates) > 0:
                            # 轉換為字串格式 YYYY-MM-DD
                            earnings_date_str = dates[0].strftime('%Y-%m-%d')
            except Exception as e:
                print(f"  -> 無法取得 {search_ticker} 財報日: {e}")
            # -----------------------------------
            
            hist = calculate_technical_indicators(hist)
            last_30 = hist.tail(30).reset_index()
            
            def safe_round(val, decimals=2):
                return round(val, decimals) if pd.notna(val) else None

            history_data = []
            for _, row in last_30.iterrows():
                date_str = row['Date'].strftime('%Y-%m-%d')
                history_data.append({
                    "date": date_str,
                    "open": safe_round(row['Open']),
                    "high": safe_round(row['High']),
                    "low": safe_round(row['Low']),
                    "close": safe_round(row['Close']),
                    "volume": int(row['Volume']) if pd.notna(row['Volume']) else 0,
                    "ma5": safe_round(row.get('5MA')),
                    "ma20": safe_round(row.get('20MA')),
                    "ma60": safe_round(row.get('60MA')),
                    "k": safe_round(row.get('K', 50), 1),
                    "d": safe_round(row.get('D', 50), 1),
                    "dif": safe_round(row.get('DIF')),
                    "macd": safe_round(row.get('MACD')),
                    "osc": safe_round(row.get('OSC')),
                    "rsi6": safe_round(row.get('RSI6')),
                    "rsi14": safe_round(row.get('RSI14'))
                })

            results.append({
                "id": clean_code,
                "code": clean_code, 
                "name": code,
                "industry": industry,
                "currency": currency,
                "earningsDate": earnings_date_str, # 寫入財報日
                "change": round(change, 2),
                "pctChange": round(pct_change, 2),
                "history": history_data[::-1],
                "error": False
            })
            
        except Exception as e:
            print(f"  -> 錯誤: 處理 {code} 時發生異常: {e}")
            results.append({
                "id": code,
                "code": code,
                "name": code,
                "industry": "錯誤",
                "history": [],
                "error": True,
                "error_msg": "系統異常"
            })

    os.makedirs('public', exist_ok=True)
    
    with open('public/stocks.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("資料更新完成！")

if __name__ == "__main__":
    fetch_all_stocks()

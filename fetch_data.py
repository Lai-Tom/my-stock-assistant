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
    if len(df) < 35:
        return df

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

    # 計算 MACD
    ema12 = df['Close'].ewm(span=12, adjust=False).mean()
    ema26 = df['Close'].ewm(span=26, adjust=False).mean()
    df['DIF'] = ema12 - ema26
    df['MACD_Signal'] = df['DIF'].ewm(span=9, adjust=False).mean()
    df['MACD_Hist'] = df['DIF'] - df['MACD_Signal']

    return df

def fetch_all_stocks():
    results = []
    print(f"開始抓取資料，目標日期: {datetime.now().strftime('%Y-%m-%d')}")
    
    for code in TARGET_STOCKS:
        try:
            # 1. 智慧判斷代碼
            search_ticker = code
            # 如果是4位數字，預設先加 .TW (上市)
            if code.isdigit() and len(code) == 4:
                search_ticker = f"{code}.TW"
            
            print(f"正在處理: {code} (查詢代號: {search_ticker})...")
            
            stock = yf.Ticker(search_ticker)
            hist = stock.history(period="60d")
            
            # 2. 上櫃股票救援機制 (.TWO)
            # 如果 .TW 抓不到，且原本是數字，嘗試 .TWO
            if hist.empty and search_ticker.endswith('.TW'):
                print(f"  -> .TW 無資料，嘗試 .TWO (上櫃)...")
                search_ticker = f"{code}.TWO"
                stock = yf.Ticker(search_ticker)
                hist = stock.history(period="60d")

            industry = "其他"
            clean_code = code.replace(".TW", "").replace(".TWO", "")
            
            # 簡單分類
            if clean_code in ["2330", "2454", "3491", "TSM", "NVDA", "AMD"]: industry = "半導體業"
            elif "FLY" in code or "LMT" in code: industry = "航太與國防"
            elif ".TW" in search_ticker or ".TWO" in search_ticker: industry = "台灣上市櫃股票"
            else: industry = "美股/國際"

            # 3. 錯誤處理機制 (關鍵修改)
            if hist.empty:
                print(f"  -> 警告: 找不到 {search_ticker} 的資料，標記為 Error")
                # 即使抓不到，也要加入 results，但標記 error
                results.append({
                    "id": clean_code,
                    "code": clean_code,
                    "name": code,
                    "industry": industry,
                    "history": [],
                    "error": True, # 告訴前端這支股票抓失敗了
                    "error_msg": "查無資料 (Yahoo Finance)"
                })
                continue

            hist = calculate_technical_indicators(hist)
            last_30 = hist.tail(30).reset_index()
            
            history_data = []
            for _, row in last_30.iterrows():
                date_str = row['Date'].strftime('%Y-%m-%d')
                history_data.append({
                    "date": date_str,
                    "close": round(row['Close'], 2),
                    "volume": int(row['Volume']),
                    "k": round(row.get('K', 50), 1),
                    "d": round(row.get('D', 50), 1),
                    "macd": round(row.get('MACD_Hist', 0), 2)
                })

            results.append({
                "id": clean_code,
                "code": clean_code, 
                "name": code,
                "industry": industry,
                "history": history_data[::-1],
                "error": False
            })
            
        except Exception as e:
            print(f"  -> 錯誤: 處理 {code} 時發生異常: {e}")
            # 發生例外錯誤也要回報
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

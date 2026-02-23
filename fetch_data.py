import yfinance as yf
import pandas as pd
import json
import os
import math
import requests
from datetime import datetime, timedelta

# 讀取清單
def load_stock_list():
    try:
        with open('stock_list.json', 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"警告: 讀取 stock_list.json 失敗 ({e})，將使用預設清單")
        return ["2330.TW", "NVDA", "FLY", "SMR"] 

TARGET_STOCKS = load_stock_list()

def calculate_technical_indicators(df):
    if len(df) < 65: 
        return df

    # 均線
    df['5MA'] = df['Close'].rolling(window=5).mean()
    df['20MA'] = df['Close'].rolling(window=20).mean()
    df['60MA'] = df['Close'].rolling(window=60).mean()

    # 計算 KD
    low_min = df['Low'].rolling(window=9).min()
    high_max = df['High'].rolling(window=9).max()
    rsv = (df['Close'] - low_min) / (high_max - low_min).replace(0, 1e-9) * 100
    
    k_values = [50]
    d_values = [50]
    
    for i in range(len(df)):
        if pd.isna(rsv.iloc[i]) or math.isinf(rsv.iloc[i]):
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
    df['MACD'] = df['DIF'].ewm(span=9, adjust=False).mean()
    df['OSC'] = df['DIF'] - df['MACD']

    # 新增 RSI (6日與14日)
    delta = df['Close'].diff()
    up = delta.clip(lower=0)
    down = -1 * delta.clip(upper=0)
    
    ema_up_6 = up.ewm(com=5, adjust=False).mean()
    ema_down_6 = down.ewm(com=5, adjust=False).mean()
    rs_6 = ema_up_6 / ema_down_6.replace(0, 1e-9)
    df['RSI6'] = 100 - (100 / (1 + rs_6))

    ema_up_14 = up.ewm(com=13, adjust=False).mean()
    ema_down_14 = down.ewm(com=13, adjust=False).mean()
    rs_14 = ema_up_14 / ema_down_14.replace(0, 1e-9)
    df['RSI14'] = 100 - (100 / (1 + rs_14))

    return df

def fetch_taiwan_institutional(target_date):
    """
    嘗試抓取台灣上市/上櫃的三大法人買賣超資料。
    由於證交所 API 常封鎖 GitHub Actions IP，此函式加入高度防呆機制。
    """
    twse_data = {}
    tpex_data = {}
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
    
    # 格式化日期：TWSE 要 YYYYMMDD，TPEx 要 113/MM/DD (民國年)
    date_str_twse = target_date.strftime('%Y%m%d')
    roc_year = target_date.year - 1911
    date_str_tpex = f"{roc_year}/{target_date.strftime('%m/%d')}"
    
    try:
        # 上市 (TWSE) - T86 三大法人買賣超日報
        url_twse = f"https://www.twse.com.tw/fund/T86?response=json&date={date_str_twse}&selectType=ALL"
        res_twse = requests.get(url_twse, headers=headers, timeout=5)
        if res_twse.status_code == 200:
            data = res_twse.json()
            if 'data' in data:
                # 欄位索引依 TWSE 規定：0=代號, 4=外資買賣超, 10=投信買賣超 (股數，需除以1000變張數)
                for row in data['data']:
                    code = row[0].strip()
                    try:
                        foreign = int(row[4].replace(',', '')) // 1000
                        trust = int(row[10].replace(',', '')) // 1000
                        twse_data[code] = {'foreign': foreign, 'trust': trust}
                    except:
                        pass
    except Exception as e:
        print(f"上市法人資料抓取失敗: {e}")

    try:
        # 上櫃 (TPEx)
        url_tpex = f"https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&o=json&d={date_str_tpex}&se=EW"
        res_tpex = requests.get(url_tpex, headers=headers, timeout=5)
        if res_tpex.status_code == 200:
            data = res_tpex.json()
            if 'aaData' in data:
                # 欄位索引依 TPEx 規定：0=代號, 4=外資買賣超, 10=投信買賣超 (同上)
                for row in data['aaData']:
                    code = row[0].strip()
                    try:
                        foreign = int(row[4].replace(',', '')) // 1000
                        trust = int(row[10].replace(',', '')) // 1000
                        tpex_data[code] = {'foreign': foreign, 'trust': trust}
                    except:
                        pass
    except Exception as e:
        print(f"上櫃法人資料抓取失敗: {e}")
        
    return twse_data, tpex_data

def fetch_all_stocks():
    results = []
    now = datetime.now()
    print(f"開始抓取資料，目標日期: {now.strftime('%Y-%m-%d')}")
    
    # 預先取得今日的法人資料 (若遇到假日或未收盤可能為空，實務上可寫迴圈找最近交易日，此處從簡)
    # 取近期的工作日來嘗試抓取
    target_date = now
    if target_date.weekday() == 5: target_date -= timedelta(days=1)
    if target_date.weekday() == 6: target_date -= timedelta(days=2)
    
    print(f"嘗試抓取台股法人資料 (日期: {target_date.strftime('%Y-%m-%d')})...")
    twse_inst, tpex_inst = fetch_taiwan_institutional(target_date)
    
    for code in TARGET_STOCKS:
        try:
            search_ticker = code
            if code.isdigit() and len(code) == 4:
                search_ticker = f"{code}.TW"
            
            print(f"正在處理: {code} (查詢代號: {search_ticker})...")
            
            stock = yf.Ticker(search_ticker)
            hist = stock.history(period="6mo") 
            
            if hist.empty and search_ticker.endswith('.TW'):
                print(f"  -> .TW 無資料，嘗試 .TWO (上櫃)...")
                search_ticker = f"{code}.TWO"
                stock = yf.Ticker(search_ticker)
                hist = stock.history(period="6mo")

            industry = "其他"
            clean_code = code.replace(".TW", "").replace(".TWO", "")
            
            if clean_code in ["2330", "2454", "3491", "TSM", "NVDA", "AMD"]: industry = "半導體業"
            elif "FLY" in code or "LMT" in code: industry = "航太與國防"
            elif ".TW" in search_ticker or ".TWO" in search_ticker: industry = "台灣上市櫃股票"
            else: industry = "美股/國際"

            if hist.empty:
                print(f"  -> 警告: 找不到 {search_ticker} 的資料，標記為 Error")
                results.append({
                    "id": clean_code, "code": clean_code, "name": code,
                    "industry": industry, "history": [],
                    "error": True, "error_msg": "查無資料 (Yahoo Finance)"
                })
                continue

            # 漲跌幅與幣別
            change = 0
            pct_change = 0
            if len(hist) >= 2:
                today_close = hist['Close'].iloc[-1]
                yesterday_close = hist['Close'].iloc[-2]
                change = today_close - yesterday_close
                if yesterday_close > 0:
                    pct_change = (change / yesterday_close) * 100
            
            currency = "USD"
            if ".TW" in search_ticker or ".TWO" in search_ticker:
                currency = "TWD"
                
            # 財報日期取得
            earnings_date_str = None
            try:
                calendar = stock.calendar
                if calendar is not None and not calendar.empty:
                    if 'Earnings Date' in calendar:
                        dates = calendar['Earnings Date']
                        if len(dates) > 0:
                            earnings_date_str = dates[0].strftime('%Y-%m-%d')
            except Exception as e:
                print(f"  -> 無法取得 {search_ticker} 財報日: {e}")

            # 法人買賣超資料配對
            foreign_net = None
            trust_net = None
            if currency == "TWD":
                if search_ticker.endswith('.TW') and clean_code in twse_inst:
                    foreign_net = twse_inst[clean_code]['foreign']
                    trust_net = twse_inst[clean_code]['trust']
                elif search_ticker.endswith('.TWO') and clean_code in tpex_inst:
                    foreign_net = tpex_inst[clean_code]['foreign']
                    trust_net = tpex_inst[clean_code]['trust']
            
            hist = calculate_technical_indicators(hist)
            last_30 = hist.tail(30).reset_index()
            
            def safe_round(val, decimals=2):
                try:
                    if pd.isna(val) or math.isinf(float(val)):
                        return None
                    return round(float(val), decimals)
                except (ValueError, TypeError, OverflowError):
                    return None

            history_data = []
            for _, row in last_30.iterrows():
                date_str = row['Date'].strftime('%Y-%m-%d')
                history_data.append({
                    "date": date_str,
                    "open": safe_round(row['Open']),
                    "high": safe_round(row['High']),
                    "low": safe_round(row['Low']),
                    "close": safe_round(row['Close']),
                    "volume": int(row['Volume']) if pd.notna(row['Volume']) and not math.isinf(row['Volume']) else 0,
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
                "id": clean_code, "code": clean_code, "name": code,
                "industry": industry, "currency": currency,
                "earningsDate": earnings_date_str,
                "foreignNet": foreign_net,
                "trustNet": trust_net,
                "change": safe_round(change, 2),
                "pctChange": safe_round(pct_change, 2),
                "history": history_data[::-1],
                "error": False
            })
            
        except Exception as e:
            print(f"  -> 錯誤: 處理 {code} 時發生異常: {e}")
            results.append({
                "id": code, "code": code, "name": code,
                "industry": "錯誤", "history": [],
                "error": True, "error_msg": "系統異常"
            })

    os.makedirs('public', exist_ok=True)
    
    try:
        with open('public/stocks.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("資料更新完成！")
    except Exception as e:
        print(f"寫入 JSON 失敗: {e}")

if __name__ == "__main__":
    fetch_all_stocks()

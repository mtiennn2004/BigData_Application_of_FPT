from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import NoSuchElementException
import time
from datetime import datetime, date

CAFEF_URL = "https://cafef.vn/du-lieu/lich-su-giao-dich-fpt-1.chn#data"

def _parse_date_vn(s: str) -> date | None:
    # dd/mm/yyyy
    try:
        d, m, y = s.strip().split("/")
        return date(int(y), int(m), int(d))
    except:
        return None

def _to_float(s: str):
    if s is None:
        return None
    s = s.strip().replace(" ", "")

    # Nếu có cả '.' và ',' thì thường '.' là ngăn nghìn và ',' là thập phân (kiểu EU)
    # Nếu chỉ có '.' (như 107.2) => '.' là thập phân
    # Nếu chỉ có ',' => ',' là thập phân
    if "." in s and "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s and "." not in s:
        s = s.replace(",", ".")
    # else: giữ nguyên '.'

    try:
        return float(s)
    except:
        return None

def _to_int(s: str):
    if s is None:
        return None
    s = s.strip().replace(".", "").replace(",", "")
    try:
        return int(s)
    except:
        return None

def _build_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(60)
    return driver

def _scrape_current_table(driver) -> list[dict]:
    # Lấy các dòng lịch sử (odd/even)
    trs = driver.find_elements(By.CSS_SELECTOR, "tr.oddOwner, tr.evenOwner")
    rows = []
    for tr in trs:
        try:
            date_txt = tr.find_element(By.CLASS_NAME, "owner_time").text.strip()

            close = tr.find_element(By.CLASS_NAME, "owner_priceClose").text.strip()
            change = tr.find_element(By.CLASS_NAME, "owner_change-td").text.strip()
            volume = tr.find_element(By.CLASS_NAME, "owner_gd_td").text.strip()

            prices = tr.find_elements(By.CLASS_NAME, "owner_price_td")
            open_ = prices[0].text.strip() if len(prices) > 0 else ""
            high  = prices[1].text.strip() if len(prices) > 1 else ""
            low   = prices[2].text.strip() if len(prices) > 2 else ""

            rows.append({
                "date": date_txt,                 # "dd/mm/yyyy"
                "open": _to_float(open_),
                "high": _to_float(high),
                "low": _to_float(low),
                "close": _to_float(close),
                "changeText": change,             # giữ để hiển thị đẹp
                "volume": _to_int(volume),
            })
        except:
            # nếu một dòng lỗi, bỏ qua
            continue

    # CAFEF thường hiển thị mới -> cũ; giữ nguyên thứ tự này
    return rows

def _click_next_page(driver) -> bool:
    """
    Click nút trang kế tiếp nếu có.
    Trên CAFEF có phân trang; selector có thể thay đổi theo thời gian.
    Mình thử một vài selector phổ biến. Nếu sau này CAFEF đổi UI, bạn chỉ cần chỉnh selector ở đây.
    """
    candidates = [
        "a[rel='next']",
        "a.next",               # một số site dùng class next
        "a#paging_right",       # đôi khi có id kiểu này
        "a[title='Trang sau']",
        "a[title='Next']",
    ]
    for css in candidates:
        try:
            el = driver.find_element(By.CSS_SELECTOR, css)
            if el and el.is_displayed() and el.is_enabled():
                el.click()
                time.sleep(1.6)
                return True
        except NoSuchElementException:
            continue
        except:
            continue
    return False

def fetch_latest_pages(pages: int = 2) -> list[dict]:
    """
    Chỉ scrape 1-2 trang đầu để bắt dữ liệu mới (nhẹ).
    """
    driver = _build_driver()
    try:
        driver.get(CAFEF_URL)
        time.sleep(2.5)

        all_rows = []
        for _ in range(pages):
            all_rows.extend(_scrape_current_table(driver))
            if not _click_next_page(driver):
                break
        return all_rows
    finally:
        driver.quit()

def fetch_history_last_5_years(symbol: str = "FPT") -> list[dict]:
    """
    Backfill 5 năm gần nhất: click phân trang cho tới khi gặp ngày < cutoff.
    """
    # cutoff ~ 5 năm trước (xử lý trường hợp 29/02)
    today = date.today()
    try:
        cutoff = date(today.year - 5, today.month, today.day)
    except ValueError:
        # ví dụ 29/02
        cutoff = date(today.year - 5, today.month, 28)

    driver = _build_driver()
    try:
        driver.get(CAFEF_URL)
        time.sleep(2.5)

        collected = []
        seen_dates = set()

        while True:
            page_rows = _scrape_current_table(driver)
            if not page_rows:
                break

            stop = False
            for r in page_rows:
                d = _parse_date_vn(r["date"])
                if d is None:
                    continue

                # quá 5 năm thì dừng
                if d < cutoff:
                    stop = True
                    break

                # dedupe theo date
                if r["date"] not in seen_dates:
                    seen_dates.add(r["date"])
                    collected.append(r)

            if stop:
                break

            if not _click_next_page(driver):
                break

        # collected đang theo thứ tự mới->cũ (theo các trang). OK cho frontend.
        return collected

    finally:
        driver.quit()


import urllib.parse
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("DATABASE_URL")
if url:
    print(f"Original URL: {url}")
    try:
        # SQLAlchemy and other libs unquote the URL
        unquoted = urllib.parse.unquote(url)
        print(f"Unquoted URL: {unquoted}")
    except Exception as e:
        print(f"Error unquoting URL: {e}")
else:
    print("DATABASE_URL not found in .env")

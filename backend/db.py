import clickhouse_connect
from dotenv import load_dotenv
import os

load_dotenv("/opt/rita-gui/.env")

def get_client():
    return clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "127.0.0.1"),
        port=int(os.getenv("CLICKHOUSE_PORT", 8123)),
        username=os.getenv("CLICKHOUSE_USER", "default"),
        password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    )

import os

ENV = os.environ.get("APP_ENV", "dev")  # "dev" | "prod"

_DEFAULTS = {
    "dev": {
        "API_BASE_URL": "http://localhost:3000",
        "ADMIN_API_KEY": "dev-admin-key",
    },
    "prod": {
        "API_BASE_URL": "",       # must be set via env
        "ADMIN_API_KEY": "",      # must be set via env
    },
}

def _get(key):
    return os.environ.get(key) or _DEFAULTS.get(ENV, _DEFAULTS["dev"]).get(key, "")

API_BASE_URL = _get("API_BASE_URL")
ADMIN_API_KEY = _get("ADMIN_API_KEY")

if ENV == "prod" and (not API_BASE_URL or not ADMIN_API_KEY):
    raise RuntimeError("prod 环境必须设置 API_BASE_URL 和 ADMIN_API_KEY 环境变量")

HEADERS = {
    "Authorization": f"Bearer {ADMIN_API_KEY}",
    "Content-Type": "application/json",
}

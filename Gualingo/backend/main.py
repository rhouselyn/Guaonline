"""少邻国 - Gualingo 后端入口。

职责：创建 FastAPI 应用、挂载 CORS 中间件、注册路由、启动事件、前端静态文件服务。
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from config import FRONTEND_DIR, HOST, PORT
from utils.state import storage

# ── 创建应用 ──────────────────────────────────────────────
app = FastAPI(title="少邻国 - Gualingo", version="1.0.0")

# ── CORS 中间件 ───────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 注册路由 ──────────────────────────────────────────────
from routers import text_processing, learning, phases, vocabulary, history, settings, tts, favorites
from auth.router import router as auth_router
from routers.admin import router as admin_router

app.include_router(text_processing.router)
app.include_router(learning.router)
app.include_router(phases.router)
app.include_router(vocabulary.router)
app.include_router(history.router)
app.include_router(settings.router)
app.include_router(tts.router)
app.include_router(favorites.router)
app.include_router(auth_router)
app.include_router(admin_router)

# ── 启动事件 ──────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    pass


# ── 前端静态文件服务 ────────────────────────────────────────

# 挂载前端的 assets 目录
_assets_dir = FRONTEND_DIR / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="assets")


# 根路径：返回前端 index.html
@app.get("/")
async def serve_root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# SPA fallback：所有非 /api 路由返回 index.html
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse(str(FRONTEND_DIR / "index.html"))


# ── 直接运行 ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, timeout_keep_alive=600)

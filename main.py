from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import asyncio
import os
from tv_manager import TvManager

app = FastAPI(title="Android TV Web Remote")
tv_manager = TvManager()

# Absolute paths for Docker/Environment safety
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount assets folder
app.mount("/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets")

class CommandRequest(BaseModel):
    ip: str
    command: str
    is_text: bool = False
    is_app: bool = False

class PairingRequest(BaseModel):
    ip: str
    code: Optional[str] = None

@app.get("/discover")
async def discover_tvs():
    tvs = await tv_manager.discover(timeout=3.0)
    return tvs

@app.post("/connect")
async def connect_tv(request: PairingRequest):
    status = await tv_manager.connect(request.ip)
    return {"status": status}

@app.post("/pair/start")
async def start_pairing(request: PairingRequest):
    success = await tv_manager.start_pairing(request.ip)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to start pairing")
    return {"status": "success", "message": "Pairing started. Check your TV for a PIN."}

@app.post("/pair/finish")
async def finish_pairing(request: PairingRequest):
    if not request.code:
        raise HTTPException(status_code=400, detail="Pairing code is required")
    success = await tv_manager.finish_pairing(request.ip, request.code)
    if not success:
        raise HTTPException(status_code=401, detail="Invalid pairing code")
    return {"status": "success", "message": "Pairing completed successfully."}

@app.post("/command")
async def send_command(request: CommandRequest):
    success = await tv_manager.connect_and_send(
        request.ip, 
        request.command, 
        is_text=request.is_text, 
        is_app=request.is_app
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send command")
    return {"status": "success"}

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/style.css")
async def serve_style():
    return FileResponse(os.path.join(BASE_DIR, "style.css"))

@app.get("/app.js")
async def serve_app():
    return FileResponse(os.path.join(BASE_DIR, "app.js"))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8504)

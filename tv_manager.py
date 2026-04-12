import asyncio
import logging
import os
from typing import Dict, List, Optional, Any
from zeroconf import ServiceStateChange, Zeroconf
from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf
from androidtvremote2 import AndroidTVRemote, CannotConnect, ConnectionClosed, InvalidAuth

_LOGGER = logging.getLogger(__name__)

class TvManager:
    def __init__(self, client_name: str = "Web Remote", cert_dir: str = "certs"):
        self.client_name = client_name
        self.cert_dir = cert_dir
        self.certfile = os.path.join(cert_dir, "cert.pem")
        self.keyfile = os.path.join(cert_dir, "key.pem")
        self.discovered_devices: Dict[str, Dict[str, Any]] = {}
        self.active_remotes: Dict[str, AndroidTVRemote] = {}
        self.connected_ips: set = set()
        
        if not os.path.exists(cert_dir):
            os.makedirs(cert_dir)

    async def discover(self, timeout: float = 3.0) -> List[Dict[str, Any]]:
        self.discovered_devices = {}
        
        def on_service_state_change(zeroconf: Zeroconf, service_type: str, name: str, state_change: ServiceStateChange) -> None:
            if state_change is ServiceStateChange.Added:
                asyncio.ensure_future(self._get_service_info(zeroconf, service_type, name))

        zc = AsyncZeroconf()
        services = ["_androidtvremote2._tcp.local."]
        browser = AsyncServiceBrowser(zc.zeroconf, services, handlers=[on_service_state_change])
        
        await asyncio.sleep(timeout)
        await browser.async_cancel()
        await zc.async_close()
        
        return list(self.discovered_devices.values())

    async def _get_service_info(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        info = AsyncServiceInfo(service_type, name)
        await info.async_request(zeroconf, 3000)
        if info:
            addresses = info.parsed_scoped_addresses()
            if addresses:
                ip = addresses[0]
                self.discovered_devices[ip] = {
                    "name": name.split(".")[0],
                    "ip": ip,
                    "port": info.port,
                    "model": info.properties.get(b"md", b"Unknown").decode() if info.properties else "Unknown"
                }

    async def get_remote(self, ip: str) -> AndroidTVRemote:
        if ip in self.active_remotes:
            return self.active_remotes[ip]
        
        remote = AndroidTVRemote(self.client_name, self.certfile, self.keyfile, ip)
        self.active_remotes[ip] = remote
        return remote

    async def start_pairing(self, ip: str) -> bool:
        remote = await self.get_remote(ip)
        await remote.async_generate_cert_if_missing()
        await remote.async_start_pairing()
        return True

    async def finish_pairing(self, ip: str, code: str) -> bool:
        remote = await self.get_remote(ip)
        try:
            await remote.async_finish_pairing(code)
            return True
        except (InvalidAuth, ConnectionClosed):
            return False

    async def connect(self, ip: str) -> str:
        remote = await self.get_remote(ip)
        
        if ip in self.connected_ips:
            return "connected"
            
        try:
            await remote.async_connect()
            remote.keep_reconnecting()
            self.connected_ips.add(ip)
            return "connected"
        except InvalidAuth:
            return "pairing_needed"
        except (CannotConnect, ConnectionClosed) as e:
            _LOGGER.error(f"Connection failed: {e}")
            return "error"

    async def connect_and_send(self, ip: str, command: str, is_text: bool = False, is_app: bool = False) -> bool:
        status = await self.connect(ip)
        if status != "connected":
            return False
        
        remote = await self.get_remote(ip)
        try:
            if is_app:
                # Latest library handles the prefix automatically
                remote.send_launch_app_command(command)
            elif is_text:
                # Native send_text is now available in v0.3.1+
                remote.send_text(command)
            else:
                remote.send_key_command(command)
            return True
        except Exception as e:
            _LOGGER.error(f"Failed to send command: {e}")
            return False

    def disconnect_all(self):
        for remote in self.active_remotes.values():
            remote.disconnect()
        self.active_remotes = {}
        self.connected_ips = set()

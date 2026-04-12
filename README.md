# Google TV Web Remote

A sleek, premium web interface to control your Android TV / Google TV devices.

## Features
- **Device Discovery**: Automatically find compatible TVs on your network.
- **Secure Pairing**: Easy PIN-based pairing.
- **Premium UI**: Glassmorphic design with custom app shortcuts (YouTube, Jellyfin, etc.).
- **Keyboard Input**: Type directly from your computer to the TV.

## Docker Setup (Recommended)

Running in Docker is the easiest way to get the remote up and running. 

### Prerequisites
- Docker installed on your host machine.
- Your computer and TV must be on the same local network.

### 1. Build the image locally
```bash
docker build -t google-tv-remote .
```

### 2. Run the container
> [!IMPORTANT]
> Because the application relies on **mDNS/Zeroconf** for TV discovery, you must use `--network host` mode. Without this, the app will not be able to find any devices on your network.

```bash
docker run -d \
  --name google-tv-remote \
  --network host \
  -v $(pwd)/certs:/app/certs \
  google-tv-remote
```

* `-v $(pwd)/certs:/app/certs`: This ensures your pairing certificates are saved on your computer, so you don't have to re-pair the TV if you restart the container.

### 3. Open the UI
Go to `http://localhost:8504` (or your NAS IP) in your web browser.

### Troubleshooting (Connection Refused)
If the app is running but you cannot reach the UI from your browser:
- Ensure your host firewall allows traffic on port 8504:
  ```bash
  sudo ufw allow 8504/tcp
  ```
- If using Bridge mode, ensure the port mapping is explicitly set to `8504:8504`.

---

## GitHub Container Registry (GHCR)

Alternatively, you can pull the image if you've published it to GHCR:

```bash
docker pull ghcr.io/awaisrafiq410/google-tv-remote:latest
```

## Local Development (Without Docker)

1. **Install Dependencies**:
   ```bash
   py -3.12 -m pip install -r requirements.txt
   ```

2. **Run Server**:
   ```bash
   py -3.12 main.py
   ```

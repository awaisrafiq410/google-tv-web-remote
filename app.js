let selectedIp = null;

// UI Elements
const setupCard = document.getElementById('setup-card');
const remoteCard = document.getElementById('remote-card');
const deviceList = document.getElementById('device-list');
const refreshBtn = document.getElementById('refresh-btn');
const noDevices = document.getElementById('no-devices');
const pairingOverlay = document.getElementById('pairing-overlay');
const pinInput = document.getElementById('pin-input');
const submitPinBtn = document.getElementById('submit-pin');
const keyboardInput = document.getElementById('keyboard-input');

if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// Discovery
async function discoverDevices() {
    noDevices.textContent = "Scanning...";
    deviceList.querySelectorAll('.device-item').forEach(el => el.remove());
    
    try {
        const response = await fetch('/discover');
        const tvs = await response.json();
        
        if (tvs.length === 0) {
            noDevices.textContent = "No TVs found on your network.";
            noDevices.classList.remove('hidden');
        } else {
            noDevices.classList.add('hidden');
            tvs.forEach(tv => {
                const li = document.createElement('li');
                li.className = 'device-item';
                li.innerHTML = `
                    <div class="device-info">
                        <h3>${tv.name}</h3>
                        <p>${tv.ip}</p>
                    </div>
                    <span>Connect</span>
                `;
                li.onclick = () => handleConnect(tv.ip);
                deviceList.appendChild(li);
            });
            lucide.createIcons();
        }
    } catch (err) {
        console.error("Discovery failed", err);
        noDevices.textContent = "Error scanning for devices.";
    }
}

async function handleConnect(ip) {
    selectedIp = ip;
    try {
        const response = await fetch('/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const result = await response.json();
        
        if (result.status === 'connected') {
            setupCard.classList.add('hidden');
            remoteCard.classList.remove('hidden');
        } else if (result.status === 'pairing_needed') {
            initiatePairing(ip);
        } else {
            alert("Connection error. Ensure your TV is on and reachable.");
        }
    } catch (err) {
        console.error("Connect failed", err);
    }
}

// Pairing
async function initiatePairing(ip) {
    selectedIp = ip;
    try {
        const response = await fetch('/pair/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip })
        });
        const result = await response.json();
        pairingOverlay.classList.remove('hidden');
    } catch (err) {
        alert("Failed to start pairing: " + err);
    }
}

async function finishPairing() {
    const code = pinInput.value;
    if (!code) return;
    
    try {
        const response = await fetch('/pair/finish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: selectedIp, code })
        });
        
        if (response.ok) {
            pairingOverlay.classList.add('hidden');
            setupCard.classList.add('hidden');
            remoteCard.classList.remove('hidden');
        } else {
            const err = await response.json();
            alert("Pairing failed: " + err.detail);
        }
    } catch (err) {
        alert("Error finishing pairing: " + err);
    }
}

// Commands
async function sendCommand(command, options = {}) {
    if (!selectedIp) return;
    
    try {
        await fetch('/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ip: selectedIp,
                command: command,
                ...options
            })
        });
    } catch (err) {
        console.error("Command failed", err);
    }
}

// Event Listeners
refreshBtn.onclick = discoverDevices;

submitPinBtn.onclick = finishPairing;

document.getElementById('cancel-pairing').onclick = () => {
    pairingOverlay.classList.add('hidden');
};

// Remote Buttons
document.querySelectorAll('[data-command]').forEach(btn => {
    btn.onclick = () => sendCommand(btn.dataset.command);
});

// App Launchers
document.querySelectorAll('[data-app]').forEach(btn => {
    btn.onclick = () => sendCommand(btn.dataset.app, { is_app: true });
});

// Keyboard Input
keyboardInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
        const text = keyboardInput.value;
        if (text) {
            sendCommand(text, { is_text: true });
            keyboardInput.value = '';
        }
    }
};

// Initial Scan
discoverDevices();

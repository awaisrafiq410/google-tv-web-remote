// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('SW Registered', reg))
            .catch(err => console.error('SW Registration Failed', err));
    });
}

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
    localStorage.setItem('last_tv_ip', ip);
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
// Handle remote buttons with repeat support
let repeatInterval = null;

function startRepeat(cmd) {
    if (repeatInterval) return;
    sendCommand(cmd);
    repeatInterval = setInterval(() => sendCommand(cmd), 250);
}

function stopRepeat() {
    if (repeatInterval) {
        clearInterval(repeatInterval);
        repeatInterval = null;
    }
}

document.querySelectorAll('.btn-remote, .btn-nav, .btn-media, .btn-dpad').forEach(btn => {
    const cmd = btn.dataset.command;
    if (!cmd) return;

    btn.addEventListener('mousedown', () => startRepeat(cmd));
    btn.addEventListener('mouseup', stopRepeat);
    btn.addEventListener('mouseleave', stopRepeat);
    
    // Touch support
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRepeat(cmd);
    });
    btn.addEventListener('touchend', stopRepeat);
});

// Voice Search (Mic) Implementation
const micBtn = document.getElementById('mic-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition && micBtn) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    let isRecording = false;

    recognition.onstart = function() {
        isRecording = true;
        micBtn.classList.add('mic-active');
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
            // Send the transcribed text to the TV
            sendCommand(transcript, { is_text: true });
        }
    };

    recognition.onerror = function(event) {
        console.error('Speech recognition error: ' + event.error);
        micBtn.classList.remove('mic-active');
        isRecording = false;
    };

    recognition.onend = function() {
        micBtn.classList.remove('mic-active');
        isRecording = false;
    };

    micBtn.onclick = () => {
        if (isRecording) {
            recognition.stop();
        } else {
            // Trigger TV's search/assistant overlay first, then start listening on browser
            sendCommand('SEARCH'); 
            try {
                recognition.start();
            } catch (e) {
                console.error('Failed to start recognition:', e);
            }
        }
    };
} else if (micBtn) {
    micBtn.onclick = () => alert('Voice search is not supported in this browser. Try Chrome/Safari.');
}

// Keyboard mapping
const KEY_MAP = {
    'ArrowUp': 'DPAD_UP',
    'ArrowDown': 'DPAD_DOWN',
    'ArrowLeft': 'DPAD_LEFT',
    'ArrowRight': 'DPAD_RIGHT',
    'Enter': 'DPAD_CENTER',
    'Escape': 'BACK',
    'Backspace': 'BACK',
    'Home': 'HOME',
    ' ': 'MEDIA_PLAY_PAUSE',
    'm': 'MUTE',
    'M': 'MUTE'
};

document.addEventListener('keydown', (e) => {
    // If user is typing in the input, don't trigger remote shortcuts
    if (e.target.tagName === 'INPUT') {
        if (e.key === 'Enter') {
            const text = e.target.value;
            if (text) {
                sendCommand(text, { is_text: true });
                e.target.value = '';
            }
        }
        return;
    }

    const command = KEY_MAP[e.key];
    if (command) {
        e.preventDefault();
        sendCommand(command);
    }
});

// App Management Logic
const PERMANENT_APPS = [
    { name: 'YouTube', pkg: 'https://www.youtube.com', icon: '/assets/youtube.png', permanent: true },
    { name: 'Jellyfin', pkg: 'org.jellyfin.androidtv', icon: '/assets/jellyfin.png', permanent: true },
    { name: 'YT Music', pkg: 'com.google.android.youtube.tvmusic', icon: '/assets/yt_music.png', permanent: true }
];

const INITIAL_CUSTOM_APPS = [
    { name: 'Netmirror', pkg: 'app.netmirror.newtv', icon: '/assets/netmirror.png', permanent: false },
    { name: 'Stremio', pkg: 'com.stremio.one', icon: '/assets/stremio.png', permanent: false },
    { name: 'On Stream', pkg: 'com.maertsno.tv', icon: '/assets/onstrem.png', permanent: false }
];

if (!localStorage.getItem('apps_initiated')) {
    localStorage.setItem('custom_apps', JSON.stringify(INITIAL_CUSTOM_APPS));
    localStorage.setItem('apps_initiated', 'true');
}

let customApps = JSON.parse(localStorage.getItem('custom_apps') || '[]');

function getAllApps() {
    return [...PERMANENT_APPS, ...customApps];
}

function renderApps() {
    const container = document.getElementById('apps-container');
    const manageList = document.getElementById('manage-apps-list');
    
    if(!container || !manageList) return;

    container.innerHTML = '';
    manageList.innerHTML = '';
    
    const allApps = getAllApps();
    
    allApps.forEach((app) => {
        // Render main grid button
        const btn = document.createElement('button');
        btn.className = 'app-btn';
        btn.dataset.app = app.pkg;
        btn.innerHTML = `
            <img src="${app.icon}" alt="${app.name}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'white\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><rect x=\\'2\\' y=\\'2\\' width=\\'20\\' height=\\'20\\' rx=\\'5\\' ry=\\'5\\'/></svg>'">
            ${app.name}
        `;
        btn.onclick = () => sendCommand(app.pkg, { is_app: true });
        container.appendChild(btn);
        
        // Render manage list item
        const item = document.createElement('div');
        item.className = 'manage-app-item';
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${app.icon}" style="width: 24px; height: 24px; border-radius: 6px;" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'white\\' stroke-width=\\'2\\'><rect x=\\'2\\' y=\\'2\\' width=\\'20\\' height=\\'20\\' rx=\\'5\\'/></svg>'">
                <span style="font-size: 0.875rem;">${app.name}</span>
            </div>
            <button class="btn-delete" ${app.permanent ? 'disabled title="Cannot delete permanent app"' : `title="Delete ${app.name}"`} onclick="deleteApp('${app.pkg}')">
                <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
            </button>
        `;
        manageList.appendChild(item);
    });
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Make deleteApp globally accessible for the onclick attribute
window.deleteApp = function(pkg) {
    const allApps = getAllApps();
    const appToDelete = allApps.find(a => a.pkg === pkg);
    if (!appToDelete || appToDelete.permanent) return;
    
    customApps = customApps.filter(a => a.pkg !== pkg);
    localStorage.setItem('custom_apps', JSON.stringify(customApps));
    renderApps();
};

document.getElementById('add-app-btn').onclick = () => {
    const name = document.getElementById('new-app-name').value.trim();
    const pkg = document.getElementById('new-app-pkg').value.trim();
    const icon = document.getElementById('new-app-icon').value.trim();
    
    if (!name || !pkg || !icon) {
        alert("Please fill in all fields (Name, Package, and Icon URL) to add a new app.");
        return;
    }
    
    if (getAllApps().some(a => a.pkg === pkg)) {
        alert("An app with this package name or URL already exists.");
        return;
    }
    
    customApps.push({ name, pkg, icon, permanent: false });
    localStorage.setItem('custom_apps', JSON.stringify(customApps));
    
    document.getElementById('new-app-name').value = '';
    document.getElementById('new-app-pkg').value = '';
    document.getElementById('new-app-icon').value = '';
    
    renderApps();
};

document.getElementById('open-manage-apps').onclick = () => {
    document.getElementById('manage-apps-overlay').classList.remove('hidden');
};

document.getElementById('close-manage-apps').onclick = () => {
    document.getElementById('manage-apps-overlay').classList.add('hidden');
};

// Initial Render
renderApps();

// Tab Switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('tab-disabled')) return;
        
        const tabId = btn.dataset.tab;
        
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
    });
});

// Settings / Switch Device
document.getElementById('settings-btn').onclick = () => {
    selectedIp = null;
    localStorage.removeItem('last_tv_ip');
    remoteCard.classList.add('hidden');
    setupCard.classList.remove('hidden');
    discoverDevices();
};

// Auto-Connect on load
window.addEventListener('load', () => {
    const savedIp = localStorage.getItem('last_tv_ip');
    if (savedIp) {
        console.log("Auto-connecting to:", savedIp);
        handleConnect(savedIp);
    } else {
        discoverDevices();
    }
});

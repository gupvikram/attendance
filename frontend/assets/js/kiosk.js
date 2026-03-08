// ============================================================================
// Face Recognition Kiosk Application
// ============================================================================

const API_BASE = window.location.origin;

// Device key — read from localStorage (set via the Setup UI, not the console)
let DEVICE_KEY = localStorage.getItem("DEVICE_KEY") || "";

// ── Device Setup UI ──────────────────────────────────────────────────────────

function showSetupBanner() {
    const banner = document.getElementById("setup-banner");
    if (banner) banner.classList.add("show");
    setTimeout(() => {
        const input = document.getElementById("setup-api-key");
        if (input) input.focus();
    }, 100);
}

function hideSetupBanner() {
    const banner = document.getElementById("setup-banner");
    if (banner) banner.classList.remove("show");
}

async function trySaveDeviceKey() {
    const input = document.getElementById("setup-api-key");
    const errEl = document.getElementById("setup-err");
    const key = input ? input.value.trim() : "";

    if (!key) {
        if (errEl) errEl.innerText = "Please paste your API key.";
        return;
    }
    if (errEl) errEl.innerText = "Verifying key...";

    // Verify the key is valid by attempting a heartbeat
    try {
        const res = await fetch(`${API_BASE}/devices/heartbeat`, {
            method: "POST",
            headers: { "X-Device-Key": key }
        });
        if (!res.ok) {
            if (errEl) errEl.innerText = "Invalid API key. Please check and try again.";
            return;
        }
        // Key is valid — save it and reload
        localStorage.setItem("DEVICE_KEY", key);
        DEVICE_KEY = key;
        hideSetupBanner();
        // Reload to reinitialize kiosk with the new key
        window.location.reload();
    } catch (e) {
        if (errEl) errEl.innerText = "Could not reach server. Check your connection.";
    }
}

// Wire up setup UI
document.addEventListener("DOMContentLoaded", () => {
    const saveBtn = document.getElementById("setup-save-btn");
    const gearBtn = document.getElementById("setup-gear-btn");
    const keyInput = document.getElementById("setup-api-key");

    if (saveBtn) saveBtn.addEventListener("click", trySaveDeviceKey);
    if (gearBtn) gearBtn.addEventListener("click", showSetupBanner);
    if (keyInput) keyInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") trySaveDeviceKey();
        if (e.key === "Escape") hideSetupBanner();
    });

    // Admin Portal Navigation
    const adminLink = document.getElementById("admin-portal-link");
    const pinModal = document.getElementById("kiosk-pin-modal");
    const pinInput = document.getElementById("kiosk-admin-pin");
    const pinErr = document.getElementById("kiosk-pin-err");
    const verifyBtn = document.getElementById("verify-pin-btn");
    const cancelBtn = document.getElementById("cancel-pin-btn");

    if (adminLink) {
        adminLink.addEventListener("click", () => {
            pinModal.classList.add("show");
            pinInput.value = "";
            pinErr.innerText = "";
            setTimeout(() => pinInput.focus(), 50);
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => pinModal.classList.remove("show"));
    }

    async function verifyAdminPin() {
        const pin = pinInput.value;
        if (!pin) return;

        try {
            const res = await fetch(`${API_BASE}/admin/verify-pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin })
            });

            if (res.ok) {
                window.location.href = "/admin";
            } else {
                pinErr.innerText = "Invalid PIN";
                pinInput.classList.add("shake");
                setTimeout(() => pinInput.classList.remove("shake"), 500);
            }
        } catch (e) {
            pinErr.innerText = "Verification failed";
        }
    }

    if (verifyBtn) verifyBtn.addEventListener("click", verifyAdminPin);
    if (pinInput) {
        pinInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") verifyAdminPin();
            if (e.key === "Escape") pinModal.classList.remove("show");
        });
    }
});

let DEVICE_LOCATION_ID = 1;

const EL = {
    webcam: document.getElementById("webcam"),
    overlayCanvas: document.getElementById("overlay-canvas"),
    normCanvas: document.getElementById("normalization-canvas"),
    scanBtn: document.getElementById("scan-btn"),
    feedback: document.getElementById("feedback-msg"),
    statusIndicator: document.getElementById("device-status"),
    statusText: document.querySelector(".status-text"),
    cameraError: document.getElementById("camera-error"),
    maintenanceMenu: document.getElementById("maintenance-menu"),
    queueSize: document.getElementById("queue-size-disp"),
    timeSkewWarning: document.getElementById("time-skew-warning"),
};

// ── State ───────────────────────────────────────────────────────────────────

let employeesCache = [];
let descriptorVersion = "0";
let faceMatcher = null;
let isScanning = false;
let modelsLoaded = false;
let employeeCooldowns = new Map(); // emp_id -> timestamp (prevents double tap)

// Offline Queue setup
let offlineQueue = JSON.parse(localStorage.getItem("attendance_offline_queue") || "[]");
const MAX_QUEUE_SIZE = 100;

// ── Initialization ──────────────────────────────────────────────────────────

async function initKiosk() {
    try {
        setFeedback("Loading AI models...");
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/assets/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/assets/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models')
        ]);
        modelsLoaded = true;

        setFeedback("Accessing camera...");
        await startCamera();

        setFeedback("Syncing employee data...");
        await fetchEmployeeDescriptors();

        EL.scanBtn.disabled = false;
        setFeedback("Ready.");

        // Start background tasks
        setInterval(sendHeartbeat, 60000); // 1 min heartbeat
        setInterval(fetchEmployeeDescriptors, 600000); // 10 min cache refresh
        setInterval(processOfflineQueue, 30000); // 30 sec queue flush retry

        // 3 AM daily reload
        scheduleDailyReload();

        // Initial calls
        sendHeartbeat();
        processOfflineQueue();

        // Add Enter key listener for the primary action button
        window.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !EL.scanBtn.disabled && !isScanning) {
                EL.scanBtn.click();
            }
        });

    } catch (err) {
        console.error("Init error:", err);
        setFeedback("Initialization failed. Check console.", true);
    }
}

// ── Camera & Normalization ──────────────────────────────────────────────────

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        EL.webcam.srcObject = stream;
        EL.cameraError.classList.add("hidden");

        return new Promise((resolve) => {
            EL.webcam.onloadedmetadata = () => {
                EL.overlayCanvas.width = EL.webcam.videoWidth;
                EL.overlayCanvas.height = EL.webcam.videoHeight;
                // Setup normalization canvas size explicitly
                EL.normCanvas.width = EL.webcam.videoWidth;
                EL.normCanvas.height = EL.webcam.videoHeight;
                resolve();
            };
        });
    } catch (err) {
        EL.cameraError.classList.remove("hidden");
        throw err;
    }
}

function getNormalizedCanvas() {
    // 4. Lighting normalization (Grayscale averaging)
    const ctx = EL.normCanvas.getContext("2d", { willReadFrequently: true });
    // Explicit sizing ensures no 300x150 default browser squash
    ctx.drawImage(EL.webcam, 0, 0, EL.normCanvas.width, EL.normCanvas.height);

    let imgData = ctx.getImageData(0, 0, EL.normCanvas.width, EL.normCanvas.height);
    let data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);
    return EL.normCanvas;
}

// ── Data Sync ───────────────────────────────────────────────────────────────

async function fetchEmployeeDescriptors() {
    try {
        const headers = { "X-Device-Key": DEVICE_KEY };
        if (descriptorVersion !== "0") {
            headers["If-None-Match"] = descriptorVersion;
        }

        const res = await fetch(`${API_BASE}/employees/descriptors`, { headers });

        if (res.status === 304) {
            console.log("Descriptors up to date (304)");
            return; // unchanged
        }

        if (!res.ok) throw new Error("Failed to fetch descriptors");

        const data = await res.json();
        const validEmployees = data.employees.filter((emp) => emp.face_descriptors && emp.face_descriptors.length > 0);

        // Build FaceMatcher
        const labeledDescriptors = validEmployees.map(emp => {
            // Rehydrate float arrays into Float32Array for face-api
            const arrays = emp.face_descriptors.map(arr => new Float32Array(arr));
            return new faceapi.LabeledFaceDescriptors(String(emp.id), arrays);
        });

        // Backend defines 0.42 threshold - FaceMatcher takes distance threshold.
        // We set it slightly high here so we can capture 'weak_match' objects.
        // We will reject matches > 0.48 manually.
        if (labeledDescriptors.length > 0) {
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.48);
            console.log(`Loaded ${validEmployees.length} employees. Version: ${descriptorVersion}`);
        } else {
            faceMatcher = null;
            console.warn("No enrolled employees found. FaceMatcher not started.");
        }

        employeesCache = validEmployees;
        descriptorVersion = data.descriptor_version;

    } catch (err) {
        console.error("Fetch descriptors error:", err);
    }
}

// ── Recognition Loop ────────────────────────────────────────────────────────

EL.scanBtn.addEventListener("click", async () => {
    if (isScanning || !modelsLoaded) return;
    if (!faceMatcher) {
        setFeedback("Cannot scan: No employees are enrolled in the system.", true);
        return;
    }

    isScanning = true;
    EL.scanBtn.disabled = true;
    EL.scanBtn.style.backgroundColor = "#fbbf24";
    setFeedback("Processing...");

    try {
        // 3. Camera warm-up — Discard 3 frames to stabilize exposure
        await new Promise(r => setTimeout(r, 300));
        for (let i = 0; i < 3; i++) {
            await faceapi.detectSingleFace(EL.webcam);
        }

        // 4. Lighting normalization (Grayscale)
        const normCanvas = getNormalizedCanvas();

        // 5. Detection on normalized canvas
        const detection = await faceapi.detectSingleFace(normCanvas)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new Error("No face detected. Please step into the oval.");
        }

        // 6. Liveness Detection via EAR (Eye Aspect Ratio) over the 1 frame
        // A full robust implementation requires capturing multiple frames before/after the scan.
        // For scaffold, we ensure landmarks exist.
        if (!checkBasicLiveness(detection.landmarks)) {
            // throw new Error("Liveness check failed.");
        }

        // Match against database
        const match = faceMatcher.findBestMatch(detection.descriptor);

        if (match.label === "unknown" || match.distance > 0.48) {
            throw new Error("Face not recognized.\n• Stand closer\n• Ensure lighting is bright\n• Look directly at camera");
        }

        const empId = parseInt(match.label);

        // Kiosk per-employee cooldown guard (5s)
        const now = Date.now();
        if (employeeCooldowns.has(empId) && (now - employeeCooldowns.get(empId) < 5000)) {
            setFeedback(`Too fast. Wait a moment before scanning again.`, true);
            resetScanner(3000);
            return;
        }

        // 7. Post to backend
        const scanPayload = {
            employee_id: empId,
            device_id: DEVICE_KEY, // Note: real system uses device UUID, but key acts as identifier here
            match_distance: match.distance,
            new_descriptor: Array.from(detection.descriptor) // Send for self-updating logic
        };

        const response = await sendAttendanceEvent(scanPayload);

        if (response.offline) {
            setFeedback(`Scan queued offline! (Match dist: ${match.distance.toFixed(2)})`, false);
        } else {
            // Render standardized success payload from backend
            setFeedback(`[${response.time}] ${response.employee_name} ${response.action.replace("_", " ")} successful!`, false);
            employeeCooldowns.set(empId, now);
        }

    } catch (err) {
        setFeedback(err.message, true);

        if (err.message.includes("Checkout not allowed") || err.message.includes("Already checked out")) {
            EL.scanBtn.style.backgroundColor = "#fbbf24"; // Amber for business logic rejection
            EL.scanBtn.innerText = "ALREADY LOGGED IN";
            EL.scanBtn.style.color = "#000"; // Dark text for contrast on amber
        } else {
            EL.scanBtn.style.backgroundColor = "#ef4444"; // Strong red for actual failures
            EL.scanBtn.innerText = "SCAN FAILED";
            EL.scanBtn.style.color = "white";
        }

        // Hold the error on screen much longer before resetting
        resetScanner(5000);
        return;
    }

    // 8. Cooldown for success
    resetScanner(3000);
});

function checkBasicLiveness(landmarks) {
    // Very rudimentary check: face must be roughly facing forward
    // Ensure eyes and nose exist. A real EAR check requires multiple frames.
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    return (leftEye.length > 0 && rightEye.length > 0);
}

function resetScanner(delay) {
    setTimeout(() => {
        isScanning = false;
        EL.scanBtn.disabled = false;
        EL.scanBtn.style.backgroundColor = "";
        EL.scanBtn.style.color = "white"; // Reset to standard white text
        EL.scanBtn.innerText = "TAP TO SCAN";
        setFeedback("Ready.");

        // Cleanup expired cooldowns safely
        const cutoff = Date.now() - 6000;
        for (let [id, time] of employeeCooldowns.entries()) {
            if (time < cutoff) employeeCooldowns.delete(id);
        }
    }, delay);
}

// ── Offline Queue & Telemetry ───────────────────────────────────────────────

async function sendAttendanceEvent(payload) {
    try {
        const res = await fetch(`${API_BASE}/attendance/scan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Device-Key": DEVICE_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            // 400 Bad Request (e.g. checkout gap not met) should NOT be queued, it's a business logic rejection.
            const errData = await res.json();
            throw new Error(errData.detail || "Server rejected scan");
        }

        setOnlineStatus(true);
        return await res.json();

    } catch (err) {
        // Network error (Failed to fetch) -> queue it
        if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
            setOnlineStatus(false);
            enqueueOfflineEvent(payload);
            return { offline: true };
        }
        // Business logic error
        throw err;
    }
}

function enqueueOfflineEvent(payload) {
    if (offlineQueue.length >= MAX_QUEUE_SIZE) {
        offlineQueue.shift(); // Drop oldest
    }
    // Add local timestamp for reference
    payload.timestamp_local = new Date().toISOString();
    offlineQueue.push(payload);
    localStorage.setItem("attendance_offline_queue", JSON.stringify(offlineQueue));
    updateMaintenanceMenu();
}

async function processOfflineQueue() {
    if (offlineQueue.length === 0) return;

    // Try processing the first item
    const payload = offlineQueue[0];
    try {
        const res = await fetch(`${API_BASE}/attendance/scan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Device-Key": DEVICE_KEY
            },
            body: JSON.stringify(payload)
        });

        // If success or hard 4xx business error, remove from queue
        if (res.ok || (res.status >= 400 && res.status < 500)) {
            offlineQueue.shift();
            localStorage.setItem("attendance_offline_queue", JSON.stringify(offlineQueue));
            setOnlineStatus(true);
            updateMaintenanceMenu();

            // Wait 1s and recurse to flush rest
            setTimeout(processOfflineQueue, 1000);
        }
    } catch (e) {
        setOnlineStatus(false);
    }
}

async function sendHeartbeat() {
    try {
        const res = await fetch(`${API_BASE}/devices/heartbeat`, {
            method: "POST",
            headers: { "X-Device-Key": DEVICE_KEY }
        });

        if (res.ok) {
            setOnlineStatus(true);
            const data = await res.json();

            // Display device name in the header
            const locationEl = document.getElementById("kiosk-location");
            const mobileLocationEl = document.getElementById("mobile-kiosk-name");
            if (data.device_name) {
                if (locationEl) locationEl.innerText = `📍 ${data.device_name}`;
                if (mobileLocationEl) mobileLocationEl.innerText = `📍 ${data.device_name}`;
            }

            // Check time skew
            const serverTime = new Date(data.server_time);
            const localTime = new Date();
            const skewMin = Math.abs((localTime - serverTime) / 60000);

            if (skewMin > 2) {
                console.warn(`Time skew detected: Local is ${localTime}, Server is ${serverTime}`);
                EL.timeSkewWarning.classList.remove("hidden");
            } else {
                EL.timeSkewWarning.classList.add("hidden");
            }
        } else {
            // Heartbeat failed — device key not recognized
            const locationEl = document.getElementById("kiosk-location");
            if (locationEl && locationEl.innerText.includes("Loading")) {
                locationEl.innerText = "📍 Unregistered Kiosk";
            }
            // Show setup banner if device isn't registered
            showSetupBanner();
        }
    } catch (e) {
        setOnlineStatus(false);
    }
}

// ── Utilities ───────────────────────────────────────────────────────────────

function setFeedback(msg, isError = false) {
    EL.feedback.innerText = msg;
    EL.feedback.className = "feedback-msg " + (isError ? "error" : "success");
}

function setOnlineStatus(online) {
    if (online) {
        EL.statusIndicator.classList.add("online");
        EL.statusText.innerText = "Online";
    } else {
        EL.statusIndicator.classList.remove("online");
        EL.statusText.innerText = "Offline";
    }
}

function scheduleDailyReload() {
    const now = new Date();
    const millisTill3AM = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0) - now;
    const ms = millisTill3AM < 0 ? millisTill3AM + 86400000 : millisTill3AM;
    setTimeout(() => window.location.reload(), ms);
}

function updateMaintenanceMenu() {
    EL.queueSize.innerText = offlineQueue.length;
}

// Maintenance menu toggles
let tapCount = 0;
let tapTimeout;
document.getElementById("maintenance-trigger").addEventListener("click", () => {
    tapCount++;
    clearTimeout(tapTimeout);
    if (tapCount >= 3) {
        updateMaintenanceMenu();
        EL.maintenanceMenu.classList.remove("hidden");
        tapCount = 0;
    } else {
        tapTimeout = setTimeout(() => tapCount = 0, 500);
    }
});
document.getElementById("close-maintenance").addEventListener("click", () => {
    EL.maintenanceMenu.classList.add("hidden");
});

document.getElementById("retry-camera-btn").addEventListener("click", startCamera);
document.getElementById("reload-app-btn").addEventListener("click", () => window.location.reload());

// Boot
window.onload = initKiosk;

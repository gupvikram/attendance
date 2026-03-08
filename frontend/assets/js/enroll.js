// ============================================================================
// Face Enrollment App
// ============================================================================

const API_BASE = window.location.origin;

// Simulate Admin auth token
const ADMIN_TOKEN = localStorage.getItem("ADMIN_TOKEN") || null;

async function apiFetch(endpoint, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ADMIN_TOKEN}`,
        ...(options.headers || {})
    };
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "API Error");
    }
    return await res.json();
}

const EL = {
    select: document.getElementById("employee-select"),
    webcam: document.getElementById("webcam"),
    captureBtn: document.getElementById("capture-btn"),
    feedback: document.getElementById("feedback"),
    hiddenCanvas: document.getElementById("hidden-canvas"),
    instText: document.getElementById("inst-text"),
    steps: document.querySelectorAll(".step")
};

let capturedDescriptors = [];
let capturedThumbnailUrl = null;
let isProcessing = false;

const CAPTURE_STAGES = [
    { name: "Front", desc: "Look straight into the camera with a neutral expression." },
    { name: "Left", desc: "Turn your head slightly to the LEFT." },
    { name: "Right", desc: "Turn your head slightly to the RIGHT." },
    { name: "Up/Down", desc: "Tilt your head slightly up or down." },
    { name: "Smile", desc: "Look straight and smile." }
];

async function init() {
    setMsg("Loading AI models...");
    try {
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/assets/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/assets/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/assets/models')
        ]);

        setMsg("Starting camera...", false);
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        });
        EL.webcam.srcObject = stream;

        // Ensure hidden canvas matches video resolution
        EL.webcam.onloadedmetadata = () => {
            EL.hiddenCanvas.width = EL.webcam.videoWidth;
            EL.hiddenCanvas.height = EL.webcam.videoHeight;
        };

        await loadEmployees();

        EL.captureBtn.disabled = true; // Wait until employee selected
        // Add Enter key listener for the primary action button
        window.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (!EL.captureBtn.disabled) {
                    EL.captureBtn.click();
                } else if (!EL.select.value) {
                    // Highlight the select if form is blank and they hit enter
                    EL.select.classList.add("error-field", "shake");
                    setMsg("Please select an employee first!", true);
                    setTimeout(() => EL.select.classList.remove("shake"), 500);
                }
            }
        });

        // Reset error state on change
        EL.select.addEventListener("change", () => {
            EL.select.classList.remove("error-field");
            resetProcess();
        });

        setMsg("Ready. Select employee to begin.", false);

    } catch (err) {
        setMsg(`Initialization failed: ${err.message}`, true);
    }
}

async function loadEmployees() {
    try {
        const employees = await apiFetch("/employees");

        EL.select.innerHTML = '<option value="" disabled selected>Select employee...</option>';
        employees.forEach(emp => {
            // Only list active
            if (emp.active) {
                const opt = document.createElement("option");
                opt.value = emp.id;
                opt.textContent = emp.name;
                EL.select.appendChild(opt);
            }
        });
    } catch (err) {
        setMsg("Failed to load employees", true);
    }
}

function resetProcess() {
    capturedDescriptors = [];
    capturedThumbnailUrl = null;
    updateUIForStage(0);
    EL.captureBtn.disabled = !EL.select.value;
    setMsg("", false);
}

function updateUIForStage(index) {
    if (index >= 5) {
        EL.instText.innerText = "All frames captured. Ready to save.";
        EL.captureBtn.innerText = "Save Enrollment";
        EL.steps.forEach(s => { s.classList.remove("active"); s.classList.add("done"); });
        return;
    }

    EL.instText.innerText = CAPTURE_STAGES[index].desc;
    EL.captureBtn.innerText = `Capture Frame ${index + 1} (${CAPTURE_STAGES[index].name})`;

    EL.steps.forEach((s, i) => {
        s.className = "step";
        if (i < index) s.classList.add("done");
        if (i === index) s.classList.add("active");
    });
}

function getNormalizedCanvas() {
    const ctx = EL.hiddenCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(EL.webcam, 0, 0, EL.hiddenCanvas.width, EL.hiddenCanvas.height);

    let imgData = ctx.getImageData(0, 0, EL.hiddenCanvas.width, EL.hiddenCanvas.height);
    let data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);
    return EL.hiddenCanvas;
}

// Very basic Euclidean distance implementation for JS QA check
function euclideanDist(a, b) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
}

EL.captureBtn.addEventListener("click", async () => {
    if (isProcessing) return;
    isProcessing = true;
    EL.captureBtn.disabled = true;

    try {
        if (capturedDescriptors.length === 5) {
            // Submit to backend
            await submitEnrollment();
            return;
        }

        setMsg("Analyzing...", false);

        // 1. Lighting normalization
        const normCanvas = getNormalizedCanvas();

        // 2. Extact face
        const detection = await faceapi.detectSingleFace(normCanvas)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new Error("No face detected. Please position yourself in the oval and ensure bright lighting.");
        }

        // Extract thumbnail on first capture
        if (capturedDescriptors.length === 0) {
            // Crop face bounding box for a simple base64 thumbnail
            const box = detection.detection.box;
            const faceCanvas = document.createElement("canvas");
            faceCanvas.width = box.width;
            faceCanvas.height = box.height;
            faceCanvas.getContext("2d").putImageData(
                normCanvas.getContext("2d").getImageData(box.x, box.y, box.width, box.height), 0, 0
            );
            // In a real app we'd upload this file. As scaffold, we'll store a mock URL path.
            capturedThumbnailUrl = `/static/thumbnails/employee_${EL.select.value}_${Date.now()}.jpg`;
        }

        // Store standard JS Array of the Float32Array
        capturedDescriptors.push(Array.from(detection.descriptor));

        updateUIForStage(capturedDescriptors.length);
        setMsg("Frame captured successfully!", false);

    } catch (err) {
        setMsg(err.message, true);
    } finally {
        isProcessing = false;
        EL.captureBtn.disabled = false;
    }
});

async function submitEnrollment() {
    setMsg("Saving to database...", false);

    // Calculate average pairwise distance to measure "enrollment_quality"
    // Lower is better. < 0.20 GOOD, 0.20-0.30 FAIR, > 0.30 POOR
    let totalDist = 0;
    let pairs = 0;
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 5; j++) {
            totalDist += euclideanDist(capturedDescriptors[i], capturedDescriptors[j]);
            pairs++;
        }
    }
    const avgQuality = totalDist / pairs;

    const payload = {
        face_descriptors: capturedDescriptors,
        face_thumbnail: capturedThumbnailUrl,
        enrollment_quality: parseFloat(avgQuality.toFixed(3))
    };

    try {
        const empId = EL.select.value;
        await apiFetch(`/employees/${empId}/enroll`, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        setMsg("Enrollment successful!", false);
        EL.captureBtn.style.display = "none";

        // Reload selection in 2 secs
        setTimeout(() => {
            window.location.reload();
        }, 3000);

    } catch (err) {
        setMsg(err.message, true);
        isProcessing = false;
        EL.captureBtn.disabled = false;
    }
}

function setMsg(msg, isError) {
    EL.feedback.innerText = msg;
    EL.feedback.className = "msg " + (isError ? "error" : "success");
}

window.onload = init;

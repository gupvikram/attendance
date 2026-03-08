// ============================================================================
// Admin Dashboard Logic
// ============================================================================

const API_BASE = window.location.origin;
let ADMIN_TOKEN = localStorage.getItem("ADMIN_TOKEN") || null;

const EL = {
    loginModal: document.getElementById("login-modal"),
    appContent: document.getElementById("app-content"),
    pinInput: document.getElementById("admin-pin"),
    loginBtn: document.getElementById("login-btn"),
    loginMsg: document.getElementById("login-msg"),
    navLinks: document.querySelectorAll(".nav-links li"),
    tabPanes: document.querySelectorAll(".tab-pane"),
    attDateFilter: document.getElementById("att-date-filter"),

    // Metric Cards
    cards: {
        total: document.getElementById("card-total-employees"),
        present: document.getElementById("card-present"),
        absent: document.getElementById("card-absent"),
        inout: document.getElementById("card-in-out"),
        locations: document.getElementById("card-locations")
    },

    // Details Modal
    detailsModal: document.getElementById("details-modal"),
    detailsTitle: document.getElementById("details-title"),
    detailsThead: document.getElementById("details-thead"),
    detailsTbody: document.getElementById("details-tbody"),
    closeDetailsBtn: document.getElementById("close-details-modal"),

    // New Modals
    editAttModal: document.getElementById("edit-attendance-modal"),
    devModal: document.getElementById("device-modal"),
    shiftModal: document.getElementById("shift-modal"),
    editShiftModal: document.getElementById("edit-shift-modal")
};

// Data Caching for Details Modal
let cachedEmployees = [];
let cachedAttendance = [];
let cachedDevices = [];

// ── Auth & Init ─────────────────────────────────────────────────────────────

function init() {
    // Basic PIN auth (in real app, use proper JWT/session)
    if (ADMIN_TOKEN) {
        showApp();
    } else {
        EL.loginModal.classList.remove("hidden");
    }

    EL.loginBtn.addEventListener("click", () => {
        login();
    });

    EL.pinInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            login();
        }
    });

    async function login() {
        const pinEl = document.getElementById("admin-pin");
        const pin = pinEl.value;
        try {
            const res = await fetch(`${API_BASE}/admin/verify-pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin })
            });
            if (res.ok) {
                ADMIN_TOKEN = "admin_verified";
                localStorage.setItem("ADMIN_TOKEN", ADMIN_TOKEN);
                showApp();
            } else {
                throw new Error("Invalid PIN");
            }
        } catch (err) {
            pinEl.style.borderColor = "var(--danger)";
            pinEl.classList.add("shake");
            setTimeout(() => pinEl.classList.remove("shake"), 500);
            EL.loginMsg.classList.remove("hidden");
        }
    }

    // Add Escape key listener to close modals
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const empModal = document.getElementById("employee-modal");
            if (!empModal.classList.contains("hidden")) {
                empModal.classList.add("hidden");
            }
            if (!EL.detailsModal.classList.contains("hidden")) {
                EL.detailsModal.classList.add("hidden");
            }
            [EL.editAttModal, EL.devModal, EL.shiftModal, EL.editShiftModal].forEach(m => {
                if (m && !m.classList.contains("hidden")) m.classList.add("hidden");
            });
        }
    });

    // Metric Cards Click Listeners
    EL.cards.total.addEventListener("click", () => showMetricDetails("total"));
    EL.cards.present.addEventListener("click", () => showMetricDetails("present"));
    EL.cards.absent.addEventListener("click", () => showMetricDetails("absent"));
    EL.cards.inout.addEventListener("click", () => showMetricDetails("inout"));
    EL.cards.locations.addEventListener("click", () => showMetricDetails("locations"));

    // Close Details Modal
    EL.closeDetailsBtn.addEventListener("click", () => {
        EL.detailsModal.classList.add("hidden");
    });

    // Tab Switching
    EL.navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            const tabName = e.target.closest("li").dataset.tab;
            switchTab(tabName);
        });
    });

    // Default dates
    const today = new Date().toISOString().split('T')[0];
    EL.attDateFilter.value = today;
    document.getElementById("report-month").value = today.slice(0, 7);

    // Event listeners
    EL.attDateFilter.addEventListener("change", loadAttendance);
    document.getElementById("download-report-btn").addEventListener("click", downloadReport);

    // Add Enter key listeners
    EL.attDateFilter.addEventListener("keydown", (e) => {
        if (e.key === "Enter") loadAttendance();
    });
    document.getElementById("report-month").addEventListener("keydown", (e) => {
        if (e.key === "Enter") downloadReport();
    });
}

function showApp() {
    EL.loginModal.classList.add("hidden");
    EL.appContent.classList.remove("hidden");
    loadOverview();
}

function switchTab(tabName) {
    EL.navLinks.forEach(l => l.classList.remove("active"));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    EL.tabPanes.forEach(p => p.classList.add("hidden"));
    document.getElementById(`tab-${tabName}`).classList.remove("hidden");

    // Load data based on tab
    if (tabName === "overview") loadOverview();
    if (tabName === "attendance") loadAttendance();
    if (tabName === "employees") loadEmployees();
    if (tabName === "devices") loadDevices();
    if (tabName === "shifts") loadShifts();
    if (tabName === "settings") {
        // Clear status message
        document.getElementById("pin-status-msg").classList.add("hidden");
    }
}

// Global modal close helpers
function setupModalClose(modalId, closeBtnId) {
    const modal = document.getElementById(modalId);
    const btn = document.getElementById(closeBtnId);
    if (modal && btn) {
        btn.addEventListener("click", () => modal.classList.add("hidden"));
    }
}

// ── Data Fetching & Rendering (Mocks/Basic API calls) ───────────────────────

async function apiFetch(endpoint, options = {}) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ADMIN_TOKEN}`
        };
        const res = await fetch(`${API_BASE}${endpoint}`, { headers, ...options });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "API Error");
        }
        return await res.json();
    } catch (e) {
        console.error("Fetch error on", endpoint, e);
        throw e;
    }
}

async function loadOverview() {
    document.getElementById("overview-date").innerText = new Date().toDateString();

    try {
        // Fetch all required data concurrently for the summary metrics
        const todayStr = new Date().toISOString().split('T')[0];
        const [employees, devices, attendance] = await Promise.all([
            apiFetch("/employees").catch(() => []),
            apiFetch("/devices").catch(() => []),
            apiFetch(`/attendance?date=${todayStr}`).catch(() => [])
        ]);

        // Cache for details modal
        cachedEmployees = employees;
        cachedDevices = devices;
        cachedAttendance = attendance;

        const totalEmployees = employees.filter(e => e.active).length;
        const activeLocations = devices.filter(d => d.status === 'online').length;

        // Compute daily attendance stats
        const presentRecords = attendance.filter(a => a.status !== 'absent');
        const presentCount = presentRecords.length;
        const absentCount = totalEmployees - presentCount;

        let checkins = 0;
        let checkouts = 0;
        presentRecords.forEach(r => {
            if (r.check_in_time) checkins++;
            if (r.check_out_time) checkouts++;
        });

        // Inject into DOM
        const elEmp = document.getElementById("metric-employees");
        const elPres = document.getElementById("metric-present");
        const elAbs = document.getElementById("metric-absent");
        const elInOut = document.getElementById("metric-in-out");
        const elLoc = document.getElementById("metric-locations");

        if (elEmp) elEmp.innerText = totalEmployees;
        if (elPres) elPres.innerText = presentCount;
        if (elAbs) elAbs.innerText = absentCount > 0 ? absentCount : 0;
        if (elInOut) elInOut.innerText = `${checkins} / ${checkouts}`;
        if (elLoc) elLoc.innerText = activeLocations;

        // Render device cards
        const grid = document.getElementById("device-status-grid");
        if (grid) grid.innerHTML = "";

        // Mock device if DB empty for UI demonstration
        const mockDevices = devices.length ? devices : [
            { name: "Showroom Kiosk", status: "online", last_heartbeat: new Date().toISOString() },
            { name: "Workshop App", status: "offline", last_heartbeat: new Date(Date.now() - 3600000).toISOString() }
        ];

        mockDevices.forEach(dev => {
            const isOnline = dev.status === "online";
            // Calculate basic uptime string (e.g. 9h 22m)
            const uptime = isOnline ? "Uptime today: 4h 12m" : "Offline for 1h";

            grid.innerHTML += `
            <div class="device-card ${!isOnline ? 'offline' : ''}">
                <div class="device-info">
                    <h4>${dev.name}</h4>
                    <p>Last heartbeat: ${new Date(dev.last_heartbeat).toLocaleTimeString()}</p>
                    <p><strong>${uptime}</strong></p>
                </div>
                <div class="status-indicator ${isOnline ? 'online' : ''}">
                    <span class="dot" style="background:${isOnline ? '#22c55e' : '#ef4444'}; width:12px; height:12px; border-radius:50%; display:inline-block;"></span>
                    <span>${dev.status}</span>
                </div>
            </div>
        `;
        });

        // Fetch and populate Recent Scan Failures
        const failuresTbody = document.querySelector("#failures-table tbody");
        if (failuresTbody) {
            failuresTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
            try {
                const failures = await apiFetch("/reports/failures?limit=10");
                if (!failures || failures.length === 0) {
                    failuresTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No recent failures</td></tr>';
                } else {
                    failuresTbody.innerHTML = "";
                    failures.forEach(f => {
                        const timeStr = new Date(f.created_at).toLocaleString();
                        const empName = f.employee ? f.employee.name : f.employee_id;
                        const devName = f.device ? f.device.name : 'Unknown Device';
                        const distStr = f.match_distance ? f.match_distance.toFixed(3) : '-';

                        failuresTbody.innerHTML += `
                        <tr>
                            <td style="color:var(--text-muted); font-size: 0.9em;">${timeStr}</td>
                            <td>${devName}</td>
                            <td><strong>${empName}</strong></td>
                            <td><span class="badge bg-warning" style="color: #000; padding: 0.4rem 0.8rem;">${f.result}</span></td>
                            <td style="font-family: monospace;">${distStr}</td>
                        </tr>
                    `;
                    });
                }
            } catch (err) {
                failuresTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger);">Failed to load logs: ${err.message}</td></tr>`;
            }
        }
    } catch (err) {
        console.error("Failed to load overview data:", err);
    }
}

async function loadAttendance() {
    const date = EL.attDateFilter.value;
    const tbody = document.querySelector("#attendance-table tbody");
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    try {
        const data = await apiFetch(`/attendance?date=${date}`);

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No records found for this date</td></tr>';
            return;
        }

        tbody.innerHTML = "";
        data.forEach(record => {
            const checkInStr = record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
            const checkOutStr = record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
            const distanceStr = record.match_distance ? record.match_distance.toFixed(3) : "-";

            const badgeClass = record.status === 'present' ? 'bg-success' :
                record.status === 'late' ? 'bg-warning' :
                    record.status === 'missing_checkout' ? 'bg-danger' : 'bg-primary';

            tbody.innerHTML += `
                <tr>
                    <td><strong>${record.employee ? record.employee.name : 'Unknown User'}</strong></td>
                    <td><span class="badge ${badgeClass}">${record.status.replace('_', ' ').toUpperCase()}</span></td>
                    <td>${checkInStr}</td>
                    <td>${checkOutStr}</td>
                    <td>${distanceStr}</td>
                    <td>
                        <button class="btn btn-outline btn-sm edit-att" data-id="${record.id}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Edit Time</button>
                    </td>
                </tr>
            `;
        });

        // Add Edit handlers
        document.querySelectorAll(".edit-att").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.target.dataset.id;
                const record = data.find(r => r.id == id);
                if (record) {
                    document.getElementById("edit-att-id").value = id;
                    // Format times for <input type="time">
                    document.getElementById("edit-att-in").value = record.check_in_time ? new Date(record.check_in_time).toTimeString().slice(0, 5) : "";
                    document.getElementById("edit-att-out").value = record.check_out_time ? new Date(record.check_out_time).toTimeString().slice(0, 5) : "";
                    EL.editAttModal.classList.remove("hidden");
                }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Failed to load attendance: ${err.message}</td></tr>`;
    }
}

async function loadEmployees() {
    const tbody = document.querySelector("#employees-table tbody");
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

    try {
        const data = await apiFetch("/employees");

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">No employees found</td></tr>';
            return;
        }

        tbody.innerHTML = "";
        data.forEach(emp => {
            const quality = emp.enrollment_quality ?
                (emp.enrollment_quality < 0.2 ? "GOOD" : (emp.enrollment_quality < 0.3 ? "FAIR" : "POOR")) : "N/A";

            tbody.innerHTML += `
                <tr>
                    <td><strong>${emp.name}</strong></td>
                    <td>${emp.role || "-"}</td>
                    <td>${emp.shift_id || "-"}</td>
                    <td>${quality}</td>
                    <td>${emp.descriptor_last_updated_at ? new Date(emp.descriptor_last_updated_at).toLocaleDateString() : "-"}</td>
                    <td><span class="badge ${emp.active ? 'bg-success' : 'bg-danger'}">${emp.active ? 'Active' : 'Deactivated'}</span></td>
                    <td>
                        <button class="btn btn-outline btn-sm delete-emp" data-id="${emp.id}" style="color:red; border-color:red; padding: 0.2rem 0.5rem; font-size: 0.8rem;">Deactivate</button>
                    </td>
                </tr>
            `;
        });

        // Attach deactivate handlers
        document.querySelectorAll(".delete-emp").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                if (confirm("Are you sure you want to deactivate this employee?")) {
                    await apiFetch(`/employees/${id}`, { method: "DELETE" });
                    loadEmployees();
                }
            });
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error loading employees: ${err.message}</td></tr>`;
    }
}

// ── Modals & Add Employee Logic ──────────────────────────────────────────────

document.getElementById("add-employee-btn").addEventListener("click", () => {
    document.getElementById("emp-name").value = "";
    document.getElementById("emp-role").value = "";
    document.getElementById("emp-phone").value = "";
    document.getElementById("emp-name").style.borderColor = ""; // Reset validation
    document.getElementById("employee-modal").classList.remove("hidden");
    document.getElementById("emp-name").focus();
});

// Add Enter key listeners for all inputs in the modal
["emp-name", "emp-role", "emp-phone"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            saveEmployee();
        }
    });
});

document.getElementById("close-emp-modal").addEventListener("click", () => {
    document.getElementById("employee-modal").classList.add("hidden");
});

document.getElementById("save-emp-btn").addEventListener("click", saveEmployee);

async function saveEmployee() {
    const nameEl = document.getElementById("emp-name");
    const name = nameEl.value.trim();
    const role = document.getElementById("emp-role").value.trim();
    const phone = document.getElementById("emp-phone").value.trim();

    // Field highlight validation
    if (!name) {
        nameEl.style.borderColor = "var(--danger)";
        nameEl.classList.add("shake"); // Assuming we might add a shake animation
        setTimeout(() => nameEl.classList.remove("shake"), 500);
        return;
    } else {
        nameEl.style.borderColor = "";
    }

    try {
        const payload = { name };
        if (role) payload.role = role;
        if (phone) payload.phone = phone;

        await apiFetch("/employees", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        document.getElementById("employee-modal").classList.add("hidden");
        loadEmployees(); // Refresh list immediately
    } catch (err) {
        alert("Failed to add employee: " + err.message);
    }
}

async function loadDevices() {
    const tbody = document.querySelector("#devices-table tbody");
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    try {
        const data = await apiFetch("/devices");
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No devices registered</td></tr>';
            return;
        }
        tbody.innerHTML = "";
        data.forEach(dev => {
            const hb = dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleString() : "Never";
            tbody.innerHTML += `
                <tr>
                    <td><strong>${dev.name}</strong></td>
                    <td style="font-family:monospace; font-size:0.8rem;">${dev.api_key}</td>
                    <td><span class="badge ${dev.status === 'online' ? 'bg-success' : 'bg-danger'}">${dev.status.toUpperCase()}</span></td>
                    <td>${hb}</td>
                    <td>-</td>
                    <td>
                        <button class="btn btn-outline btn-sm delete-dev" data-id="${dev.id}" style="color:red; border-color:red; padding: 0.2rem 0.5rem; font-size: 0.8rem;">Remove</button>
                    </td>
                </tr>
            `;
        });

        // Attach Remove handlers
        document.querySelectorAll(".delete-dev").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                if (confirm("Remove this device? Any kiosk using its API key will stop working.")) {
                    try {
                        await apiFetch(`/devices/${id}`, { method: "DELETE" });
                        loadDevices();
                    } catch (err) {
                        alert("Failed to remove device: " + err.message);
                    }
                }
            });
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`;
    }
}

async function loadShifts() {
    const tbody = document.querySelector("#shifts-table tbody");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
    try {
        const data = await apiFetch("/shifts");
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No shifts configured</td></tr>';
            return;
        }
        tbody.innerHTML = "";
        data.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td><strong>${s.name}</strong></td>
                    <td>${s.start_time}</td>
                    <td>${s.grace_period_minutes || 0}m</td>
                    <td>${s.gap_lock_minutes || 0}m</td>
                    <td>
                        <button class="btn btn-outline btn-sm edit-shift"
                            data-id="${s.id}"
                            data-name="${s.name}"
                            data-start="${s.start_time}"
                            data-grace="${s.grace_period_minutes || 0}"
                            data-gap="${s.gap_lock_minutes || 0}"
                            style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">Edit</button>
                    </td>
                </tr>
            `;
        });

        // Attach edit handlers
        document.querySelectorAll(".edit-shift").forEach(btn => {
            btn.addEventListener("click", () => {
                document.getElementById("edit-shift-id").value = btn.dataset.id;
                document.getElementById("edit-shift-name").value = btn.dataset.name;
                document.getElementById("edit-shift-start").value = btn.dataset.start.slice(0, 5);
                document.getElementById("edit-shift-grace").value = btn.dataset.grace;
                document.getElementById("edit-shift-gap").value = btn.dataset.gap;
                EL.editShiftModal.classList.remove("hidden");
            });
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`;
    }
}

function downloadReport() {
    const month = document.getElementById("report-month").value;
    window.location.href = `${API_BASE}/reports/monthly/export?month=${month}`;
}

// ── Metric Details Pop-up logic ──────────────────────────────────────────────

function showMetricDetails(type) {
    let title = "";
    let head = "";
    let rows = "";

    if (type === "total") {
        title = "Total Active Employees";
        head = "<tr><th>Name</th><th>Role</th><th>Status</th></tr>";
        cachedEmployees.filter(e => e.active).forEach(e => {
            rows += `<tr><td><strong>${e.name}</strong></td><td>${e.role || '-'}</td><td><span class="badge bg-success">Active</span></td></tr>`;
        });
    } else if (type === "present") {
        title = "Present Today";
        head = "<tr><th>Name</th><th>Check In</th><th>Status</th></tr>";
        cachedAttendance.filter(a => a.status !== 'absent').forEach(a => {
            const timeStr = a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
            rows += `<tr><td><strong>${a.employee ? a.employee.name : 'Unknown'}</strong></td><td>${timeStr}</td><td><span class="badge bg-success">${a.status.toUpperCase()}</span></td></tr>`;
        });
    } else if (type === "absent") {
        title = "Absentees Today";
        head = "<tr><th>Name</th><th>Role</th><th>Status</th></tr>";
        // Employees who are NOT in the attendance list for today
        const presentIds = cachedAttendance.map(a => a.employee_id);
        cachedEmployees.filter(e => e.active && !presentIds.includes(e.id)).forEach(e => {
            rows += `<tr><td><strong>${e.name}</strong></td><td>${e.role || '-'}</td><td><span class="badge bg-danger">ABSENT</span></td></tr>`;
        });
    } else if (type === "inout") {
        title = "Check-in / Check-out Activities";
        head = "<tr><th>Name</th><th>Check In</th><th>Check Out</th></tr>";
        cachedAttendance.forEach(a => {
            const inTime = a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
            const outTime = a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
            rows += `<tr><td><strong>${a.employee ? a.employee.name : 'Unknown'}</strong></td><td>${inTime}</td><td>${outTime}</td></tr>`;
        });
    } else if (type === "locations") {
        title = "Active Kiosk Locations";
        head = "<tr><th>Device Name</th><th>Status</th><th>Last Heartbeat</th></tr>";
        cachedDevices.forEach(d => {
            const hb = d.last_heartbeat ? new Date(d.last_heartbeat).toLocaleTimeString() : 'Never';
            rows += `<tr><td><strong>${d.name}</strong></td><td><span class="badge ${d.status === 'online' ? 'bg-success' : 'bg-danger'}">${d.status.toUpperCase()}</span></td><td>${hb}</td></tr>`;
        });
    }

    EL.detailsTitle.innerText = title;
    EL.detailsThead.innerHTML = head;
    EL.detailsTbody.innerHTML = rows || '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No records to display</td></tr>';

    EL.detailsModal.classList.remove("hidden");
}

// ── New Functional Logic ───────────────────────────────────────────────────

// Edit Attendance
document.getElementById("save-edit-att-btn").addEventListener("click", async () => {
    const id = document.getElementById("edit-att-id").value;
    const checkIn = document.getElementById("edit-att-in").value;
    const checkOut = document.getElementById("edit-att-out").value;
    const date = EL.attDateFilter.value;

    try {
        const payload = {};
        if (checkIn) payload.check_in_time = `${date}T${checkIn}:00`;
        if (checkOut) payload.check_out_time = `${date}T${checkOut}:00`;

        await apiFetch(`/attendance/${id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
        EL.editAttModal.classList.add("hidden");
        loadAttendance();
    } catch (e) {
        alert("Update failed: " + e.message);
    }
});
setupModalClose("edit-attendance-modal", "close-edit-att-modal");
// Enter key for edit attendance
["edit-att-in", "edit-att-out"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("save-edit-att-btn").click();
    });
});

// Register Device
document.getElementById("add-device-btn").addEventListener("click", () => {
    document.getElementById("dev-name").value = "";
    EL.devModal.classList.remove("hidden");
    setTimeout(() => document.getElementById("dev-name").focus(), 50);
});
document.getElementById("save-dev-btn").addEventListener("click", async () => {
    const name = document.getElementById("dev-name").value.trim();
    if (!name) return;
    try {
        await apiFetch("/devices", {
            method: "POST",
            body: JSON.stringify({ name })
        });
        EL.devModal.classList.add("hidden");
        loadDevices();
    } catch (e) {
        alert("Failed to register device: " + e.message);
    }
});
setupModalClose("device-modal", "close-dev-modal");
// Enter key for device name
document.getElementById("dev-name").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("save-dev-btn").click();
});

// Add Shift
document.getElementById("add-shift-btn").addEventListener("click", () => {
    document.getElementById("shift-name").value = "";
    document.getElementById("shift-start").value = "09:00";
    EL.shiftModal.classList.remove("hidden");
});
document.getElementById("save-shift-btn").addEventListener("click", async () => {
    const name = document.getElementById("shift-name").value.trim();
    const start_time = document.getElementById("shift-start").value;
    const grace = parseInt(document.getElementById("shift-grace").value) || 0;
    const gap = parseInt(document.getElementById("shift-gap").value) || 0;

    if (!name || !start_time) return;
    try {
        await apiFetch("/shifts", {
            method: "POST",
            body: JSON.stringify({
                name,
                start_time,
                grace_period_minutes: grace,
                gap_lock_minutes: gap
            })
        });
        EL.shiftModal.classList.add("hidden");
        loadShifts();
    } catch (e) {
        alert("Failed to create shift: " + e.message);
    }
});
setupModalClose("shift-modal", "close-shift-modal");

// Edit Shift
document.getElementById("save-edit-shift-btn").addEventListener("click", async () => {
    const id = document.getElementById("edit-shift-id").value;
    const name = document.getElementById("edit-shift-name").value.trim();
    const start = document.getElementById("edit-shift-start").value;
    const grace = parseInt(document.getElementById("edit-shift-grace").value) || 0;
    const gap = parseInt(document.getElementById("edit-shift-gap").value) || 0;

    if (!name || !start) return;
    try {
        await apiFetch(`/shifts/${id}`, {
            method: "PUT",
            body: JSON.stringify({ name, start_time: start, grace_period_minutes: grace, gap_lock_minutes: gap })
        });
        EL.editShiftModal.classList.add("hidden");
        loadShifts();
    } catch (e) {
        alert("Failed to update shift: " + e.message);
    }
});
setupModalClose("edit-shift-modal", "close-edit-shift-modal");
// Enter key for edit shift fields
["edit-shift-name", "edit-shift-start", "edit-shift-grace", "edit-shift-gap"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("save-edit-shift-btn").click();
    });
});
// Enter key for add shift fields
["shift-name", "shift-start", "shift-grace", "shift-gap"].forEach(id => {
    document.getElementById(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") document.getElementById("save-shift-btn").click();
    });
});
// Update PIN
const updatePinBtn = document.getElementById("update-pin-btn");
if (updatePinBtn) {
    updatePinBtn.addEventListener("click", async () => {
        const currentPin = document.getElementById("current-pin").value;
        const newPin = document.getElementById("new-pin").value;
        const confirmPin = document.getElementById("confirm-pin").value;
        const statusMsg = document.getElementById("pin-status-msg");

        if (!currentPin || !newPin || !confirmPin) {
            statusMsg.innerText = "Please fill all fields";
            statusMsg.className = "feedback-msg error";
            statusMsg.classList.remove("hidden");
            return;
        }

        if (newPin !== confirmPin) {
            statusMsg.innerText = "New PINs do not match";
            statusMsg.className = "feedback-msg error";
            statusMsg.classList.remove("hidden");
            return;
        }

        try {
            await apiFetch("/admin/update-pin", {
                method: "POST",
                body: JSON.stringify({ current_pin: currentPin, new_pin: newPin })
            });
            statusMsg.innerText = "PIN updated successfully!";
            statusMsg.className = "feedback-msg success";
            statusMsg.classList.remove("hidden");
            // Clear fields
            document.getElementById("current-pin").value = "";
            document.getElementById("new-pin").value = "";
            document.getElementById("confirm-pin").value = "";
        } catch (e) {
            statusMsg.innerText = e.message;
            statusMsg.className = "feedback-msg error";
            statusMsg.classList.remove("hidden");
        }
    });
}

// Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("ADMIN_TOKEN");
        window.location.reload();
    });
}

window.onload = init;

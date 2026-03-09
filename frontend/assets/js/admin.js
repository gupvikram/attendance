// ============================================================================
// Admin Dashboard Logic
// ============================================================================

const API_BASE = window.location.origin;
let ADMIN_TOKEN = localStorage.getItem("ADMIN_TOKEN") || null;

const EL = {
    loginModal: document.getElementById("login-modal"),
    appContent: document.getElementById("app-content"),
    emailInput: document.getElementById("admin-email"),
    passwordInput: document.getElementById("admin-password"),
    loginBtn: document.getElementById("login-btn"),
    loginMsg: document.getElementById("login-msg"),
    successMsg: document.getElementById("success-msg"),
    authTitle: document.getElementById("auth-title"),
    passwordField: document.getElementById("password-field"),
    toggleResetBtn: document.getElementById("toggle-reset-btn"),


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
    editShiftModal: document.getElementById("edit-shift-modal"),

    // Platform Owner elements
    navPlatform: document.getElementById("nav-platform"),
    platformTbody: document.getElementById("platform-companies-tbody"),
    provModal: document.getElementById("provision-modal"),
    provNameInput: document.getElementById("prov-company-name"),
    provEmailInput: document.getElementById("prov-admin-email"),
    saveProvBtn: document.getElementById("save-provision-btn"),
    closeProvBtn: document.getElementById("close-provision-modal"),
    openProvBtn: document.getElementById("open-provision-modal"),

    // Password Update
    newPasswordInput: document.getElementById("new-password"),
    confirmPasswordInput: document.getElementById("confirm-password"),
    updatePasswordBtn: document.getElementById("update-password-btn"),
    passwordStatusMsg: document.getElementById("password-status-msg"),

    // Reset Admin Access
    resetModal: document.getElementById("reset-modal"),
    resetCompIdInput: document.getElementById("reset-company-id"),
    resetEmailInput: document.getElementById("reset-admin-email"),
    resetPassInput: document.getElementById("reset-admin-password"),
    closeResetBtn: document.getElementById("close-reset-modal"),
    saveResetBtn: document.getElementById("save-reset-btn"),
};

let CURRENT_USER_ROLE = localStorage.getItem("USER_ROLE") || null;

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

    let authMode = "login"; // login, signup, reset

    function setAuthMode(mode) {
        authMode = mode;
        EL.loginMsg.classList.add("hidden");
        EL.successMsg.classList.add("hidden");

        if (mode === "login") {
            EL.authTitle.innerText = "Admin Login";
            EL.passwordField.classList.remove("hidden");
            EL.loginBtn.innerText = "Login";
            EL.toggleResetBtn.classList.remove("hidden");
        } else if (mode === "reset") {
            EL.authTitle.innerText = "Reset Password";
            EL.passwordField.classList.add("hidden");
            EL.loginBtn.innerText = "Send Reset Link";
            EL.toggleResetBtn.classList.add("hidden");

            // Add a back to login button dynamically if needed, or just allow Esc
            // For now, reset password remains.
        }
    }

    EL.toggleResetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        setAuthMode("reset");
    });

    EL.loginBtn.addEventListener("click", () => {
        if (authMode === "login") login();
        else if (authMode === "reset") resetPassword();
    });

    const triggerAuth = (e) => {
        if (e.key === "Enter") {
            if (authMode === "login") login();
            else if (authMode === "reset") resetPassword();
        }
    };

    EL.passwordInput.addEventListener("keyup", triggerAuth);
    EL.emailInput.addEventListener("keyup", triggerAuth);

    async function login() {
        const email = EL.emailInput.value.trim();
        const password = EL.passwordInput.value;
        const btn = EL.loginBtn;

        if (!email || !password) {
            EL.loginMsg.innerText = "Email and password required";
            EL.loginMsg.classList.remove("hidden");
            return;
        }

        btn.classList.add("loading");
        btn.disabled = true;
        EL.loginMsg.classList.add("hidden");

        try {
            const res = await fetch(`${API_BASE}/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            if (res.ok) {
                const data = await res.json();
                ADMIN_TOKEN = data.access_token;
                CURRENT_USER_ROLE = data.role;
                localStorage.setItem("ADMIN_TOKEN", ADMIN_TOKEN);
                localStorage.setItem("USER_ROLE", CURRENT_USER_ROLE);
                if (data.company_name) {
                    localStorage.setItem("COMPANY_NAME", data.company_name);
                }
                if (data.email) localStorage.setItem("USER_EMAIL", data.email);
                if (data.full_name) localStorage.setItem("USER_FULLNAME", data.full_name);
                showApp("overview");
            } else {
                const err = await res.json();
                throw new Error(err.detail || "Invalid credentials");
            }
        } catch (err) {
            EL.passwordInput.style.borderColor = "var(--danger)";
            EL.passwordInput.classList.add("shake");
            setTimeout(() => EL.passwordInput.classList.remove("shake"), 500);
            EL.loginMsg.innerText = err.message || "Login failed";
            EL.loginMsg.classList.remove("hidden");
        } finally {
            btn.classList.remove("loading");
            btn.disabled = false;
        }
    }

    async function resetPassword() {
        const email = EL.emailInput.value.trim();
        const btn = EL.loginBtn;

        if (!email) {
            EL.loginMsg.innerText = "Email is required";
            EL.loginMsg.classList.remove("hidden");
            return;
        }

        btn.classList.add("loading");
        btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/admin/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            if (res.ok) {
                EL.successMsg.innerText = "Reset link sent to your email!";
                EL.successMsg.classList.remove("hidden");
            } else {
                const err = await res.json();
                throw new Error(err.detail || "Failed to send reset link");
            }
        } catch (err) {
            EL.loginMsg.innerText = err.message;
            EL.loginMsg.classList.remove("hidden");
        } finally {
            btn.classList.remove("loading");
            btn.disabled = false;
        }
    }

    EL.openProvBtn.addEventListener("click", () => EL.provModal.classList.remove("hidden"));
    EL.closeProvBtn.addEventListener("click", () => EL.provModal.classList.add("hidden"));
    EL.saveProvBtn.addEventListener("click", provisionCompany);

    EL.closeResetBtn.addEventListener("click", () => EL.resetModal.classList.add("hidden"));
    EL.saveResetBtn.addEventListener("click", resetAdminAccess);

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

function showApp(forceTab = null) {
    EL.loginModal.classList.add("hidden");
    if (EL.appContent) EL.appContent.classList.remove("hidden");

    // Display company name in sidebar
    const companyName = localStorage.getItem("COMPANY_NAME");
    const companyDisp = document.getElementById("display-company-name");

    if (companyDisp) {
        if (CURRENT_USER_ROLE === 'super_admin') {
            companyDisp.innerText = "Platform Management";
            document.title = "Platform Management - Super Admin";
        } else if (companyName) {
            companyDisp.innerText = companyName;
            document.title = `${companyName} - Admin Dashboard`;
        }
    }

    // Display user profile in sidebar
    const userEmail = localStorage.getItem("USER_EMAIL");
    const userFullName = localStorage.getItem("USER_FULLNAME");
    const profileNameEl = document.getElementById("sidebar-user-name");
    const profileEmailEl = document.getElementById("sidebar-user-email");
    const profileInitialEl = document.getElementById("sidebar-user-initial");

    if (userFullName) {
        if (profileNameEl) profileNameEl.innerText = userFullName;
        if (profileInitialEl) profileInitialEl.innerText = userFullName.charAt(0).toUpperCase();
    } else {
        if (profileNameEl) profileNameEl.innerText = CURRENT_USER_ROLE === 'super_admin' ? 'Super Admin' : 'Admin';
        if (profileInitialEl) profileInitialEl.innerText = 'A';
    }
    if (userEmail && profileEmailEl) {
        profileEmailEl.innerText = userEmail;
    }

    // Show/Hide Platform tab based on role
    if (CURRENT_USER_ROLE === 'super_admin') {
        EL.navPlatform.classList.remove("hidden");
    } else {
        EL.navPlatform.classList.add("hidden");
    }

    loadOverview();
    startClock();

    // URL param wins, then session memory, then fallback
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = forceTab || urlParams.get('tab') || sessionStorage.getItem("admin_active_tab") || "overview";

    switchTab(targetTab);
}

function startClock() {
    const clockEl = document.getElementById("live-clock");
    if (!clockEl) return;

    function updateClock() {
        const now = new Date();
        const opts = {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        clockEl.innerText = now.toLocaleString(undefined, opts);
    }

    updateClock();
    setInterval(updateClock, 1000);

    // Bind Password Update
    if (EL.updatePasswordBtn) {
        EL.updatePasswordBtn.addEventListener("click", updatePassword);
    }
}

async function updatePassword() {
    const newPassword = EL.newPasswordInput.value;
    const confirm = EL.confirmPasswordInput.value;

    if (!newPassword || newPassword.length < 6) {
        showStatus(EL.passwordStatusMsg, "Password must be at least 6 characters.", false);
        return;
    }
    if (newPassword !== confirm) {
        showStatus(EL.passwordStatusMsg, "Passwords do not match.", false);
        return;
    }

    try {
        await apiFetch("/admin/update-password", {
            method: "POST",
            body: JSON.stringify({ new_password: newPassword })
        });
        showStatus(EL.passwordStatusMsg, "Password updated successfully!", true);
        EL.newPasswordInput.value = "";
        EL.confirmPasswordInput.value = "";
    } catch (e) {
        showStatus(EL.passwordStatusMsg, "Failed to update password: " + e.message, false);
    }
}

function showStatus(el, msg, isSuccess) {
    if (!el) return;
    el.innerText = msg;
    el.classList.remove("hidden", "error", "success");
    el.classList.add(isSuccess ? "success" : "error");
    setTimeout(() => {
        el.classList.add("hidden");
    }, 5000);
}

function switchTab(tabName) {
    if (tabName === "platform" && CURRENT_USER_ROLE !== 'super_admin') return;

    EL.navLinks.forEach(l => l.classList.remove("active"));
    const targetLink = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetLink) targetLink.classList.add("active");

    EL.tabPanes.forEach(p => p.classList.add("hidden"));
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.remove("hidden");

    // Load data based on tab
    if (tabName === "overview") loadOverview();
    if (tabName === "attendance") loadAttendance();
    if (tabName === "employees") loadEmployees();
    if (tabName === "devices") loadDevices();
    if (tabName === "shifts") loadShifts();
    if (tabName === "platform") loadPlatformCompanies();
    if (tabName === "reports") loadReports();
    // Clear status message if entering settings
    if (tabName === "settings") {
        const statusMsg = document.getElementById("pin-status-msg");
        if (statusMsg) statusMsg.classList.add("hidden");
    }

    // Persist tab within session
    sessionStorage.setItem("admin_active_tab", tabName);

    // Sync URL with tab state (without refreshing page)
    const newUrl = tabName === "overview"
        ? window.location.pathname
        : `${window.location.pathname}?tab=${tabName}`;
    window.history.replaceState({ tab: tabName }, "", newUrl);
}
window.switchTab = switchTab;

// Global modal close helpers
function setupModalClose(modalId, closeBtnId) {
    const modal = document.getElementById(modalId);
    const btn = document.getElementById(closeBtnId);
    if (modal && btn) {
        btn.addEventListener("click", () => modal.classList.add("hidden"));
    }
}

// ── Data Fetching & Rendering (Real API calls) ──────────────────────────────

async function apiFetch(endpoint, options = {}) {
    try {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${ADMIN_TOKEN}`,
            ...(options.headers || {})
        };

        const finalOptions = {
            ...options,
            headers
        };

        const res = await fetch(`${API_BASE}${endpoint}`, finalOptions);
        if (!res.ok) {
            if (res.status === 401) {
                // Token expired or invalid
                localStorage.removeItem("ADMIN_TOKEN");
                window.location.reload();
            }
            const err = await res.json();
            let msg = err.detail || "API Error";

            // If it's a Pydantic validation error list, extract readable text
            if (Array.isArray(msg)) {
                msg = msg.map(m => {
                    // Try to make it non-technical
                    if (m.msg.includes("valid email address")) return "Please enter a valid email address.";
                    return m.msg;
                }).join(" ");
            }

            throw new Error(msg);
        }
        return await res.json();
    } catch (e) {
        console.error("Fetch error on", endpoint, e);
        throw e;
    }
}

async function loadOverview() {
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

        // Count UNIQUE employees present today (since multiple checkins create multiple rows)
        const presentEmployeeIds = new Set(presentRecords.map(a => a.employee_id));
        const presentCount = presentEmployeeIds.size;

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
        if (grid) {
            grid.innerHTML = "";
            if (devices.length === 0) {
                grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 2rem; background: var(--surface); border-radius: 12px; border: 1px dashed var(--border);">
                    <p style="color: var(--text-muted);">No devices registered for this company.</p>
                </div>`;
            } else {
                devices.forEach(dev => {
                    const isOnline = dev.status === "online";
                    const lastSeen = dev.last_heartbeat ? new Date(dev.last_heartbeat).toLocaleTimeString() : "Never";

                    grid.innerHTML += `
                    <div class="device-card ${!isOnline ? 'offline' : ''}">
                        <div class="device-info">
                            <h4>${dev.name}</h4>
                            <p>Last heartbeat: ${lastSeen}</p>
                        </div>
                        <div class="status-indicator ${isOnline ? 'online' : ''}">
                            <span class="dot" style="background:${isOnline ? '#22c55e' : '#ef4444'}; width:12px; height:12px; border-radius:50%; display:inline-block;"></span>
                            <span style="font-size: 0.85rem; font-weight: 600; color: ${isOnline ? '#22c55e' : '#ef4444'}">${isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                        </div>
                    </div>`;
                });
            }
        }

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
                        const timeStr = f.timestamp ? new Date(f.timestamp).toLocaleString() : '-';
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';

    try {
        const data = await apiFetch("/employees");

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">No employees found</td></tr>';
            return;
        }

        tbody.innerHTML = "";
        data.forEach(emp => {
            const enrollmentStatus = emp.face_descriptors ? "Enrolled" : "Not Enrolled";

            tbody.innerHTML += `
                <tr>
                    <td><strong>${emp.name}</strong></td>
                    <td>${emp.role || "-"}</td>
                    <td>${emp.shift_id || "-"}</td>
                    <td>${enrollmentStatus}</td>
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" class="toggle-emp-status" data-id="${emp.id}" ${emp.active ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                </tr>
            `;
        });

        // Attach status toggle handlers
        document.querySelectorAll(".toggle-emp-status").forEach(toggle => {
            toggle.addEventListener("change", async (e) => {
                const id = e.target.dataset.id;
                const newStatus = e.target.checked;
                try {
                    await apiFetch(`/employees/${id}`, {
                        method: "PUT",
                        body: JSON.stringify({ active: newStatus })
                    });
                } catch (err) {
                    alert("Failed to update status: " + err.message);
                    e.target.checked = !newStatus; // Revert visually on error
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
                    <td>
                        <label class="toggle-switch">
                            <input type="checkbox" class="toggle-dev-status" data-id="${dev.id}" ${dev.active !== false ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </td>
                    <td>
                        <button class="btn btn-outline btn-sm delete-dev" data-id="${dev.id}" style="color:red; border-color:red; padding: 0.2rem 0.5rem; font-size: 0.8rem;">Remove</button>
                    </td>
                </tr>
            `;
        });

        // Attach status toggle handlers
        document.querySelectorAll(".toggle-dev-status").forEach(toggle => {
            toggle.addEventListener("change", async (e) => {
                const id = e.target.dataset.id;
                const newStatus = e.target.checked;
                try {
                    await apiFetch(`/devices/${id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ active: newStatus })
                    });
                } catch (err) {
                    alert("Failed to update status: " + err.message);
                    e.target.checked = !newStatus; // Revert visually on error
                }
            });
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

// ── Reports & Heatmap Logic ────────────────────────────────────────────────

async function loadReports() {
    const select = document.getElementById("report-employee-select");
    if (select.options.length <= 1) {
        try {
            const employees = await apiFetch("/employees");
            // Populate dropdown
            employees.forEach(emp => {
                const opt = document.createElement("option");
                opt.value = emp.id;
                opt.textContent = emp.name;
                const entryDate = emp.enrolled_at || emp.created_at;
                if (entryDate) {
                    opt.dataset.created = entryDate.split('T')[0];
                }
                opt.dataset.enrolled = emp.enrolled_at ? "true" : "false";
                select.appendChild(opt);
            });
        } catch (e) {
            console.error("Failed to load employees for report", e);
        }
    }
}

document.getElementById("view-heatmap-btn").addEventListener("click", () => renderHeatmap());

async function renderHeatmap(offsetMonths = 0) {
    const selectEl = document.getElementById("report-employee-select");
    const empId = selectEl.value;
    const monthInput = document.getElementById("report-month");

    if (!empId || !monthInput.value) {
        alert("Please select both an initial month and an employee.");
        return;
    }

    // Apply offset if navigating
    if (offsetMonths !== 0) {
        const [y, m] = monthInput.value.split('-');
        let date = new Date(parseInt(y), parseInt(m) - 1 + offsetMonths, 1);
        monthInput.value = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    const month = monthInput.value;
    const container = document.getElementById("heatmap-container");
    const grid = document.getElementById("calendar-grid");
    const title = document.getElementById("heatmap-title");

    const selectedOption = selectEl.options[selectEl.selectedIndex];
    // IMPORTANT FIX: Parse the employee creation date correctly. 
    // If it's undefined, default to a very old date.
    let createdDateStr = "2000-01-01";
    if (selectedOption && selectedOption.dataset.created) {
        createdDateStr = selectedOption.dataset.created;
    }

    const isEnrolled = selectedOption && selectedOption.dataset.enrolled === "true";

    const btn = document.getElementById("view-heatmap-btn");
    btn.disabled = true;
    btn.innerText = "Loading...";

    try {
        const data = await apiFetch(`/reports/employee/${empId}/calendar?month=${month}`);

        // Render Calendar
        container.classList.remove("hidden");

        // Update Title to show the current month being viewed
        const [yStr, mStr] = month.split('-');
        const y = parseInt(yStr);
        const m = parseInt(mStr);
        const monthName = new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        title.innerHTML = `
            <div style="display:flex; align-items:center; gap: 1rem;">
                <button onclick="renderHeatmap(-1)" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 1rem;">&larr;</button>
                <span style="font-size: 1.2rem; font-weight: 600;">${monthName}</span>
                <button onclick="renderHeatmap(1)" class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 1rem;">&rarr;</button>
            </div>
        `;

        // Clear old cells (keep the 7 headers)
        while (grid.children.length > 7) {
            grid.removeChild(grid.lastChild);
        }

        const daysInMonth = new Date(y, m, 0).getDate();
        const firstDayOfWeek = new Date(y, m - 1, 1).getDay(); // 0 (Sun) to 6 (Sat)

        // Empty slots for start of month
        for (let i = 0; i < firstDayOfWeek; i++) {
            const empty = document.createElement("div");
            grid.appendChild(empty);
        }

        const todayStr = new Date().toISOString().split('T')[0];

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const dayData = data[dateStr] || { hours: 0, status: 'absent' };
            const hrs = dayData.hours;
            const isBeforeHire = dateStr < createdDateStr;
            const isFuture = dateStr > todayStr;

            let bgColor = "#fecaca"; // < 2 hrs (light red)
            let textColor = "#991b1b";

            if (isBeforeHire || isFuture || !isEnrolled) {
                bgColor = "var(--bg-subtle)";
                textColor = "var(--text-muted)";
            } else if (hrs >= 8) {
                bgColor = "#166534"; // Dark Green
                textColor = "#ffffff";
            } else if (hrs >= 6) {
                bgColor = "#22c55e"; // Light Green
                textColor = "#ffffff";
            } else if (hrs >= 4) {
                bgColor = "#eab308"; // Yellow
                textColor = "#ffffff";
            } else if (hrs >= 2) {
                bgColor = "#f87171"; // Red
                textColor = "#ffffff";
            } else if (hrs === 0) {
                bgColor = "var(--bg-subtle)";
                textColor = "var(--text-muted)";
                // Outline if absent
                if (dayData.status === 'absent') {
                    bgColor = "#991b1b"; // Full Red
                    textColor = "#ffffff";
                } else if (dayData.status === 'missing_checkout') {
                    bgColor = "#9333ea"; // Purple
                    textColor = "#ffffff";
                }
            }

            const cell = document.createElement("div");
            cell.style.padding = "0.75rem 0.5rem";
            cell.style.borderRadius = "8px";
            cell.style.backgroundColor = bgColor;
            cell.style.color = textColor;
            cell.style.display = "flex";

            // Highlight Today
            if (dateStr === todayStr) {
                cell.style.outline = "3px solid var(--primary)";
                cell.style.outlineOffset = "2px";
                cell.style.boxShadow = "0 0 15px var(--primary-glow)";
            } else {
                cell.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
            }

            cell.style.flexDirection = "column";

            let labelText = '-';
            if (!isBeforeHire && !isFuture && isEnrolled) {
                if (hrs > 0) {
                    const h = Math.floor(hrs);
                    const m = Math.round((hrs - h) * 60);
                    labelText = `${h}h ${m}m`;
                } else if (dayData.status === 'absent') {
                    labelText = 'ABS';
                } else if (dayData.status === 'missing_checkout') {
                    labelText = 'NO OUT';
                }
            }

            cell.innerHTML = `
                <span style="font-size: 0.9rem; font-weight: 600; opacity: 0.9;">${d}</span>
                <span style="font-size: 0.75rem; font-weight: 500; margin-top: 0.2rem;">${labelText}</span>
            `;

            grid.appendChild(cell);
        }

    } catch (e) {
        alert("Failed to load heatmap: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerText = "View Heatmap";
    }
}

// Ensure renderHeatmap is globally accessible for the inline onclick handlers in the title
window.renderHeatmap = renderHeatmap;

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

// Logout
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("ADMIN_TOKEN");
        localStorage.removeItem("USER_ROLE");
        localStorage.removeItem("COMPANY_NAME");
        localStorage.removeItem("USER_EMAIL");
        localStorage.removeItem("USER_FULLNAME");
        window.location.reload();
    });
}

// ── Platform Management (Super Admin) ────────────────────────────────────────

async function loadPlatformCompanies() {
    if (CURRENT_USER_ROLE !== 'super_admin') return;

    try {
        const companies = await apiFetch("/admin/companies");
        if (!companies || companies.length === 0) {
            EL.platformTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8;">No companies found</td></tr>';
            return;
        }

        EL.platformTbody.innerHTML = companies.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td><span style="font-size: 0.9rem; color: var(--text-muted);">${c.admin_email || 'N/A'}</span></td>
                <td>${new Date(c.created_at).toLocaleDateString()}</td>
                <td>
                    <span class="status-tag ${c.is_active ? 'on_time' : 'absent'}">
                        ${c.is_active ? 'ACTIVE' : 'SUSPENDED'}
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" 
                            onclick="toggleCompanyStatus('${c.id}', ${!c.is_active})">
                            ${c.is_active ? 'Suspend' : 'Activate'}
                        </button>
                        <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; border-color: var(--primary);" 
                            onclick="openResetModal('${c.id}', '${c.name}')">
                            Reset Access
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (e) {
        console.error("Failed to load companies", e);
        EL.platformTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red;">Error: ${e.message}</td></tr>`;
    }
}

window.toggleCompanyStatus = async function (id, targetStatus) {
    if (!confirm(`Are you sure you want to ${targetStatus ? 'activate' : 'suspend'} this company?`)) return;
    try {
        await apiFetch("/admin/toggle-company", {
            method: "POST",
            body: JSON.stringify({ company_id: id, is_active: targetStatus })
        });
        loadPlatformCompanies();
    } catch (e) {
        alert("Action failed: " + e.message);
    }
};

async function provisionCompany() {
    const company_name = EL.provNameInput.value.trim();
    const email = EL.provEmailInput.value.trim();
    const btn = EL.saveProvBtn;

    if (!company_name || !email) {
        alert("Both company name and admin email are required.");
        return;
    }

    btn.classList.add("loading");
    btn.disabled = true;

    try {
        await apiFetch("/admin/provision", {
            method: "POST",
            body: JSON.stringify({ company_name, email })
        });
        EL.provModal.classList.add("hidden");
        EL.provNameInput.value = "";
        EL.provEmailInput.value = "";
        loadPlatformCompanies();
        alert("Provisioning successful! \n\nAccount created: " + email + "\nDefault Password: admin\n\nPlease share this with the client.");
    } catch (e) {
        alert("Provisioning failed: " + e.message);
    } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
    }
}

window.openResetModal = function (id, name) {
    EL.resetCompIdInput.value = id;
    EL.resetEmailInput.value = "";
    EL.resetPassInput.value = "";
    EL.resetModal.classList.remove("hidden");
};

async function resetAdminAccess() {
    const company_id = EL.resetCompIdInput.value;
    const new_email = EL.resetEmailInput.value.trim();
    const new_password = EL.resetPassInput.value;
    const btn = EL.saveResetBtn;

    if (!new_email && !new_password) {
        alert("Please enter a new email or a new password.");
        return;
    }

    btn.classList.add("loading");
    btn.disabled = true;

    try {
        await apiFetch("/admin/reset-admin", {
            method: "POST",
            body: JSON.stringify({
                company_id,
                new_email: new_email || null,
                new_password: new_password || null
            })
        });

        EL.resetModal.classList.add("hidden");
        alert("Admin access updated successfully!");
    } catch (e) {
        alert("Failed to reset access: " + e.message);
    } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
    }
}

window.onload = init;

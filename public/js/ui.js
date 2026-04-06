// Inject global modal styles
const style = document.createElement('style');
style.textContent = `
.custom-modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.7); z-index: 9999;
    display: flex; justify-content: center; align-items: center;
    opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
.custom-modal-overlay.active { opacity: 1; pointer-events: auto; }
.custom-modal {
    background: #1e293b; padding: 24px; border-radius: 12px;
    border: 1px solid #334155; width: 90%; max-width: 400px;
    color: #e2e8f0; transform: translateY(-20px); transition: transform 0.2s;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5); font-family: -apple-system, sans-serif;
}
.custom-modal-overlay.active .custom-modal { transform: translateY(0); }
.custom-modal-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; }
.custom-modal-body { font-size: 14px; margin-bottom: 24px; color: #94a3b8; line-height: 1.5; }
.custom-modal-btn-group { display: flex; justify-content: flex-end; gap: 12px; }
.custom-btn {
    padding: 8px 16px; border: none; border-radius: 6px; font-size: 14px;
    font-weight: 500; cursor: pointer; transition: background 0.15s;
}
.custom-btn-cancel { background: #334155; color: white; }
.custom-btn-cancel:hover { background: #475569; }
.custom-btn-confirm { background: #2563eb; color: white; }
.custom-btn-confirm:hover { background: #1d4ed8; }
.custom-btn-danger { background: #dc2626; color: white; }
.custom-btn-danger:hover { background: #b91c1c; }
`;
document.head.appendChild(style);

function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    document.body.appendChild(overlay);
    return overlay;
}

window.customAlert = function (message, title = "Notification") {
    return new Promise(resolve => {
        const overlay = createModalOverlay();
        overlay.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-title">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-btn-group">
                    <button class="custom-btn custom-btn-confirm" id="c-ok">OK</button>
                </div>
            </div>
        `;

        // trigger animation
        setTimeout(() => overlay.classList.add('active'), 10);

        function cleanup() {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
            resolve();
        }

        overlay.querySelector('#c-ok').onclick = cleanup;
    });
};

window.customConfirm = function (message, title = "Confirm Action", isDanger = false) {
    return new Promise(resolve => {
        const overlay = createModalOverlay();
        const confirmClass = isDanger ? 'custom-btn-danger' : 'custom-btn-confirm';
        overlay.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-title">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-btn-group">
                    <button class="custom-btn custom-btn-cancel" id="c-cancel">Cancel</button>
                    <button class="custom-btn ${confirmClass}" id="c-confirm">Confirm</button>
                </div>
            </div>
        `;

        setTimeout(() => overlay.classList.add('active'), 10);

        function cleanup(result) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        }

        overlay.querySelector('#c-cancel').onclick = () => cleanup(false);
        overlay.querySelector('#c-confirm').onclick = () => cleanup(true);
    });
};

// Intercept form submissions containing data-confirm
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    document.querySelectorAll("form[data-confirm]").forEach(form => {

        form.addEventListener("submit", async function (e) {
            e.preventDefault();
            const message = this.getAttribute("data-confirm");
            const isDanger = this.hasAttribute("data-danger");
            const title = isDanger ? "Warning" : "Confirm";

            const confirmed = await window.customConfirm(message, title, isDanger);
            if (confirmed) {
                // By bypassing our listener via the native submit method
                HTMLFormElement.prototype.submit.call(this);
            }
        });
    });
});

// Global static HTML modal logic
window.openModal = function (id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'block';
}

window.closeModal = function (id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

window.addEventListener('click', function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
});

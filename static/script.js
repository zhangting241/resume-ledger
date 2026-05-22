// ==================== 全局状态 ====================
let allData = [];

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    loadServerInfo();
    setupDropZones();
});

// ==================== 服务信息 ====================
async function loadServerInfo() {
    try {
        const resp = await fetch("/api/info");
        const info = await resp.json();
        if (info.public_url) {
            const bar = document.getElementById("shareBar");
            const input = document.getElementById("shareUrl");
            bar.style.display = "flex";
            input.value = info.public_url;
        }
    } catch (e) {
        // ngrok 未启用，忽略
    }
}

// ==================== 数据加载 ====================
async function loadData() {
    try {
        const resp = await fetch("/api/ledger");
        allData = await resp.json();
        renderTable(allData);
        updateStatus(true, `共 ${allData.length} 条记录`);
    } catch (e) {
        updateStatus(false, "连接失败");
    }
}

function updateStatus(ok, text) {
    const dot = document.getElementById("statusDot");
    const txt = document.getElementById("statusText");
    const count = document.getElementById("countText");
    dot.className = "status-dot " + (ok ? "online" : "offline");
    txt.textContent = text;
    count.textContent = `共 ${allData.length} 条记录`;
}

// ==================== 三分类拖拽上传 ====================
function setupDropZones() {
    const categories = ["star", "normal", "warn"];
    const body = document.body;

    // 全局阻止默认拖放
    ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
        body.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    categories.forEach(cat => {
        const zone = document.getElementById(`dropZone-${cat}`);
        if (!zone) return;
        const category = zone.dataset.category;
        const fileInput = zone.querySelector(".drop-file-input");
        const contentEl = zone.querySelector(".drop-zone-content");
        const progressEl = zone.querySelector(".upload-progress");
        const progressBar = zone.querySelector(".progress-bar-inner");
        const progressText = zone.querySelector(".progress-text");

        // 点击选择文件
        zone.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT") fileInput.click();
        });

        // 文件选择
        fileInput.addEventListener("change", () => {
            const files = Array.from(fileInput.files);
            if (files.length > 0) {
                uploadFiles(files, category, contentEl, progressEl, progressBar, progressText);
                fileInput.value = "";
            }
        });

        // 拖入高亮
        ["dragenter", "dragover"].forEach(eventName => {
            zone.addEventListener(eventName, () => zone.classList.add("drop-zone-active"));
        });
        ["dragleave", "drop"].forEach(eventName => {
            zone.addEventListener(eventName, () => zone.classList.remove("drop-zone-active"));
        });

        // 放置处理
        zone.addEventListener("drop", (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                uploadFiles(files, category, contentEl, progressEl, progressBar, progressText);
            }
        });
    });
}

async function uploadFiles(files, category, contentEl, progressEl, progressBar, progressText) {
    const validFiles = files.filter(f => {
        const ext = f.name.toLowerCase().split(".").pop();
        return ["pdf", "docx", "doc", "txt"].includes(ext);
    });

    if (validFiles.length === 0) {
        showToast("请上传 PDF / Word / TXT 格式的简历文件", "error");
        return;
    }

    if (validFiles.length < files.length) {
        showToast(`已忽略 ${files.length - validFiles.length} 个不支持的文件格式`, "warn");
    }

    contentEl.style.display = "none";
    progressEl.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = `正在解析 0 / ${validFiles.length} 个文件...`;

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        progressText.textContent = `正在解析 ${i + 1} / ${validFiles.length}: ${file.name}`;
        progressBar.style.width = `${Math.round((i / validFiles.length) * 100)}%`;

        const formData = new FormData();
        formData.append("files", file);
        formData.append("category", category);

        try {
            const resp = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await resp.json();
            if (data.results) {
                data.results.forEach(r => {
                    if (r.status === "ok" || r.status === "duplicate") successCount++;
                    else failCount++;
                });
            }
        } catch (e) {
            failCount++;
        }
    }

    progressBar.style.width = "100%";
    progressText.textContent = `完成！成功 ${successCount}，失败 ${failCount}`;
    await loadData();

    setTimeout(() => {
        progressEl.style.display = "none";
        contentEl.style.display = "";
        showToast(`解析完成：成功 ${successCount} 条${failCount > 0 ? `，失败 ${failCount} 条` : ""}`, failCount > 0 ? "warn" : "success");
    }, 800);
}

// ==================== 表格渲染 ====================
function renderTable(data) {
    const tbody = document.getElementById("tableBody");

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8">
                    <div class="empty-state">
                        <div class="empty-icon">📂</div>
                        <p>暂无简历数据</p>
                        <p class="empty-hint">将简历拖拽到上方三个分类区域即可归纳入库</p>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = data.map((item) => {
        // 渲染工作经历
        let workHtml = "";
        if (item.work_experiences && item.work_experiences.length > 0) {
            workHtml = item.work_experiences.map(w => `
                <div class="work-item">
                    <span class="work-period">${escapeHtml(w.period)}</span>
                    <span class="work-sep">|</span>
                    <span class="work-company">${escapeHtml(w.company)}</span>
                    <span class="work-position">${escapeHtml(w.position)}</span>
                </div>
            `).join("");
        } else {
            workHtml = '<span class="text-muted">未识别</span>';
        }

        // 联系方式
        let contactHtml = "";
        if (item.phone) {
            contactHtml += `<div class="contact-item">📱 ${escapeHtml(item.phone)}</div>`;
        }
        if (item.email) {
            contactHtml += `<div class="contact-item">📧 ${escapeHtml(item.email)}</div>`;
        }
        if (!contactHtml) {
            contactHtml = '<span class="text-muted">-</span>';
        }

        return `
            <tr>
                <td class="cell-center">${item.id}</td>
                <td class="cell-center">${renderCategoryBadge(item.category)}</td>
                <td class="cell-name">${escapeHtml(item.name)}</td>
                <td class="cell-center">${escapeHtml(item.age)}</td>
                <td class="cell-center">
                    <span class="edu-badge edu-${getEduClass(item.education)}">${escapeHtml(item.education)}</span>
                </td>
                <td class="cell-contact">${contactHtml}</td>
                <td class="cell-work">${workHtml}</td>
                <td class="cell-center cell-actions">
                    <button class="btn-icon" onclick="openEditModal(${item.id})" title="编辑">✏️</button>
                    <button class="btn-icon btn-danger" onclick="deleteEntry(${item.id})" title="删除">🗑️</button>
                </td>
            </tr>`;
    }).join("");
}

function getEduClass(edu) {
    const map = {
        "博士研究生": "doctor",
        "硕士研究生": "master",
        "本科": "bachelor",
        "大专": "college",
        "高中/中专": "highschool",
        "未知": "unknown",
    };
    return map[edu] || "unknown";
}

function renderCategoryBadge(cat) {
    if (!cat) return '<span class="text-muted">-</span>';
    const map = {
        "优秀储备": '<span class="tag tag-star">⭐ 优秀储备</span>',
        "常规": '<span class="tag tag-normal">📋 常规</span>',
        "避雷": '<span class="tag tag-warn">⚠️ 避雷</span>',
    };
    return map[cat] || escapeHtml(cat);
}

// ==================== 搜索过滤 ====================
function filterTable() {
    const keyword = document.getElementById("searchInput").value.toLowerCase();
    const eduFilter = document.getElementById("eduFilter").value;
    const categoryFilter = document.getElementById("categoryFilter").value;

    let filtered = allData;

    if (keyword) {
        filtered = filtered.filter(item => {
            const searchStr = JSON.stringify(item).toLowerCase();
            return searchStr.includes(keyword);
        });
    }

    if (categoryFilter) {
        filtered = filtered.filter(item => item.category === categoryFilter);
    }

    if (eduFilter) {
        filtered = filtered.filter(item => item.education === eduFilter);
    }

    renderTable(filtered);
}

// ==================== 编辑弹窗 ====================
function openEditModal(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;

    document.getElementById("editId").value = id;
    document.getElementById("editName").value = item.name;
    document.getElementById("editAge").value = item.age;
    document.getElementById("editEdu").value = item.education;
    document.getElementById("editCategory").value = item.category || "";

    const worksDiv = document.getElementById("editWorks");
    worksDiv.innerHTML = "";

    if (item.work_experiences && item.work_experiences.length > 0) {
        item.work_experiences.forEach((w) => {
            addWorkRow(w.period, w.company, w.position);
        });
    }
    if (!item.work_experiences || item.work_experiences.length === 0) {
        addWorkRow();
    }

    document.getElementById("editModal").classList.add("active");
}

function closeModal() {
    document.getElementById("editModal").classList.remove("active");
}

function addWorkRow(period = "", company = "", position = "") {
    const div = document.createElement("div");
    div.className = "work-edit-row";
    div.innerHTML = `
        <input type="text" class="work-period-input" placeholder="起止时间" value="${escapeHtml(period)}">
        <input type="text" class="work-company-input" placeholder="公司" value="${escapeHtml(company)}">
        <input type="text" class="work-position-input" placeholder="岗位" value="${escapeHtml(position)}">
        <button class="btn-icon btn-danger" onclick="this.parentElement.remove()">✕</button>
    `;
    document.getElementById("editWorks").appendChild(div);
}

async function saveEdit() {
    const id = parseInt(document.getElementById("editId").value);
    const name = document.getElementById("editName").value.trim();
    const age = document.getElementById("editAge").value.trim();
    const education = document.getElementById("editEdu").value;
    const category = document.getElementById("editCategory").value;

    const workRows = document.querySelectorAll(".work-edit-row");
    const workExperiences = [];
    workRows.forEach(row => {
        const period = row.querySelector(".work-period-input").value.trim();
        const company = row.querySelector(".work-company-input").value.trim();
        const position = row.querySelector(".work-position-input").value.trim();
        if (period || company || position) {
            workExperiences.push({ period, company, position });
        }
    });

    try {
        await fetch(`/api/edit/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name, age, education, category, work_experiences: workExperiences
            }),
        });
        closeModal();
        await loadData();
        showToast("保存成功", "success");
    } catch (e) {
        showToast("保存失败: " + e.message, "error");
    }
}

// ==================== 删除 ====================
async function deleteEntry(id) {
    const item = allData.find(d => d.id === id);
    if (!confirm(`确定删除「${item.name}」的记录吗？`)) return;

    try {
        await fetch(`/api/delete/${id}`, { method: "DELETE" });
        await loadData();
        showToast(`已删除「${item.name}」`, "success");
    } catch (e) {
        showToast("删除失败: " + e.message, "error");
    }
}

// ==================== 清空 ====================
async function clearAll() {
    if (!confirm("确定要清空所有台账数据吗？此操作不可撤销！")) return;
    try {
        await fetch("/api/clear", { method: "POST" });
        allData = [];
        renderTable([]);
        updateStatus(true, "共 0 条记录");
        showToast("已清空所有数据", "success");
    } catch (e) {
        showToast("清空失败: " + e.message, "error");
    }
}

// ==================== Toast 提示 ====================
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-show`;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove("toast-show");
    }, 3000);
}

// ==================== 键盘快捷键 ====================
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        document.getElementById("searchInput").focus();
    }
});

// ==================== 工具函数 ====================
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==================== 复制分享链接 ====================
function copyShareUrl() {
    const input = document.getElementById("shareUrl");
    input.select();
    document.execCommand("copy");
    showToast("链接已复制，发送给朋友即可！", "success");
}

// ==================== 点击弹窗遮罩关闭 ====================
document.getElementById("editModal").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
});

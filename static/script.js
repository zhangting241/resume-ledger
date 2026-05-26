// ==================== 全局状态 ====================
let allData = [];
let _positionResolver = null;
let filterPresets = JSON.parse(localStorage.getItem("filterPresets") || "[]");
let dashboardCharts = {};

// ==================== 初始化 ====================
document.addEventListener("DOMContentLoaded", () => {
    loadData();
    loadServerInfo();
    setupDropZones();
    setupTabs();
    renderPresetTags();
});

// ==================== Tab 切换 ====================
function setupTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            const panel = document.getElementById("panel-" + tab);
            if (panel) panel.classList.add("active");
            if (tab === "dashboard") renderDashboard();
        });
    });
}

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
    } catch (e) {}
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
    if (ok) count.textContent = `共 ${allData.length} 条记录`;
    else count.textContent = "";
}

// ==================== 拖拽上传 ====================
function setupDropZones() {
    const categories = ["star", "normal", "warn"];
    const body = document.body;
    ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
        body.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); });
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

        zone.addEventListener("click", (e) => {
            if (e.target.tagName !== "INPUT") fileInput.click();
        });
        fileInput.addEventListener("change", () => {
            const files = Array.from(fileInput.files);
            if (files.length > 0) {
                uploadFiles(files, category, contentEl, progressEl, progressBar, progressText);
                fileInput.value = "";
            }
        });
        ["dragenter", "dragover"].forEach(eventName => {
            zone.addEventListener(eventName, () => zone.classList.add("drop-zone-active"));
        });
        ["dragleave", "drop"].forEach(eventName => {
            zone.addEventListener(eventName, () => zone.classList.remove("drop-zone-active"));
        });
        zone.addEventListener("drop", (e) => {
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) uploadFiles(files, category, contentEl, progressEl, progressBar, progressText);
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
    const position = await showPositionDialog(validFiles.length);
    if (position === null) return;

    contentEl.style.display = "none";
    progressEl.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = `正在解析 0 / ${validFiles.length} 个文件...`;

    let successCount = 0, failCount = 0;
    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        progressText.textContent = `正在解析 ${i + 1} / ${validFiles.length}: ${file.name}`;
        progressBar.style.width = `${Math.round((i / validFiles.length) * 100)}%`;
        const formData = new FormData();
        formData.append("files", file);
        formData.append("category", category);
        formData.append("position", position);
        try {
            const resp = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await resp.json();
            if (data.results) {
                data.results.forEach(r => {
                    if (r.status === "ok" || r.status === "duplicate") successCount++;
                    else failCount++;
                });
            }
        } catch (e) { failCount++; }
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

// ==================== 岗位选择弹窗 ====================
function showPositionDialog(fileCount) {
    return new Promise((resolve) => {
        const modal = document.getElementById("positionModal");
        const countEl = document.getElementById("posFileCount");
        const confirmBtn = document.getElementById("posConfirmBtn");
        const skipBtn = document.getElementById("posSkipBtn");
        const closeBtn = document.getElementById("posModalClose");
        const options = document.querySelectorAll("#posOptions .pos-option");
        countEl.textContent = fileCount;
        confirmBtn.disabled = true;
        options.forEach(o => o.classList.remove("selected"));
        let selectedPos = "";
        function selectOption(el, pos) {
            options.forEach(o => o.classList.remove("selected"));
            el.classList.add("selected");
            selectedPos = pos;
            confirmBtn.disabled = false;
        }
        options.forEach(opt => { opt.onclick = () => selectOption(opt, opt.dataset.pos); });
        function cleanup(result) {
            modal.classList.remove("active");
            options.forEach(o => { o.onclick = null; });
            confirmBtn.onclick = null; skipBtn.onclick = null; closeBtn.onclick = null;
            _positionResolver = null;
            resolve(result);
        }
        confirmBtn.onclick = () => cleanup(selectedPos);
        skipBtn.onclick = () => cleanup("");
        closeBtn.onclick = () => cleanup(null);
        modal.onclick = function(e) { if (e.target === modal) cleanup(null); };
        _positionResolver = resolve;
        modal.classList.add("active");
    });
}

// ==================== 卡片渲染 ====================
function renderTable(data) {
    const container = document.getElementById("cardList");
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>暂无简历数据</p>
                <p class="empty-hint">将简历拖拽到上方三个分类区域即可归纳入库</p>
            </div>`;
        updateMatchBar(data);
        return;
    }

    container.innerHTML = data.map((item) => {
        let contactHtml = "";
        if (item.phone) contactHtml += `<span class="editable" data-id="${item.id}" data-field="phone">📱 ${escapeHtml(item.phone)}</span>`;
        if (item.email) {
            if (contactHtml) contactHtml += '<span class="sep">·</span>';
            contactHtml += `<span class="editable" data-id="${item.id}" data-field="email">📧 ${escapeHtml(item.email)}</span>`;
        }
        if (!contactHtml) contactHtml = '<span class="editable text-muted" data-id="' + item.id + '" data-field="phone">点击添加联系方式</span>';

        // 城市 + 性别
        let metaHtml = "";
        if (item.gender) metaHtml += `${escapeHtml(item.gender)}`;
        if (item.city) metaHtml += (metaHtml ? " · " : "") + `📍 ${escapeHtml(item.city)}`;

        // 技能标签
        let skillsHtml = "";
        if (item.skills && item.skills.length > 0) {
            skillsHtml = '<div class="card-skills">' + item.skills.map(s => `<span class="skill-tag" onclick="event.stopPropagation();removeSkill(${item.id},'${escapeHtml(s)}')">${escapeHtml(s)} ×</span>`).join("") + '</div>';
        }

        // 工作经历
        let timelineHtml = "";
        if (item.work_experiences && item.work_experiences.length > 0) {
            timelineHtml = item.work_experiences.map((w, i) => `
                <div class="timeline-item">
                    <div class="timeline-dot ${i === 0 ? 'active' : ''}"></div>
                    <div class="timeline-content">
                        <span class="timeline-period">${escapeHtml(w.period)}</span>
                        <span class="timeline-company">${escapeHtml(w.company)}</span>
                        <span class="timeline-position">${escapeHtml(w.position)}</span>
                    </div>
                </div>`).join("");
        } else {
            timelineHtml = '<span class="text-muted">未识别工作经历</span>';
        }

        let noteHtml = item.note
            ? `<span class="editable note-preview" data-id="${item.id}" data-field="note">${escapeHtml(item.note)}</span>`
            : `<span class="editable note-preview note-empty" data-id="${item.id}" data-field="note">📝 点击添加沟通记录...</span>`;

        const firstChar = (item.name || "?")[0];

        return `
            <div class="resume-card">
                <div class="card-header">
                    <div class="card-header-tags">
                        <span class="editable" data-id="${item.id}" data-field="category" data-type="select">${renderCategoryBadge(item.category)}</span>
                        <span class="editable" data-id="${item.id}" data-field="position" data-type="select">${renderPositionBadge(item.position)}</span>
                    </div>
                    <button class="btn-icon btn-danger" data-delete="${item.id}" title="删除">🗑️</button>
                </div>
                <div class="card-body">
                    <div class="card-left">
                        <div class="card-avatar">${escapeHtml(firstChar)}</div>
                        <div class="card-info">
                            <div class="card-name-row">
                                <span class="card-name editable" data-id="${item.id}" data-field="name">${escapeHtml(item.name)}</span>
                                <span class="card-age editable" data-id="${item.id}" data-field="age">${escapeHtml(item.age)}岁</span>
                                <span class="card-edu editable" data-id="${item.id}" data-field="education" data-type="select">
                                    <span class="edu-badge edu-${getEduClass(item.education)}">${escapeHtml(item.education)}</span>
                                </span>
                            </div>
                            <div class="card-meta">${metaHtml}</div>
                            <div class="card-contact">${contactHtml}</div>
                            ${skillsHtml}
                        </div>
                    </div>
                    <div class="card-right">
                        <div class="timeline">${timelineHtml}</div>
                        <span class="work-edit-link" onclick="event.stopPropagation();openEditModal(${item.id})">✏️ 编辑/添加工作经历</span>
                    </div>
                </div>
                <div class="card-footer">${noteHtml}</div>
            </div>`;
    }).join("");
    updateMatchBar(data);
}

function updateMatchBar(data) {
    const bar = document.getElementById("matchBar");
    const count = document.getElementById("matchCount");
    const hasFilter = document.getElementById("searchInput").value
        || document.getElementById("categoryFilter").value
        || document.getElementById("positionFilter").value
        || document.getElementById("eduFilter").value
        || document.getElementById("genderFilter").value
        || document.getElementById("ageMin").value
        || document.getElementById("ageMax").value;
    if (hasFilter && allData.length > 0) {
        bar.style.display = "flex";
        count.textContent = data.length;
    } else {
        bar.style.display = "none";
    }
}

function getEduClass(edu) {
    const map = { "博士研究生": "doctor", "硕士研究生": "master", "本科": "bachelor", "大专": "college", "高中/中专": "highschool", "未知": "unknown" };
    return map[edu] || "unknown";
}

function renderCategoryBadge(cat) {
    if (!cat) return '<span class="text-muted">未分类</span>';
    const map = { "优秀储备": '<span class="tag tag-star">⭐ 优秀储备</span>', "常规": '<span class="tag tag-normal">📋 常规</span>', "避雷": '<span class="tag tag-warn">⚠️ 避雷</span>' };
    return map[cat] || escapeHtml(cat);
}

function renderPositionBadge(pos) {
    if (!pos) return '<span class="text-muted">未选岗</span>';
    const map = {
        "职能平台": '<span class="tag tag-position-platform">🖥️ 职能平台</span>',
        "项目经理": '<span class="tag tag-position-pm">📊 项目经理</span>',
        "客服主管": '<span class="tag tag-position-support">📞 客服主管</span>',
        "安全主管": '<span class="tag tag-position-security">🛡️ 安全主管</span>',
        "工程主管": '<span class="tag tag-position-engineer">🔧 工程主管</span>',
        "客服管家": '<span class="tag tag-position-housekeeper">🎧 客服管家</span>',
    };
    return map[pos] || escapeHtml(pos);
}

// ==================== 搜索过滤（增强版） ====================
function filterTable() {
    const keyword = document.getElementById("searchInput").value.toLowerCase();
    const categoryFilter = document.getElementById("categoryFilter").value;
    const positionFilter = document.getElementById("positionFilter").value;
    const eduFilter = document.getElementById("eduFilter").value;
    const genderFilter = document.getElementById("genderFilter").value;
    const ageMin = parseInt(document.getElementById("ageMin").value) || 0;
    const ageMax = parseInt(document.getElementById("ageMax").value) || 999;

    let filtered = allData;

    if (keyword) {
        filtered = filtered.filter(item => {
            // 搜索所有字段 + 工作经历 + 技能
            const str = JSON.stringify(item).toLowerCase();
            if (str.includes(keyword)) return true;
            // 深度搜索工作经历
            if (item.work_experiences) {
                for (const w of item.work_experiences) {
                    if (JSON.stringify(w).toLowerCase().includes(keyword)) return true;
                }
            }
            return false;
        });
    }
    if (categoryFilter) filtered = filtered.filter(item => item.category === categoryFilter);
    if (positionFilter) filtered = filtered.filter(item => item.position === positionFilter);
    if (eduFilter) filtered = filtered.filter(item => item.education === eduFilter);
    if (genderFilter) filtered = filtered.filter(item => item.gender === genderFilter);
    if (ageMin > 0 || ageMax < 999) {
        filtered = filtered.filter(item => {
            const age = parseInt(item.age);
            if (isNaN(age)) return true;
            return age >= ageMin && age <= ageMax;
        });
    }

    renderTable(filtered);
}

function resetFilters() {
    document.getElementById("searchInput").value = "";
    document.getElementById("categoryFilter").value = "";
    document.getElementById("positionFilter").value = "";
    document.getElementById("eduFilter").value = "";
    document.getElementById("genderFilter").value = "";
    document.getElementById("ageMin").value = "";
    document.getElementById("ageMax").value = "";
    filterTable();
    showToast("筛选条件已重置", "info");
}

// ==================== 筛选预设 ====================
function saveFilterPreset() {
    const preset = {
        search: document.getElementById("searchInput").value,
        category: document.getElementById("categoryFilter").value,
        position: document.getElementById("positionFilter").value,
        edu: document.getElementById("eduFilter").value,
        gender: document.getElementById("genderFilter").value,
        ageMin: document.getElementById("ageMin").value,
        ageMax: document.getElementById("ageMax").value,
    };
    const name = preset.search || preset.position || "筛选条件";
    filterPresets = [...filterPresets.filter(p => JSON.stringify(p.cond) !== JSON.stringify(preset)), { name: name.substring(0, 20), cond: preset }];
    if (filterPresets.length > 5) filterPresets = filterPresets.slice(-5);
    localStorage.setItem("filterPresets", JSON.stringify(filterPresets));
    renderPresetTags();
    showToast("筛选条件已保存", "success");
}

function loadFilterPreset(index) {
    const p = filterPresets[index];
    if (!p) return;
    document.getElementById("searchInput").value = p.cond.search || "";
    document.getElementById("categoryFilter").value = p.cond.category || "";
    document.getElementById("positionFilter").value = p.cond.position || "";
    document.getElementById("eduFilter").value = p.cond.edu || "";
    document.getElementById("genderFilter").value = p.cond.gender || "";
    document.getElementById("ageMin").value = p.cond.ageMin || "";
    document.getElementById("ageMax").value = p.cond.ageMax || "";
    filterTable();
}

function removeFilterPreset(index) {
    filterPresets.splice(index, 1);
    localStorage.setItem("filterPresets", JSON.stringify(filterPresets));
    renderPresetTags();
}

function renderPresetTags() {
    const container = document.getElementById("presetTags");
    if (!filterPresets.length) { container.innerHTML = ""; return; }
    container.innerHTML = filterPresets.map((p, i) => `
        <span class="preset-tag">
            <span class="preset-name" onclick="loadFilterPreset(${i})">🔖 ${escapeHtml(p.name)}</span>
            <span class="preset-close" onclick="event.stopPropagation();removeFilterPreset(${i})">×</span>
        </span>`).join("");
}

// ==================== 内联编辑 ====================
document.getElementById("cardList").addEventListener("click", function(e) {
    const delBtn = e.target.closest("[data-delete]");
    if (delBtn) { e.stopPropagation(); deleteEntry(parseInt(delBtn.dataset.delete)); return; }
    const editable = e.target.closest(".editable");
    if (!editable || editable.classList.contains("editing")) return;
    e.stopPropagation();
    startInlineEdit(editable);
});

function startInlineEdit(el) {
    const id = parseInt(el.dataset.id);
    const field = el.dataset.field;
    const type = el.dataset.type || "text";
    const item = allData.find(d => d.id === id);
    if (!item) return;
    el.classList.add("editing");
    const oldHtml = el.innerHTML;
    function cancelEdit() { el.innerHTML = oldHtml; el.classList.remove("editing"); }

    if (type === "select") {
        let options = [];
        if (field === "category") {
            options = [["", "未分类"], ["优秀储备", "⭐ 优秀储备"], ["常规", "📋 常规"], ["避雷", "⚠️ 避雷"]];
        } else if (field === "position") {
            options = [["", "未选岗"], ["职能平台", "🖥️ 职能平台"], ["项目经理", "📊 项目经理"], ["客服主管", "📞 客服主管"], ["安全主管", "🛡️ 安全主管"], ["工程主管", "🔧 工程主管"], ["客服管家", "🎧 客服管家"]];
        } else if (field === "education") {
            options = [["博士研究生", "博士"], ["硕士研究生", "硕士"], ["本科", "本科"], ["大专", "大专"], ["高中/中专", "高中/中专"], ["未知", "未知"]];
        }
        const sel = document.createElement("select");
        sel.className = "inline-edit-input";
        options.forEach(([val, label]) => {
            const opt = document.createElement("option");
            opt.value = val; opt.textContent = label;
            if (item[field] === val) opt.selected = true;
            sel.appendChild(opt);
        });
        el.innerHTML = ""; el.appendChild(sel); sel.focus();

        let saved = false;
        const doSave = () => {
            if (saved) return;
            const newVal = sel.value;
            if (newVal === (item[field] || "")) { saved = true; cancelEdit(); return; }
            saved = true;
            item[field] = newVal;
            filterTable();
            fetch(`/api/edit/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: newVal }) })
                .catch(e => { showToast("保存失败: " + e.message, "error"); loadData(); });
        };
        sel.addEventListener("change", doSave);
        sel.addEventListener("blur", doSave);
        sel.addEventListener("keydown", (e) => { if (e.key === "Escape") { saved = true; cancelEdit(); } });
    } else if (field === "note") {
        const ta = document.createElement("textarea");
        ta.className = "inline-edit-textarea"; ta.value = item.note || ""; ta.rows = 3;
        el.innerHTML = ""; el.appendChild(ta); ta.focus();
        let saved = false;
        const doSave = () => {
            if (saved) return; saved = true;
            const newVal = ta.value.trim();
            if (newVal !== (item.note || "")) { item.note = newVal; saveAndRefresh(id, field, newVal); }
            else cancelEdit();
        };
        ta.addEventListener("blur", doSave);
        ta.addEventListener("keydown", (e) => { if (e.key === "Escape") { ta.removeEventListener("blur", doSave); cancelEdit(); } });
    } else {
        const val = item[field] || "";
        const inp = document.createElement("input");
        inp.type = "text"; inp.className = "inline-edit-input"; inp.value = val;
        inp.style.minWidth = Math.max(String(val).length * 12 + 30, 40) + "px";
        el.innerHTML = ""; el.appendChild(inp); inp.focus(); inp.select();
        let saved = false;
        const doSave = () => {
            if (saved) return; saved = true;
            const newVal = inp.value.trim();
            if (newVal !== (item[field] || "")) { item[field] = newVal; saveAndRefresh(id, field, newVal); }
            else cancelEdit();
        };
        inp.addEventListener("blur", doSave);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { inp.removeEventListener("blur", doSave); cancelEdit(); } });
    }
}

async function saveAndRefresh(id, field, value) {
    try { await fetch(`/api/edit/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) }); }
    catch (e) { showToast("保存失败: " + e.message, "error"); }
    filterTable();
}

// ==================== 编辑弹窗 ====================
function openEditModal(id) {
    const item = allData.find(d => d.id === id);
    if (!item) return;
    document.getElementById("editId").value = id;
    document.getElementById("editName").value = item.name;
    document.getElementById("editGender").value = item.gender || "";
    document.getElementById("editAge").value = item.age;
    document.getElementById("editEdu").value = item.education;
    document.getElementById("editCategory").value = item.category || "";
    document.getElementById("editPosition").value = item.position || "";
    document.getElementById("editCity").value = item.city || "";
    document.getElementById("editPhone").value = item.phone || "";
    document.getElementById("editEmail").value = item.email || "";
    document.getElementById("editNote").value = item.note || "";

    // 技能标签
    _editSkills = item.skills && Array.isArray(item.skills) ? [...item.skills] : [];
    renderEditSkills();

    // 工作经历
    const worksDiv = document.getElementById("editWorks");
    worksDiv.innerHTML = "";
    if (item.work_experiences && item.work_experiences.length > 0) {
        item.work_experiences.forEach(w => addWorkRow(w.period, w.company, w.position));
    }
    if (!item.work_experiences || item.work_experiences.length === 0) addWorkRow();

    document.getElementById("editModal").classList.add("active");
}

let _editSkills = [];
function renderEditSkills() {
    const container = document.getElementById("editSkillsTags");
    container.innerHTML = _editSkills.map((s, i) => `
        <span class="skill-tag-edit">${escapeHtml(s)} <span class="skill-tag-remove" onclick="removeEditSkill(${i})">×</span></span>
    `).join("");
}
function removeEditSkill(i) { _editSkills.splice(i, 1); renderEditSkills(); }
function addEditSkill() {
    const input = document.getElementById("editSkillsInput");
    const val = input.value.trim();
    if (!val) return;
    // 支持逗号分隔
    const skills = val.split(/[,，]+/).map(s => s.trim()).filter(s => s && !_editSkills.includes(s));
    _editSkills.push(...skills);
    input.value = "";
    renderEditSkills();
}

// 技能输入框事件
document.addEventListener("DOMContentLoaded", () => {
    const skillsInput = document.getElementById("editSkillsInput");
    if (skillsInput) {
        skillsInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); addEditSkill(); }
        });
    }
});

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
        <button class="btn-icon btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    document.getElementById("editWorks").appendChild(div);
}

async function saveEdit() {
    const id = parseInt(document.getElementById("editId").value);
    const name = document.getElementById("editName").value.trim();
    const gender = document.getElementById("editGender").value;
    const age = document.getElementById("editAge").value.trim();
    const education = document.getElementById("editEdu").value;
    const category = document.getElementById("editCategory").value;
    const position = document.getElementById("editPosition").value;
    const city = document.getElementById("editCity").value.trim();
    const phone = document.getElementById("editPhone").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const note = document.getElementById("editNote").value.trim();
    const skills = _editSkills;

    const workRows = document.querySelectorAll(".work-edit-row");
    const workExperiences = [];
    workRows.forEach(row => {
        const period = row.querySelector(".work-period-input").value.trim();
        const company = row.querySelector(".work-company-input").value.trim();
        const pos = row.querySelector(".work-position-input").value.trim();
        if (period || company || pos) workExperiences.push({ period, company, position: pos });
    });

    try {
        await fetch(`/api/edit/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, gender, age, education, category, position, city, phone, email, skills, note, work_experiences: workExperiences }),
        });
        closeModal();
        await loadData();
        showToast("保存成功", "success");
        // 如果看板在显示中，刷新
        if (document.getElementById("panel-dashboard").classList.contains("active")) renderDashboard();
    } catch (e) {
        showToast("保存失败: " + e.message, "error");
    }
}

// ==================== 技能标签卡片内删除 ====================
async function removeSkill(id, skillName) {
    const item = allData.find(d => d.id === id);
    if (!item) return;
    item.skills = (item.skills || []).filter(s => s !== skillName);
    try {
        await fetch(`/api/edit/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skills: item.skills }) });
        filterTable();
    } catch (e) { showToast("删除失败", "error"); }
}

// ==================== 删除 / 清空 ====================
async function deleteEntry(id) {
    const item = allData.find(d => d.id === id);
    if (!confirm(`确定删除「${item.name}」的记录吗？`)) return;
    try {
        await fetch(`/api/delete/${id}`, { method: "DELETE" });
        await loadData();
        showToast(`已删除「${item.name}」`, "success");
    } catch (e) { showToast("删除失败: " + e.message, "error"); }
}

async function clearAll() {
    if (!confirm("确定要清空所有台账数据吗？此操作不可撤销！")) return;
    try {
        await fetch("/api/clear", { method: "POST" });
        allData = [];
        renderTable([]);
        updateStatus(true, "共 0 条记录");
        showToast("已清空所有数据", "success");
    } catch (e) { showToast("清空失败: " + e.message, "error"); }
}

// ==================== Toast ====================
function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-show`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove("toast-show"), 3000);
}

// ==================== 复 制链接 ====================
function copyShareUrl() {
    const input = document.getElementById("shareUrl");
    input.select();
    document.execCommand("copy");
    showToast("链接已复制，发送给朋友即可！", "success");
}

// ==================== 键盘 / 弹窗遮罩 ====================
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.ctrlKey && e.key === "f") { e.preventDefault(); document.getElementById("searchInput").focus(); }
});
document.getElementById("editModal").addEventListener("click", function(e) { if (e.target === this) closeModal(); });

// ==================== 工具函数 ====================
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==================== 列宽拖拽（历史遗留，保留） ====================
function initColumnResize() {
    const table = document.getElementById("ledgerTable");
    if (!table) return;
    const headers = table.querySelectorAll("thead th.resizable");
    headers.forEach(th => {
        const handle = document.createElement("div");
        handle.className = "resize-handle";
        th.appendChild(handle);
        handle.addEventListener("mousedown", function(e) {
            e.preventDefault(); e.stopPropagation();
            const startX = e.pageX, startWidth = th.offsetWidth, colIndex = parseInt(th.dataset.col);
            table.style.tableLayout = "fixed";
            const allCells = table.querySelectorAll(`tr > *:nth-child(${colIndex + 1})`);
            allCells.forEach(cell => { cell.style.width = startWidth + "px"; });
            function onMouseMove(e) {
                const newWidth = Math.max(40, startWidth + e.pageX - startX);
                allCells.forEach(cell => { cell.style.width = newWidth + "px"; });
            }
            function onMouseUp() {
                document.removeEventListener("mousemove", onMouseMove);
                document.removeEventListener("mouseup", onMouseUp);
                document.body.style.cursor = ""; document.body.style.userSelect = "";
            }
            document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        });
        handle.addEventListener("dblclick", function(e) {
            e.preventDefault(); e.stopPropagation();
            const colIndex = parseInt(th.dataset.col);
            const allCells = table.querySelectorAll(`tr > *:nth-child(${colIndex + 1})`);
            allCells.forEach(cell => { cell.style.width = ""; });
        });
    });
}

// ==================== 数据看板 ====================
function renderDashboard() {
    const data = allData;
    if (!data.length) {
        document.getElementById("statsRow").innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px;"><div class="empty-icon">📊</div><p>暂无数据，请先上传简历</p></div>';
        return;
    }

    // 概览统计
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const starCount = data.filter(d => d.category === "优秀储备").length;
    const monthNew = data.filter(d => (d.add_time || "").startsWith(thisMonth)).length;
    const eduData = data.filter(d => d.education && d.education !== "未知");
    const bachelorAbove = eduData.filter(d => ["本科","硕士研究生","博士研究生"].includes(d.education)).length;
    const bachelorPct = eduData.length ? Math.round(bachelorAbove / eduData.length * 100) : 0;

    document.getElementById("statTotal").textContent = data.length;
    document.getElementById("statStar").textContent = starCount;
    document.getElementById("statMonthNew").textContent = monthNew;
    document.getElementById("statBachelor").textContent = bachelorPct + "%";

    // 图表
    renderPositionChart(data);
    renderEducationChart(data);
    renderAgeChart(data);
    renderCityChart(data);
    renderCrossTable(data);
    renderMonthlyChart(data);
}

function destroyChart(key) {
    if (dashboardCharts[key]) { dashboardCharts[key].destroy(); dashboardCharts[key] = null; }
}

function renderPositionChart(data) {
    destroyChart("position");
    const positions = ["职能平台", "项目经理", "客服主管", "安全主管", "工程主管", "客服管家"];
    const counts = positions.map(p => data.filter(d => d.position === p).length);
    const unset = data.filter(d => !d.position).length;
    const allLabels = [...positions, "未选岗"];
    const allCounts = [...counts, unset];
    const colors = ["#1890ff","#722ed1","#13c2c2","#fa8c16","#52c41a","#eb2f96","#d9d9d9"];

    const ctx = document.getElementById("chartPosition").getContext("2d");
    dashboardCharts["position"] = new Chart(ctx, {
        type: "doughnut",
        data: { labels: allLabels, datasets: [{ data: allCounts, backgroundColor: colors }] },
        options: { responsive: true, plugins: { legend: { position: "right", labels: { padding: 12, usePointStyle: true } } } }
    });
}

function renderEducationChart(data) {
    destroyChart("education");
    const levels = ["博士研究生", "硕士研究生", "本科", "大专", "高中/中专", "未知"];
    const counts = levels.map(l => data.filter(d => d.education === l).length);
    const colors = ["#c41d7f", "#389e0d", "#096dd9", "#d48806", "#8c8c8c", "#bfbfbf"];

    const ctx = document.getElementById("chartEducation").getContext("2d");
    dashboardCharts["education"] = new Chart(ctx, {
        type: "bar",
        data: { labels: ["博士", "硕士", "本科", "大专", "高中/中专", "未知"], datasets: [{ label: "人数", data: counts, backgroundColor: colors, borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function renderAgeChart(data) {
    destroyChart("age");
    const ages = data.map(d => parseInt(d.age)).filter(a => !isNaN(a) && a >= 18 && a <= 70);
    const buckets = { "18-22": 0, "23-27": 0, "28-32": 0, "33-37": 0, "38-42": 0, "43-47": 0, "48+": 0 };
    ages.forEach(a => {
        if (a <= 22) buckets["18-22"]++;
        else if (a <= 27) buckets["23-27"]++;
        else if (a <= 32) buckets["28-32"]++;
        else if (a <= 37) buckets["33-37"]++;
        else if (a <= 42) buckets["38-42"]++;
        else if (a <= 47) buckets["43-47"]++;
        else buckets["48+"]++;
    });

    const ctx = document.getElementById("chartAge").getContext("2d");
    dashboardCharts["age"] = new Chart(ctx, {
        type: "bar",
        data: { labels: Object.keys(buckets), datasets: [{ label: "人数", data: Object.values(buckets), backgroundColor: "#4a6cf7", borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function renderCityChart(data) {
    destroyChart("city");
    const cityMap = {};
    data.forEach(d => { if (d.city) { cityMap[d.city] = (cityMap[d.city] || 0) + 1; } });
    const sorted = Object.entries(cityMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const ctx = document.getElementById("chartCity").getContext("2d");
    dashboardCharts["city"] = new Chart(ctx, {
        type: "bar",
        data: { labels: sorted.map(s => s[0]), datasets: [{ label: "人数", data: sorted.map(s => s[1]), backgroundColor: "#7c5cfc", borderRadius: 4 }] },
        options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function renderCrossTable(data) {
    const categories = ["优秀储备", "常规", "避雷"];
    const positions = ["职能平台", "项目经理", "客服主管", "安全主管", "工程主管", "客服管家"];

    let html = `<thead><tr><th>岗位</th>${categories.map(c => `<th>${c}</th>`).join("")}<th>合计</th></tr></thead><tbody>`;
    positions.forEach(pos => {
        let total = 0;
        html += `<tr><td class="cross-label">${pos}</td>`;
        categories.forEach(cat => {
            const n = data.filter(d => d.position === pos && d.category === cat).length;
            total += n;
            html += `<td class="cross-num">${n || "-"}</td>`;
        });
        html += `<td class="cross-total">${total}</td></tr>`;
    });
    // 未选岗行
    html += `<tr><td class="cross-label" style="color:#999">未选岗</td>`;
    let unsetTotal = 0;
    categories.forEach(cat => {
        const n = data.filter(d => !d.position && d.category === cat).length;
        unsetTotal += n;
        html += `<td class="cross-num">${n || "-"}</td>`;
    });
    html += `<td class="cross-total">${unsetTotal}</td></tr></tbody>`;
    document.getElementById("crossTable").innerHTML = html;
}

function renderMonthlyChart(data) {
    destroyChart("monthly");
    const monthMap = {};
    data.forEach(d => {
        if (d.add_time) {
            const m = d.add_time.substring(0, 7);
            monthMap[m] = (monthMap[m] || 0) + 1;
        }
    });
    const sorted = Object.entries(monthMap).sort();
    if (sorted.length < 2) return;

    const ctx = document.getElementById("chartMonthly").getContext("2d");
    dashboardCharts["monthly"] = new Chart(ctx, {
        type: "line",
        data: { labels: sorted.map(s => s[0]), datasets: [{ label: "新增人数", data: sorted.map(s => s[1]), borderColor: "#4a6cf7", backgroundColor: "rgba(74,108,247,0.1)", fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}
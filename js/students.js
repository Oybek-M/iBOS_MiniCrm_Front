// js/students.js
$(function () {
    const API_BASE = "http://localhost:5070/api";
    const token = localStorage.getItem("jwtToken");
    if (!token) return window.location.href = "./index.html";

    /* ——— JWT parse ——— */
    function parseJwt(t) {
        try { return JSON.parse(atob(t.split(".")[1])); }
        catch { return {}; }
    }

    /* ——— Global confirm modal ——— */
    function showModal(msg, onYes, onNo) {
        $("#modalMessage").text(msg);
        $("#globalModal").removeClass("hidden");
        $("#modalConfirm").off("click").on("click", () => {
            $("#globalModal").addClass("hidden");
            onYes && onYes();
        });
        $("#modalCancel").off("click").on("click", () => {
            $("#globalModal").addClass("hidden");
            onNo && onNo();
        });
    }

    /* ——— Dark mode toggle ——— */
    function applyDark(on) {
        $("body").toggleClass("dark-mode", on);
        $("#themeToggle").text(on ? "☀️" : "🌙");
    }

    /* ——— Sidebar toggle responsive ——— */
    function initSidebar() {
        $("#sidebarToggle").on("click", () => {
            $(".sidebar").toggleClass("open");
            $(".main-content").toggleClass("shifted");
            $("#sidebarToggle").toggleClass("lightColor");
        });
        $(window).on("resize", () => {
            if (window.innerWidth >= 993) {
                $(".sidebar, .main-content").removeClass("open shifted");
                $("#sidebarToggle").removeClass("lightColor");
            }
        });
    }

    // /* ——— Dereference $ref yozuvlar ——— */
    // function derefArray(values) {
    //     const raw = values || [];
    //     const idMap = {};
    //     raw.forEach(item => {
    //         if (item.$id && item.id) idMap[item.$id] = item;
    //     });
    //     return raw
    //         .map(item => item.$ref ? idMap[item.$ref] : item)
    //         .filter(item => item && item.id);
    // }

    /* ——— Normalize har bir student va nested students ——— */
    // Dereference qilib, birinchi va ichki studentlarni alohida yig‘uvchi
    function normalizeStudents(apiValues) {
        const raw = apiValues || [];
        const idMap = {};
        // 1) Top-level obyektlar map
        raw.forEach(item => {
            if (item.$id && item.id) idMap[item.$id] = item;
        });

        const result = [];

        raw.forEach(item => {
            // Agar bu item haqiqiy student obyekti bo‘lsa
            if (item.id) {
                // 2) Qo‘shamiz – top level
                result.push({
                    ...item,
                    __group: item.group // keyinchalik ishlatamiz
                });

                // 3) Guruh ichidagi studentlar arrayini olamiz
                const nestedRaw = item.group?.students?.$values || [];
                nestedRaw.forEach(nestedItem => {
                    // Dereference: agar ref bo‘lsa, real obyektga olamiz
                    const real = nestedItem.$ref ? idMap[nestedItem.$ref] : nestedItem;
                    // Faqat haqiqiy obyekt bo‘lsa, va top-levelda mavjud bo‘lmasa
                    if (real && real.id && !result.find(r => r.id === real.id)) {
                        result.push({
                            ...real,
                            // __group maydoni orqali, nested uchun ham guruhni saqlaymiz
                            __group: item.group
                        });
                    }
                });
            }
        });

        return result;
    }


    /* ——— Sarlavha, Logout, Admin-link, Darkmode init ——— */
    const me = parseJwt(token);
    $("#userName").text(me.username || "User");

    // Darkmode
    const darkStored = localStorage.getItem("darkMode") === "true";
    applyDark(darkStored);
    $("#themeToggle").on("click", () => {
        const now = !$("body").hasClass("dark-mode");
        applyDark(now);
        localStorage.setItem("darkMode", now);
    });

    // Logout
    $("#btnLogout").on("click", () => {
        showModal(
            "Chiqishni tasdiqlaysizmi?",
            () => {
                localStorage.removeItem("jwtToken");
                window.location.href = "../index.html";
            },
            null
        );
    });

    // Admin link faqat SuperAdmin uchun
    let isSuper = false;
    $.ajax({
        url: `${API_BASE}/users/role`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        success(res) {
            // endpoint qaytaradi { role: "SuperAdministrator" }
            const role = res?.role || res;
            isSuper = String(role).toLowerCase() === "superadministrator";

            // Adminlar kartasi va sidebar link
            $("#adminsCard").toggle(isSuper);
            $('.sidebar a[href="./admins.html"]').closest("li").toggle(isSuper);

            // Endi statistika chaqiramiz
            fetchStats();
        },
        error() {
            // Agar role olishda xato bo‘lsa, admin qismini yashiramiz
            isSuper = false;
            $("#adminsCard").hide();
            $('.sidebar a[href="./admins.html"]').closest("li").hide();
            fetchStats();
        }
    });

    initSidebar();

    /* ——— Data holati ——— */
    let students = [];
    let groups = [];
    let sortState = { field: null, dir: 1 };
    let filterStatus = "";
    let searchTerm = "";

    /* ——— Guruhlar dropdown uchun yuklash ——— */
    function loadGroups() {
        $.get(`${API_BASE}/groups`, d => {
            groups = (d.$values || []).map(g => ({ id: g.id, name: g.name }));
            const $sel = $("#sfGroup").empty().append('<option value="">– Tanlang –</option>');
            groups.forEach(g => $sel.append(`<option value="${g.id}">${g.name}</option>`));
        });
    }

    /* ——— Studentlarni yuklash ——— */
    function loadStudents() {
        const url = `${API_BASE}/students`;

        $.get(url, d => {
            const all = normalizeStudents(d.$values);
            students = all.map(s => ({
                id: s.id,
                firstName: s.firstName,
                lastName: s.lastName,
                phoneNumber: s.phoneNumber,
                paymentStatus: s.paymentStatus,
                monthlyPaymentAmount: s.monthlyPaymentAmount,
                discountPercentage: s.discountPercentage,
                // endi __group har doim to‘g‘ri berilgan
                group: s.__group
                    ? { id: s.__group.id, name: s.__group.name }
                    : null
            }));
            renderTable();
        });
    }


    /* ——— Jadvalni chizish (search, sort, filter) ——— */
    function renderTable() {
        let arr = students.slice();

        // Filter by payment status
        if (filterStatus) {
            const status = parseInt(filterStatus, 10);
            arr = arr.filter(s => s.paymentStatus === status);
        }

        // Search
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            arr = arr.filter(s =>
                s.firstName.toLowerCase().includes(q) ||
                s.lastName.toLowerCase().includes(q) ||
                s.phoneNumber.toLowerCase().includes(q)
            );
        }

        // Sort
        if (sortState.field) {
            arr.sort((a, b) => {
                let av = a[sortState.field], bv = b[sortState.field];
                if (typeof av === "string") {
                    av = av.toLowerCase(); bv = bv.toLowerCase();
                }
                return (av < bv ? -1 : av > bv ? 1 : 0) * sortState.dir;
            });
        }

        // Draw
        const $body = $("#studentsTable tbody").empty();
        arr.forEach(s => {
            const status = s.paymentStatus === 1 ? "To'lagan" : "To'lamagan";
            const grp = s.group?.name || "–";
            $body.append(`
                <tr data-id="${s.id}">
                <td>${s.firstName}</td>
                <td>${s.lastName}</td>
                <td>${s.phoneNumber}</td>
                <td>${status}</td>
                <td>${grp}</td>
                <td>
                    <button class="actBtn view-btn">👁️</button>
                    <button class="actBtn edit-btn">✏️</button>
                    <button class="actBtn del-btn">🗑️</button>
                </td>
                </tr>
            `);
        });
    }

    /* ——— Sort headerlari ustida bosish ——— */
    $("#studentsTable thead th[data-sort]").on("click", function () {
        const f = $(this).data("sort");
        if (sortState.field === f) sortState.dir *= -1;
        else { sortState.field = f; sortState.dir = 1; }
        $("#studentsTable thead th").removeClass("asc desc");
        $(this).addClass(sortState.dir > 0 ? "asc" : "desc");
        renderTable();
    });

    /* ——— Toolbar: filter & search ——— */
    $("#filterStatus").on("change", () => {
        filterStatus = $("#filterStatus").val();
        loadStudents();
    });
    $("#studentSearch").on("input", () => {
        searchTerm = $("#studentSearch").val().trim();
        renderTable();
    });

    /* ——— Add / Edit form modal ——— */
    let editId = null;
    $("#btnAddStudent").on("click", () => {
        editId = null;
        $("#studentFormTitle").text("Yangi o‘quvchi");
        $("#studentForm")[0].reset();
        $("#studentFormModal").removeClass("hidden");
    });
    $("#studentFormCancel").on("click", () => {
        $("#studentFormModal").addClass("hidden");
    });
    $("#studentForm").on("submit", function (e) {
        e.preventDefault();
        $("#studentFormModal").addClass("hidden");
        const payload = {
            firstName: $("#sfFirstName").val(),
            lastName: $("#sfLastName").val(),
            phoneNumber: $("#sfPhoneNumber").val(),
            monthlyPaymentAmount: +$("#sfPayment").val(),
            discountPercentage: +$("#sfDiscount").val(),
            groupId: $("#sfGroup").val()
        };
        const url = editId
            ? `${API_BASE}/students/${editId}`
            : `${API_BASE}/students`;
        const method = editId ? "PUT" : "POST";

        showModal(
            editId
                ? "O‘quvchi ma’lumotini yangilaysizmi?"
                : "Yangi o‘quvchi qo‘shasizmi?",
            () => {
                $.ajax({
                    url, method,
                    headers: { Authorization: `Bearer ${token}` },
                    contentType: "application/json",
                    data: JSON.stringify(payload),
                    success() { loadStudents(); }
                });
            },
            () => { $("#studentFormModal").removeClass("hidden"); }
        );
    });

    /* ——— View student modal ——— */
    $("#studentsTable").on("click", ".view-btn", function () {
        const id = $(this).closest("tr").data("id");
        $.get(`${API_BASE}/students/${id}`, s => {
            $("#viewSName").text(`${s.firstName} ${s.lastName}`);
            $("#viewSPhone").text(s.phoneNumber);
            $("#viewSPay").text(s.monthlyPaymentAmount.toFixed(2));
            $("#viewSDisc").text(s.discountPercentage);
            $("#viewSStatus").text(s.paymentStatus === 1 ? "To'lagan" : "To'lamagan");
            $("#viewSGroup").text(s.group?.name || "–");
            $("#studentViewModal").removeClass("hidden");
        });
    });
    $("#studentViewClose").on("click", () => {
        $("#studentViewModal").addClass("hidden");
    });

    /* ——— Edit tugmasi ——— */
    $("#studentsTable").on("click", ".edit-btn", function () {
        editId = $(this).closest("tr").data("id");
        $("#studentFormModal").removeClass("hidden");
        $.get(`${API_BASE}/students/${editId}`, s => {
            $("#studentFormTitle").text("O‘quvchini tahrirlash");
            $("#sfFirstName").val(s.firstName);
            $("#sfLastName").val(s.lastName);
            $("#sfPhoneNumber").val(s.phoneNumber);
            $("#sfPayment").val(s.monthlyPaymentAmount);
            $("#sfDiscount").val(s.discountPercentage);
            $("#sfGroup").val(s.group.id);
        });
    });

    /* ——— Delete tugmasi ——— */
    $("#studentsTable").on("click", ".del-btn", function () {
        const id = $(this).closest("tr").data("id");
        showModal(
            "O‘quvchini oʻchirasizmi?",
            () => {
                $.ajax({
                    url: `${API_BASE}/students/${id}`,
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                    success() { loadStudents(); },
                    error(xhr) {
                        const msg = xhr.responseJSON?.Message || "Xatolik yuz berdi";
                        showModal(msg, null, null);
                    }
                });
            },
            null
        );
    });

    /* ——— Boshlang‘ich yuklash ——— */
    loadGroups();
    loadStudents();
});

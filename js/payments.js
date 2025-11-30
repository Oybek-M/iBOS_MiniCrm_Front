// js/payments.js
$(function () {
    const API_BASE = "http://178.18.254.129:6001/api";
    const token = localStorage.getItem("jwtToken");
    if (!token) return window.location.href = "../index.html";

    // ——— Dereference & normalize funksiyasi (students.js dan) ———
    function normalizeStudents(apiValues) {
        const raw = apiValues || [];
        const idMap = {};

        // 1) Top-level obyektlarni map
        raw.forEach(item => {
            if (item.$id && item.id) {
                idMap[item.$id] = item;
            }
        });

        const result = [];

        raw.forEach(item => {
            if (item.id) {
                // 2) Top-level studentni qo‘shamiz
                result.push({
                    ...item,
                    __group: item.group
                });

                // 3) Agar group ichida nested students bo‘lsa, ularni ham qo‘shamiz
                const nested = item.group?.students?.$values || [];
                nested.forEach(n => {
                    const real = n.$ref ? idMap[n.$ref] : n;
                    if (real && real.id && !result.find(r => r.id === real.id)) {
                        result.push({
                            ...real,
                            __group: item.group
                        });
                    }
                });
            }
        });

        return result;
    }

    // — Load all students for dropdown
    let studentsList = [];
    let studentMap = {}; // name -> id
    function loadStudentsForDropdown() {
        $.ajax({
            url: `${API_BASE}/students`,
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            success(data) {
                const flat = normalizeStudents(data.$values);
                const $dlist = $("#pfStudentList").empty();
                studentMap = {};

                flat.forEach(s => {
                    const name = `${s.firstName} ${s.lastName}`;
                    studentMap[name] = s.id;
                    // option value=visible name
                    $dlist.append(`<option value="${name}">`);
                });
                // form inputni tozalaymiz
                $("#pfStudentInput").val("");
            },
            error() {
                showModal("Studentlar ro‘yxatini yuklashda xatolik yuz berdi.", null, null);
            }
        });
    }

    // static map for payment types
    const PAYMENT_METHODS = { 1: "Naqd", 2: "Click" };

    // — Helpers
    function parseJwt(t) {
        try { return JSON.parse(atob(t.split('.')[1])); }
        catch { return {}; }
    }
    function showModal(msg, onYes, onNo) {
        $("#modalMessage").text(msg);
        $("#globalModal").removeClass("hidden");
        $("#modalConfirm").off("click").on("click", () => {
            $("#globalModal").addClass("hidden");
            onYes?.();
        });
        $("#modalCancel").off("click").on("click", () => {
            $("#globalModal").addClass("hidden");
            onNo?.();
        });
    }
    function applyDark(on) {
        $("body").toggleClass("dark-mode", on);
        $("#themeToggle").text(on ? "☀️" : "🌙");
    }
    function initSidebar() {
        $("#sidebarToggle").click(() => {
            $("#sidebarToggle").toggleClass("lightColor");
            $(".sidebar").toggleClass("open");
            $(".main-content").toggleClass("shifted");

        });
        $(window).resize(() => {
            if (window.innerWidth >= 993) {
                $(".sidebar,.main-content").removeClass("open shifted");
                $("#sidebarToggle").removeClass("lightColor");
            }
        });
    }

    // — Init UI
    const me = parseJwt(token);
    $("#userName").text(me.username || "User");
    const darkStored = localStorage.getItem("darkMode") === "true";
    applyDark(darkStored);
    $("#themeToggle").click(() => {
        const now = !$("body").hasClass("dark-mode");
        applyDark(now);
        localStorage.setItem("darkMode", now);
    });
    $("#btnLogout").click(() => {
        showModal("Chiqishni tasdiqlaysizmi?", () => {
            localStorage.removeItem("jwtToken");
            window.location.href = "../index.html";
        }, null);
    });

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

            console.log(`User role: ${role}, isSuper: ${isSuper}`);

            // Oddiy Admin uchun “Kunlik hisobot”ni ko‘rsat
            $("#btnDownloadDaily").toggle(isSuper == false);
            // SuperAdmin uchun “To‘liq hisobot”ni ko‘rsat
            $("#btnDownloadAll").toggle(isSuper == true);

        },
        error() {
            // Agar role olishda xato bo‘lsa, admin qismini yashiramiz
            isSuper = false;
            $("#btnDownloadAll").toggle(isSuper == true);

            $("#adminsCard").hide();
            $('.sidebar a[href="./admins.html"]').closest("li").hide();
        }
    });
    initSidebar();


    // — State
    let payments = [], students = [];
    let sortState = { field: null, dir: 1 }, filterType = "", searchTerm = "";

    // — Load payments
    function loadPayments() {
        $.get(`${API_BASE}/payments`, d => {
            const vals = Array.isArray(d.$values) ? d.$values : [];
            payments = vals.map(p => ({
                id: p.id,
                studentName: `${p.student.firstName} ${p.student.lastName}`,
                studentPhoneNumber: p.student.studentPhoneNumber,
                groupName: p.student.group?.name || "–",
                amount: p.amount,
                type: PAYMENT_METHODS[p.type] || p.type,
                date: new Date(p.paymentDate).toLocaleDateString(),
                notes: p.notes
            }));
            renderTable();
        });
    }

    // — Render with search, filter, sort
    function renderTable() {
        let arr = payments.slice();

        // filter by type
        if (filterType) {
            arr = arr.filter(x => x.type === PAYMENT_METHODS[filterType]);
        }

        // search
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            arr = arr.filter(x =>
                x.studentName.toLowerCase().includes(q) ||
                x.groupName.toLowerCase().includes(q) ||
                x.date.toLowerCase().includes(q)
            );
        }

        // sort
        if (sortState.field) {
            arr.sort((a, b) => {
                let av = a[sortState.field], bv = b[sortState.field];
                if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
                if (av < bv) return -1 * sortState.dir;
                if (av > bv) return 1 * sortState.dir;
                return 0;
            });
        }

        // draw
        const $b = $("#paymentsTable tbody").empty();
        arr.forEach(p => {
            $b.append(`
        <tr data-id="${p.id}">
          <td>${p.studentName}</td>
          <td>${p.groupName}</td>
          <td>${p.amount.toLocaleString()}</td>
          <td>${p.type}</td>
          <td>${p.date}</td>
          <td>
            <button class="actBtn view-btn">👁️</button>
            <button class="actBtn del-btn">🗑️</button>
          </td>
        </tr>
      `);
        });
    }

    // — Sort headers
    $("#paymentsTable thead th[data-sort]").click(function () {
        const f = $(this).data("sort");
        if (sortState.field === f) sortState.dir *= -1;
        else { sortState.field = f; sortState.dir = 1; }
        $("#paymentsTable thead th").removeClass("asc desc");
        $(this).addClass(sortState.dir > 0 ? "asc" : "desc");
        renderTable();
    });

    // — Toolbar events
    $("#filterType").change(function () {
        filterType = $(this).val();
        renderTable();
    });
    $("#paymentSearch").on("input", function () {
        searchTerm = $(this).val().trim();
        renderTable();
    });

    // — Create Payment
    $("#btnAddPayment").on("click", () => {
        // Har safar to‘liq, normalize qilingan student ro‘yxatini yuklaymiz
        loadStudentsForDropdown();
        $("#paymentFormTitle").text("Yangi to‘lov");
        $("#paymentForm")[0].reset();
        $("#paymentFormModal").removeClass("hidden");
    });

    // Bekor tugmasi
    $("#paymentFormCancel").click(() =>
        $("#paymentFormModal").addClass("hidden")
    );

    // Form submit
    // js/payments.js (faqat Form submit qismi)
    $("#paymentForm").on("submit", function (e) {
        e.preventDefault();
        $("#paymentFormModal").addClass("hidden");

        const studentName = $("#pfStudentInput").val().trim();
        const studentId = studentMap[studentName];
        if (!studentId) {
            showModal("Iltimos, dropdowndan o'quvchini tanlang.", null, null);
            return;
        }
        const payload = {
            studentId,
            amountPaid: +$("#pfAmount").val(),
            type: +$("#pfType").val(),
            notes: $("#pfNotes").val()
        };


        showModal("Yangi to‘lov saqlansinmi?", () => {
            $.ajax({
                url: `${API_BASE}/payments`,
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                contentType: "application/json",
                data: JSON.stringify(payload),
                xhrFields: { responseType: "blob" },
                success(blobData, statusText, xhr) {
                    // 1️⃣ Header’dan fayl nomi olishga urinib ko‘ramiz
                    const disp = xhr.getResponseHeader("Content-Disposition") || "";
                    if (disp.includes("filename=")) {
                        // header bor — darhol yuklaymiz
                        const filename = disp
                            .split("filename=")[1]
                            .split(";")[0]
                            .replace(/['"]/g, "");
                        downloadBlob(blobData, filename);
                        loadPayments();
                    } else {
                        // header yo‘q — student ma'lumotini olish
                        $.get(`${API_BASE}/students/${payload.studentId}`, s => {
                            const fn = s.firstName || "X";
                            const ln = s.lastName || "Y";
                            const d = new Date();
                            const Y = d.getFullYear();
                            const M = String(d.getMonth() + 1).padStart(2, "0");
                            const D = String(d.getDate()).padStart(2, "0");
                            const filename = `check_${fn}_${ln}_${Y}-${M}-${D}.pdf`;
                            downloadBlob(blobData, filename);
                            loadPayments();
                        }).fail(() => {
                            // agar student ma'lumotini olishda xato bo‘lsa ham yuklaymiz
                            downloadBlob(blobData, "check.pdf");
                            loadPayments();
                        });
                    }
                },
                error(xhr) {
                    // oldingi xato-handling...
                    const ct = xhr.getResponseHeader("Content-Type") || "";
                    if (ct.includes("application/json") && xhr.response) {
                        const reader = new FileReader();
                        reader.onload = () => {
                            let msg = "Xatolik yuz berdi";
                            try { msg = JSON.parse(reader.result).Message || msg; }
                            catch { }
                            showModal(msg, () => $("#paymentFormModal").removeClass("hidden"), null);
                        };
                        reader.readAsText(xhr.response);
                    } else {
                        const msg = xhr.responseJSON?.Message || "Xatolik yuz berdi";
                        showModal(msg, () => $("#paymentFormModal").removeClass("hidden"), null);
                    }
                }
            });
        }, null);

        // Yordamchi funktsiya: blob + nom => yuklash
        function downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }
    });




    // — View Payment
    $("#paymentsTable").on("click", ".view-btn", function () {
        const id = $(this).closest("tr").data("id");
        $.get(`${API_BASE}/payments/${id}`, p => {
            $("#viewPStudent").text(`${p.student.firstName} ${p.student.lastName}`);
            $("#viewPPhone").text(p.student.studentPhoneNumber || "–");
            $("#viewPGroup").text(p.student.group?.name || "–");
            $("#viewPAmount").text(p.amount.toLocaleString());
            $("#viewPType").text(PAYMENT_METHODS[p.type] || p.type);
            $("#viewPDate").text(new Date(p.paymentDate).toLocaleString());
            $("#viewPNotes").text(p.notes || "–");
            $("#paymentViewModal").removeClass("hidden");
        });
    });
    $("#paymentViewClose").click(() => $("#paymentViewModal").addClass("hidden"));

    // — Delete Payment
    $("#paymentsTable").on("click", ".del-btn", function () {
        const id = $(this).closest("tr").data("id");
        showModal("To‘lovni o‘chirasizmi?", () => {
            $.ajax({
                url: `${API_BASE}/payments/${id}`, method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
                success() { loadPayments(); }
            });
        }, null);
    });

    // — Kunlik hisobot (admin) —
    $("#btnDownloadDaily").on("click", () => {
        const now = new Date().toISOString();
        showModal("Kunlik hisobot yuklansinmi?", () => {
            $.ajax({
                url: `${API_BASE}/payments/download-daily-report`,
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                contentType: "application/json",
                data: JSON.stringify({ date: now }),
                xhrFields: { responseType: "blob" },
                success(blob) {
                    const d = new Date();
                    const fname = `daily_payments_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.xlsx`;
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = fname;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                },
                error() {
                    showModal("Kunlik hisobotni yuklashda xatolik.", null, null);
                }
            });
        }, null);
    });

    // — To‘liq hisobot (superadmin) —
    $("#btnDownloadAll").on("click", () => {
        showModal("To‘liq hisobot yuklansinmi?", () => {
            $.ajax({
                url: `${API_BASE}/backups/download-payments-history`,
                method: "GET",  // hech qanday body kerak emas
                headers: { Authorization: `Bearer ${token}` },
                xhrFields: { responseType: "blob" },
                success(blob, status, xhr) {
                    // server CT-D header’dan nom olsa bo‘ladi, aks holda default
                    let filename = "full_payments_history.xlsx";
                    const cd = xhr.getResponseHeader("Content-Disposition") || "";
                    if (cd.includes("filename=")) {
                        filename = cd
                            .split("filename=")[1]
                            .split(";")[0]
                            .replace(/['"]/g, "");
                    }
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                },
                error() {
                    showModal("To‘liq hisobotni yuklashda xatolik.", null, null);
                }
            });
        }, null);
    });

    // — Initial load
    loadStudentsForDropdown();
    loadPayments();
});
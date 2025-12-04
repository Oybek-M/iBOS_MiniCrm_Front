// js/teachers.js (refactored for your API shape)
// - Create expects: { firstName, lastName, phoneNumber, userName, password }
// - Update (PUT) expects: { firstName, lastName, phoneNumber, oldPassword, newPassword } (old/new optional)
$(function() {
    const API_BASE = "http://crm.ibos.uz/api";
    const token = localStorage.getItem("jwtToken");
    if (!token) return (window.location.href = "../index.html");

    /* ---------- Helpers ---------- */
    function parseJwt(t) {
        try {
            return JSON.parse(atob(t.split(".")[1]));
        } catch {
            return {};
        }
    }

    function ajaxPromise(options) {
        return new Promise((resolve, reject) => {
            $.ajax(options)
                .done((data, textStatus, jqXHR) => resolve({
                    data,
                    textStatus,
                    jqXHR
                }))
                .fail((jqXHR, textStatus, errorThrown) =>
                    reject({
                        jqXHR,
                        textStatus,
                        errorThrown
                    })
                );
        });
    }

    function extractErrorMessage(err) {
        if (!err) return "Noma'lum xatolik";
        const jq = err.jqXHR || err;
        if (
            jq.responseJSON &&
            (jq.responseJSON.Message || jq.responseJSON.message)
        ) {
            return jq.responseJSON.Message || jq.responseJSON.message;
        }
        if (jq.responseText) {
            try {
                const parsed = JSON.parse(jq.responseText);
                return parsed.Message || parsed.message || jq.responseText;
            } catch {
                return jq.responseText;
            }
        }
        return jq.statusText || `HTTP ${jq.status || "error"}`;
    }

    function showModal(msg, onYes, onNo) {
        $("#modalMessage").text(msg);
        $("#globalModal").removeClass("hidden");
        $("#modalConfirm")
            .off("click")
            .on("click", () => {
                $("#globalModal").addClass("hidden");
                onYes && onYes();
            });
        $("#modalCancel")
            .off("click")
            .on("click", () => {
                $("#globalModal").addClass("hidden");
                onNo && onNo();
            });
    }

    function showAlert(msg, okCb) {
        $("#modalMessage").text(msg);
        $("#globalModal").removeClass("hidden");
        $("#modalCancel").hide();
        $("#modalConfirm")
            .off("click")
            .on("click", () => {
                $("#globalModal").addClass("hidden");
                $("#modalCancel").show();
                okCb && okCb();
            });
    }

    function derefListWrapper(resp) {
        const raw = Array.isArray(resp) ? resp : resp?.$values || [];
        const idMap = {};
        raw.forEach((item) => {
            if (item && item.$id) idMap[item.$id] = item;
        });
        return raw
            .map((item) => (item && item.$ref ? idMap[item.$ref] : item))
            .filter(Boolean);
    }

    /* ---------- UI init ---------- */
    $("#userName")?.text(parseJwt(token).username || "User");
    const darkStored = localStorage.getItem("darkMode") === "true";
    $("body").toggleClass("dark-mode", darkStored);
    $("#themeToggle").on("click", () => {
        const now = !$("body").hasClass("dark-mode");
        $("body").toggleClass("dark-mode", now);
        $("#themeToggle").text(now ? "☀️" : "🌙");
        localStorage.setItem("darkMode", now);
    });

    /* ——— DETERMINE ROLE & FETCH ——— */
    let isSuper = false;
    $.ajax({
        url: `${API_BASE}/users/role`,
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`
        },
        success(res) {
            const role = res?.role || res;
            isSuper = String(role).toLowerCase() === "superadministrator";
            $("#adminsCard").toggle(isSuper);
            $('.sidebar a[href="./admins.html"]').closest("li").toggle(isSuper);
            isSuper ? fetchSuperStats() : fetchAdminStats();
        },
        error() {
            isSuper = false;
            $("#adminsCard, .sidebar a[href='./admins.html']").closest("li").hide();
            fetchAdminStats();
        },
    });

    $("#sidebarToggle").on("click", () => {
        $(".sidebar").toggleClass("open");
        $(".main-content").toggleClass("shifted");
        $("#sidebarToggle").toggleClass("lightColor");
    });
    $(window).on("resize", () => {
        if (window.innerWidth >= 993) {
            $(".sidebar").removeClass("open");
            $(".main-content").removeClass("shifted");
            $("#sidebarToggle").removeClass("lightColor");
        }
    });

    $("#btnLogout").on("click", () =>
        showModal(
            "Chiqishni tasdiqlaysizmi?",
            () => {
                localStorage.removeItem("jwtToken");
                window.location.href = "../index.html";
            },
            null
        )
    );

    /* ---------- State ---------- */
    let teachersData = []; // normalized list of teachers for table
    let editId = null;
    let currentSearch = "";
    let currentSort = {
        field: null,
        dir: 1
    };

    /* ---------- Render ---------- */
    function renderTable() {
        let arr = teachersData.slice();

        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            arr = arr.filter(
                (t) =>
                (t.firstName || "").toLowerCase().includes(q) ||
                (t.lastName || "").toLowerCase().includes(q) ||
                (t.phoneNumber || "").includes(q) ||
                (t.userName || "").toLowerCase().includes(q)
            );
        }

        if (currentSort.field) {
            arr.sort((a, b) => {
                let av = a[currentSort.field] || "",
                    bv = b[currentSort.field] || "";
                if (typeof av === "string") {
                    av = av.toLowerCase();
                    bv = bv.toLowerCase();
                }
                if (av < bv) return -1 * currentSort.dir;
                if (av > bv) return 1 * currentSort.dir;
                return 0;
            });
        }

        const $body = $("#teachersTable tbody").empty();
        arr.forEach((t) => {
            $body.append(`
				<tr data-id="${t.id}">
					<td>${t.firstName || ""}</td>
					<td>${t.lastName || ""}</td>
					<td>${t.phoneNumber || ""}</td>
					<td>
						<button class="actBtn view-btn">👁️</button>
						<button class="actBtn edit-btn">✏️</button>
						<button class="actBtn del-btn">🗑️</button>
					</td>
				</tr>
			`);
        });
    }

    /* ---------- Load data from API ---------- */
    async function loadTeachers() {
        try {
            const res = await ajaxPromise({
                url: `${API_BASE}/teachers`,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                },
            });

            const arr = derefListWrapper(res.data);
            // each item may include userName and groups as $values => normalize minimal fields
            teachersData = arr.map((item) => ({
                id: item.id,
                firstName: item.firstName,
                lastName: item.lastName,
                phoneNumber: item.phoneNumber,
                userName: item.userName,
                groups: (item.groups &&
                    (Array.isArray(item.groups) ?
                        item.groups :
                        item.groups.$values || [])) || [],
            }));
            renderTable();
        } catch (err) {
            console.error(err);
            showAlert("O'qituvchilar ro'yxatini olishda xatolik.");
        }
    }

    /* ---------- Search & Sort handlers ---------- */
    $("#teacherSearch").on("input", function() {
        currentSearch = $(this).val().trim();
        renderTable();
    });
    $("#teachersTable thead th[data-sort]").on("click", function() {
        const f = $(this).data("sort");
        if (currentSort.field === f) currentSort.dir *= -1;
        else {
            currentSort.field = f;
            currentSort.dir = 1;
        }
        $("#teachersTable thead th").removeClass("asc desc");
        $(this).addClass(currentSort.dir === 1 ? "asc" : "desc");
        renderTable();
    });

    /* ---------- Add / Edit ---------- */
    $("#btnAddTeacher").on("click", () => {
        editId = null;
        $("#teacherFormTitle").text("Yangi o‘qituvchi");
        $("#teacherForm")[0].reset();
        // show create fields
        $("#tfUserName").prop("required", true).show();
        $("#tfPassword").prop("required", true).show();
        $("#tfPasswordLabel").show();
        $("#passwordChangeSection").hide();
        $("#teacherFormModal").removeClass("hidden");
    });

    $("#teacherFormCancel").on("click", () =>
        $("#teacherFormModal").addClass("hidden")
    );

    $("#teacherForm").on("submit", async function(e) {
        e.preventDefault();
        // gather values
        const firstName = $("#tfFirstName").val();
        const lastName = $("#tfLastName").val();
        const phoneNumber = $("#tfPhoneNumber").val();
        const userName = $("#tfUserName").val();
        const password = $("#tfPassword").val();
        const oldPassword = $("#tfOldPassword").val();
        const newPassword = $("#tfNewPassword").val();

        if (!firstName || !lastName || !phoneNumber) {
            showAlert("Ism, familya va telefon kiritilishi shart.");
            return;
        }

        // If creating
        if (!editId) {
            if (!userName || !password) {
                showAlert("Login va parol kiritilishi shart.");
                return;
            }
            const payload = {
                firstName,
                lastName,
                phoneNumber,
                userName,
                password
            };
            $("#teacherFormModal").addClass("hidden");
            showModal(
                "Yangi o'qituvchi saqlansinmi?",
                async () => {
                        try {
                            await ajaxPromise({
                                url: `${API_BASE}/teachers`,
                                method: "POST",
                                headers: {
                                    Authorization: `Bearer ${token}`
                                },
                                contentType: "application/json",
                                data: JSON.stringify(payload),
                            });
                            await loadTeachers();
                        } catch (err) {
                            console.error(err);
                            showAlert(extractErrorMessage(err));
                        }
                    },
                    () => {
                        $("#teacherFormModal").removeClass("hidden");
                    }
            );
            return;
        }

        // If editing existing teacher
        const payload = {
            firstName,
            lastName,
            phoneNumber
        };
        if (oldPassword && newPassword) {
            payload.oldPassword = oldPassword;
            payload.newPassword = newPassword;
        }
        $("#teacherFormModal").addClass("hidden");
        showModal(
            "O'qituvchi ma'lumotlari yangilansinmi?",
            async () => {
                    try {
                        await ajaxPromise({
                            url: `${API_BASE}/teachers/${editId}`,
                            method: "PUT",
                            headers: {
                                Authorization: `Bearer ${token}`
                            },
                            contentType: "application/json",
                            data: JSON.stringify(payload),
                        });
                        await loadTeachers();
                    } catch (err) {
                        console.error(err);
                        showAlert(extractErrorMessage(err));
                    }
                },
                () => {
                    $("#teacherFormModal").removeClass("hidden");
                }
        );
    });

    /* ---------- View ---------- */
    $("#teachersTable").on("click", ".view-btn", async function() {
        const id = $(this).closest("tr").data("id");
        try {
            const res = await ajaxPromise({
                url: `${API_BASE}/teachers/${id}`,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                },
            });
            const t = res.data;
            $("#viewName").text(`${t.firstName || ""} ${t.lastName || ""}`);
            $("#viewPhone").text(t.phoneNumber || "");
            $("#viewUserName").text(t.userName || "");
            // groups may be $values
            const groupsArr = t.groups ?
                Array.isArray(t.groups) ?
                t.groups :
                t.groups.$values || [] : [];
            $("#viewGroupsList").empty();
            if (groupsArr.length === 0)
                $("#viewGroupsList").append(`<li>Guruh qo'shilmagan</li>`);
            else
                groupsArr.forEach((g) =>
                    $("#viewGroupsList").append(`<li>${g.name || g}</li>`)
                );
            $("#teacherViewModal").removeClass("hidden");
        } catch (err) {
            console.error(err);
            showAlert(extractErrorMessage(err));
        }
    });
    $("#teacherViewClose").on("click", () =>
        $("#teacherViewModal").addClass("hidden")
    );

    /* ---------- Edit button ---------- */
    $("#teachersTable").on("click", ".edit-btn", async function() {
        editId = $(this).closest("tr").data("id");
        $("#teacherForm")[0].reset();
        try {
            const res = await ajaxPromise({
                url: `${API_BASE}/teachers/${editId}`,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                },
            });
            const t = res.data;
            $("#teacherFormTitle").text("O‘qituvchini tahrirlash");
            $("#tfFirstName").val(t.firstName || "");
            $("#tfLastName").val(t.lastName || "");
            $("#tfPhoneNumber").val(t.phoneNumber || "");
            // hide create-only fields
            $("#tfUserName").prop("required", false).hide();
            $("#tfPassword").prop("required", false).hide();
            $("#tfPasswordLabel").hide();
            // show password change section (optional)
            $("#passwordChangeSection").show();
            $("#teacherFormModal").removeClass("hidden");
        } catch (err) {
            console.error(err);
            showAlert(extractErrorMessage(err));
        }
    });

    /* ---------- Delete ---------- */
    $("#teachersTable").on("click", ".del-btn", function() {
        const id = $(this).closest("tr").data("id");
        showModal(
            "Haqiqatdan ham o‘qituvchini o‘chirasizmi?",
            async () => {
                    try {
                        await ajaxPromise({
                            url: `${API_BASE}/teachers/${id}`,
                            method: "DELETE",
                            headers: {
                                Authorization: `Bearer ${token}`
                            },
                        });
                        await loadTeachers();
                    } catch (err) {
                        console.error(err);
                        showAlert(extractErrorMessage(err));
                    }
                },
                null
        );
    });

    /* ---------- Initial load ---------- */
    loadTeachers();
});
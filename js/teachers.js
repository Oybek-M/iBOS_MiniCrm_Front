// js/teacher.js
$(function () {
  const API_BASE = window.API_BASE || "http://localhost:5070/api";
  const token = localStorage.getItem("jwtToken");
  if (!token) return window.location.href = "./index.html";

  // 1) JWT'dan foydalanuvchi nomini olish
  function parseJwt(t) {
    try { return JSON.parse(atob(t.split(".")[1])); }
    catch { return {}; }
  }
  $("#userName")?.text(parseJwt(token).username || "User");

  // 2) Global tasdiqlash modalini boshqarish
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

  // 3) Dark mode
  function applyDarkMode(on) {
    $("body").toggleClass("dark-mode", on);
    $("#themeToggle").text(on ? "☀️" : "🌙");
  }
  const dm = localStorage.getItem("darkMode") === "true";
  applyDarkMode(dm);
  $("#themeToggle").on("click", () => {
    const now = !$("body").hasClass("dark-mode");
    applyDarkMode(now);
    localStorage.setItem("darkMode", now);
  });

  // 4) Sidebar toggle + responsive reset
  $("#sidebarToggle").on("click", () => {
    $(".sidebar").toggleClass("open");
    $(".main-content").toggleClass("shifted");
    $("#sidebarToggle").toggleClass("lightColor");
  });
  $(window).on("resize", () => {
    if (window.innerWidth >= 993) {
      $(".sidebar").removeClass("open");
      $(".main-content").removeClass("shifted");
      $("#sidebarToggle").removeClass("lisghtColor");
    }
  });

  // 5) Logout
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

  // 6) Adminlar linkini yashirish/ko‘rsatish
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

  // 7) Data + filter/sort holatlari
  let teachersData = [];             // serverdan kelgan barcha ma'lumot
  let currentSearch = "";            // qidiruv matni
  let currentSort = { field: null, dir: 1 };  // saralash holati

  // 8) Jadvalni qayta chizish
  function renderTable() {
    let arr = teachersData.slice();

    // a) Qidiruv
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      arr = arr.filter(t =>
        t.firstName.toLowerCase().includes(q) ||
        t.lastName.toLowerCase().includes(q) ||
        t.phoneNumber.includes(q)
      );
    }

    // b) Saralash
    if (currentSort.field) {
      arr.sort((a, b) => {
        let av = a[currentSort.field], bv = b[currentSort.field];
        if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        if (av < bv) return -1 * currentSort.dir;
        if (av > bv) return 1 * currentSort.dir;
        return 0;
      });
    }

    // c) Chizish
    const $body = $("#teachersTable tbody").empty();
    arr.forEach(t => {
      $body.append(`
        <tr data-id="${t.id}">
          <td>${t.firstName}</td>
          <td>${t.lastName}</td>
          <td>${t.phoneNumber}</td>
          <td>
            <button class="actBtn view-btn">👁️</button>
            <button class="actBtn edit-btn">✏️</button>
            <button class="actBtn del-btn">🗑️</button>
          </td>
        </tr>
      `);
    });
  }

  // 9) Serverdan ma'lumot olish
  function loadTeachers() {
    $.get(`${API_BASE}/teachers`, data => {
      teachersData = Array.isArray(data.$values) ? data.$values : [];
      renderTable();
    });
  }

  // 10) Qidiruv input
  $("#teacherSearch").on("input", function () {
    currentSearch = $(this).val().trim();
    renderTable();
  });

  // 11) Sarlavha ustiga bosish orqali saralash
  $("#teachersTable thead th[data-sort]").on("click", function () {
    const field = $(this).data("sort");
    if (currentSort.field === field) {
      currentSort.dir *= -1;
    } else {
      currentSort.field = field;
      currentSort.dir = 1;
    }
    // belgini yangilash
    $("#teachersTable thead th").removeClass("asc desc");
    $(this).addClass(currentSort.dir === 1 ? "asc" : "desc");
    renderTable();
  });

  // 12) Add / Edit modal logikasi
  let editId = null;
  $("#btnAddTeacher").on("click", () => {
    editId = null;
    $("#teacherFormTitle").text("Yangi o‘qituvchi");
    $("#teacherForm")[0].reset();
    $("#teacherFormModal").removeClass("hidden");
  });
  $("#teacherFormCancel").click(() => $("#teacherFormModal").addClass("hidden"));

  $("#teacherForm").submit(e => {
    e.preventDefault();
    $("#teacherFormModal").addClass("hidden"); // form modalni yop

    const payload = {
      firstName: $("#tfFirstName").val(),
      lastName: $("#tfLastName").val(),
      phoneNumber: $("#tfPhoneNumber").val()
    };
    const url = editId ? `${API_BASE}/teachers/${editId}` : `${API_BASE}/teachers`;
    const method = editId ? "PUT" : "POST";

    showModal(
      editId
        ? "O‘qituvchi ma’lumotini yangilaysizmi?"
        : "Yangi o‘qituvchi qo‘shasizmi?",
      () => {
        $.ajax({
          url, method,
          headers: { Authorization: `Bearer ${token}` },
          contentType: "application/json",
          data: JSON.stringify(payload),
          success() { loadTeachers(); }
        });
      },
      () => {
        // bekor qilinsa, formni qayta och
        $("#teacherFormModal").removeClass("hidden");
      }
    );
  });

  // 13) View modal
  $("#teachersTable").on("click", ".view-btn", function () {
    const id = $(this).closest("tr").data("id");
    $.get(`${API_BASE}/teachers/${id}`, t => {
      $("#viewName").text(`${t.firstName} ${t.lastName}`);
      $("#viewPhone").text(t.phoneNumber);
      const groups = Array.isArray(t.groups?.$values) ? t.groups.$values : [];
      $("#viewGroupsList").empty().append(groups.map(g => `<li>${g.name}</li>`));
      $("#teacherViewModal").removeClass("hidden");
    });
  });
  $("#teacherViewClose").click(() => $("#teacherViewModal").addClass("hidden"));

  // 14) Edit tugma
  $("#teachersTable").on("click", ".edit-btn", function () {
    editId = $(this).closest("tr").data("id");
    $("#teacherFormModal").removeClass("hidden");
    $.get(`${API_BASE}/teachers/${editId}`, t => {
      $("#teacherFormTitle").text("O‘qituvchini tahrirlash");
      $("#tfFirstName").val(t.firstName);
      $("#tfLastName").val(t.lastName);
      $("#tfPhoneNumber").val(t.phoneNumber);
    });
  });

  // 15) Delete tugma
  $("#teachersTable").on("click", ".del-btn", function () {
    const id = $(this).closest("tr").data("id");
    showModal(
      "Haqiqatdan ham o‘qituvchini o‘chirasizmi?",
      () => {
        $.ajax({
          url: `${API_BASE}/teachers/${id}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          success() {
            loadTeachers();
          },
          error(xhr) {
            // Backend'dan kelgan aniq xabarni oling
            const errMsg = xhr.responseJSON?.Message
              || xhr.responseJSON?.message
              || "O‘chirishda noma’lum xatolik yuz berdi.";
            // Foydalanuvchiga ko‘rsating
            showModal(errMsg, null, null);
          }
        });
      },
      null
    );
  });

  // 16) Boshida malumot yuklash va tayyorlash
  loadTeachers();
});

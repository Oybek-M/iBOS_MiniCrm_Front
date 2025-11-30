// js/groups.js
$(function () {
  const API_BASE = window.API_BASE || "http://178.18.254.129:6001/api";
  const token = localStorage.getItem("jwtToken");
  if (!token) return window.location.href = "./index.html";

  // JWT parse
  function parseJwt(t) {
    try { return JSON.parse(atob(t.split(".")[1])); }
    catch { return {}; }
  }
  $("#userName")?.text(parseJwt(token).username || "User");

  // Global modal
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

  // Dark mode init
  function applyDarkMode(on) {
    $("body").toggleClass("dark-mode", on);
    $("#themeToggle").text(on ? "☀️" : "🌙");
  }
  const dm = localStorage.getItem("darkMode") === "true";
  applyDarkMode(dm);
  $("#themeToggle").click(() => {
    const now = !$("body").hasClass("dark-mode");
    applyDarkMode(now);
    localStorage.setItem("darkMode", now);
  });

  // Sidebar toggle/responsive
  $("#sidebarToggle").click(() => {
    $(".sidebar").toggleClass("open");
    $(".main-content").toggleClass("shifted");
    $("#sidebarToggle").toggleClass("lightColor");
  });
  $(window).resize(() => {
    if (window.innerWidth >= 993) {
      $(".sidebar,.main-content").removeClass("open shifted");
      $("#sidebarToggle").removeClass("lisghtColor");
    }
  });

  // Logout
  $("#btnLogout").click(() => {
    showModal(
      "Chiqishni tasdiqlaysizmi?",
      () => { localStorage.removeItem("jwtToken"); window.location = "../index.html"; },
      null
    );
  });

  // Admin link only for superadmin
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

  // Data & sort state
  let groupsData = [];
  let teachersList = [];
  let sortState = { field: null, dir: 1 };

  // 1) Load teachers for dropdown
  function loadTeachersDropdown() {
    $.get(`${API_BASE}/teachers`, data => {
      teachersList = Array.isArray(data.$values) ? data.$values : [];
      const $sel = $("#gfTeacher").empty()
        .append(`<option value="">– Tanlang –</option>`);
      teachersList.forEach(t => {
        $sel.append(`<option value="${t.id}">
          ${t.firstName} ${t.lastName}
        </option>`);
      });
    });
  }

  // 2) Render table
  function renderTable() {
    let arr = groupsData.slice();
    // Sorting
    if (sortState.field) {
      arr.sort((a, b) => {
        let av = a[sortState.field], bv = b[sortState.field];
        if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
        if (av < bv) return -1 * sortState.dir;
        if (av > bv) return 1 * sortState.dir;
        return 0;
      });
    }

    const $b = $("#groupsTable tbody").empty();
    arr.forEach(g => {
      const tch = g.teacher;
      const teacherName = tch
        ? `${tch.firstName} ${tch.lastName}`
        : "–";
      $b.append(`
      <tr data-id="${g.id}">
        <td>${g.name}</td>
        <td>${teacherName}</td>
        <td>
          <button class="actBtn view-btn">👁️</button>
          <button class="actBtn edit-btn">✏️</button>
          <button class="actBtn del-btn">🗑️</button>
        </td>
      </tr>
    `);
    });
  }

  // 3) Load groups
  function loadGroups() {
    $.get(`${API_BASE}/groups`, data => {
      const vals = Array.isArray(data.$values) ? data.$values : [];

      // groupsData ni teacher obj bilan saqlaymiz
      groupsData = vals.map(g => ({
        id: g.id,
        name: g.name,
        teacher: g.teacher,        // to‘g‘ridan-to‘g‘ri teacher obyekti
        students: Array.isArray(g.students?.$values) ? g.students.$values : []
      }));

      renderTable();
    });
  }

  // 4) Table header click => sort
  $("#groupsTable thead th[data-sort]").click(function () {
    const f = $(this).data("sort");
    if (sortState.field === f) sortState.dir *= -1;
    else { sortState.field = f; sortState.dir = 1; }
    $("#groupsTable thead th").removeClass("asc desc");
    $(this).addClass(sortState.dir === 1 ? "asc" : "desc");
    renderTable();
  });

  // 5) Add / Edit form modal
  let editId = null;
  $("#btnAddGroup").click(() => {
    editId = null;
    $("#groupFormTitle").text("Yangi guruh");
    $("#groupForm")[0].reset();
    $("#groupFormModal").removeClass("hidden");
  });
  $("#groupFormCancel").click(() => {
    $("#groupFormModal").addClass("hidden");
  });

  $("#groupForm").submit(e => {
    e.preventDefault();
    $("#groupFormModal").addClass("hidden");
    const payload = {
      name: $("#gfName").val(),
      teacherId: $("#gfTeacher").val()
    };
    const url = editId
      ? `${API_BASE}/groups/${editId}`
      : `${API_BASE}/groups`;
    const method = editId ? "PUT" : "POST";
    showModal(
      editId ? "Guruhni yangilaysizmi?" : "Yangi guruh qo‘shasizmi?",
      () => {
        $.ajax({
          url, method,
          headers: { Authorization: `Bearer ${token}` },
          contentType: "application/json",
          data: JSON.stringify(payload),
          success() { loadGroups(); }
        });
      },
      () => $("#groupFormModal").removeClass("hidden")
    );
  });

  // 6) View group
  $("#groupsTable").on("click", ".view-btn", function () {
    const id = $(this).closest("tr").data("id");
    const g = groupsData.find(x => x.id === id);
    if (!g) return;

    // Guruh nomi
    $("#viewGName").text(g.name);

    // Ustoz
    if (g.teacher) {
      $("#viewGTeacher").text(`${g.teacher.firstName} ${g.teacher.lastName}`);
    } else {
      $("#viewGTeacher").text("–");
    }

    // **Yangi qo'shildi**: o'quvchilar soni
    const count = Array.isArray(g.students) ? g.students.length : 0;
    $("#viewGCount").text(count);

    // O‘quvchilar ro‘yxati: ism (telefon)
    const $ul = $("#viewGStudents").empty();
    g.students.forEach(s => {
      $ul.append(`<li>${s.firstName} ${s.lastName} (${s.phoneNumber})</li>`);
    });

    $("#groupViewModal").removeClass("hidden");
  });

  $("#groupViewClose").click(() => $("#groupViewModal").addClass("hidden"));


  // 7) Edit group
  $("#groupsTable").on("click", ".edit-btn", function () {
    editId = $(this).closest("tr").data("id");
    $("#groupFormModal").removeClass("hidden");
    $.get(`${API_BASE}/groups/${editId}`, g => {
      $("#groupFormTitle").text("Guruhni tahrirlash");
      $("#gfName").val(g.name);
      $("#gfTeacher").val(g.teacherId);
    });
  });

  // 8) Delete group
  $("#groupsTable").on("click", ".del-btn", function () {
    const id = $(this).closest("tr").data("id");
    showModal(
      "Guruhni oʻchirasizmi?",
      () => {
        $.ajax({
          url: `${API_BASE}/groups/${id}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          success() { loadGroups(); },
          error(xhr) {
            const msg = xhr.responseJSON?.Message || "Xatolik yuz berdi";
            showModal(msg, null, null);
          }
        });
      },
      null
    );
  });

  // 9) Boshlang‘ich yuklash
  loadTeachersDropdown();
  loadGroups();
});

// js/admins.js
$(function () {
  const API_BASE = "http://localhost:5070/api";
  const token = localStorage.getItem("jwtToken");
  if (!token) return (window.location.href = "../index.html");

  /* ——— HELPERS ——— */
  function parseJwt(t) {
    try {
      return JSON.parse(atob(t.split(".")[1]));
    } catch {
      return {};
    }
  }
  function showConfirm(msg, onYes, onNo) {
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
  function applyDark(on) {
    $("body").toggleClass("dark-mode", on);
    $("#themeToggle").text(on ? "☀️" : "🌙");
  }
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

  /* ——— UI INIT ——— */
  const me = parseJwt(token);
  $("#userName").text(me.username || "User");
  const darkStored = localStorage.getItem("darkMode") === "true";
  applyDark(darkStored);
  $("#themeToggle").on("click", () => {
    const now = !$("body").hasClass("dark-mode");
    applyDark(now);
    localStorage.setItem("darkMode", now);
  });
  $("#btnLogout")
    .off("click")
    .on("click", () => {
      showConfirm(
        "Chiqishni tasdiqlaysizmi?",
        () => {
          localStorage.removeItem("jwtToken");
          window.location.href = "../index.html";
        },
        null
      );
    });
  initSidebar();

  /* ——— STATE ——— */
  let admins = [],
    editId = null;

  /* ——— LOAD ADMINS ——— */
  function loadAdmins() {
    $.ajax({
      url: `${API_BASE}/users/admins`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      success(data) {
        const arr = Array.isArray(data.$values) ? data.$values : [];
        admins = arr.map((a) => ({
          id: a.id,
          username: a.username,
          isActive: a.isActive,
        }));
        renderTable(admins);
      },
      error() {
        showConfirm("Adminlar ro‘yxatini olishda xatolik.", null, null);
      },
    });
  }
  function renderTable(list) {
    const $b = $("#adminsTable tbody").empty();
    list.forEach((a) => {
      $b.append(`
        <tr data-id="${a.id}">
          <td>${a.username}</td>
          <td>${a.isActive ? "Faol" : "Faol emas"}</td>
          <td>
            <button class="actBtn edit-btn">✏️</button>
            <button class="actBtn del-btn">🗑️</button>
          </td>
        </tr>`);
    });
  }

  /* ——— SEARCH ——— */
  $("#adminSearch").on("input", function () {
    const q = $(this).val().toLowerCase().trim();
    renderTable(admins.filter((a) => a.username.toLowerCase().includes(q)));
  });

  /* ——— CREATE ADMIN ——— */
  $("#btnAddAdmin").on("click", () => {
    editId = null;
    $("#adminForm")[0].reset();
    $("#adminFormTitle").text("Yangi admin");
    $("#adminFormModal").removeClass("hidden");
  });
  $("#adminFormCancel").on("click", () =>
    $("#adminFormModal").addClass("hidden")
  );
  $("#adminForm").on("submit", function (e) {
    e.preventDefault();
    const payload = {
      username: $("#adminUsername").val(),
      password: $("#adminPassword").val(),
    };
    $("#adminFormModal").addClass("hidden");
    showConfirm(
      "Yangi admin saqlansinmi?",
      () => {
        $.ajax({
          url: `${API_BASE}/auth/register/admin`,
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          contentType: "application/json",
          data: JSON.stringify(payload),
          success() {
            loadAdmins();
          },
          error(xhr) {
            const msg = xhr.responseJSON?.Message || "Xatolik yuz berdi";
            showConfirm(
              msg,
              () => $("#adminFormModal").removeClass("hidden"),
              null
            );
          },
        });
      },
      null
    );
  });

  /* ——— EDIT ADMIN ——— */
  $("#adminsTable").on("click", ".edit-btn", function () {
    editId = $(this).closest("tr").data("id");
    $("#editAdminForm")[0].reset();
    //$("#adminFormTitle").text("Adminni tahrirlash"); // not relevant for edit modal
    $.ajax({
      url: `${API_BASE}/users/${editId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      success(admin) {
        $("#editUsername").val(admin.username);
        $("#editPassword").val(""); // clear password field for security
        $("#editAdminModal").removeClass("hidden");
      },
      error() {
        showAlert("Admin ma'lumotini yuklashda xatolik.");
      },
    });
  });
  $("#editAdminCancel").on("click", () =>
    $("#editAdminModal").addClass("hidden")
  );

  // Helper: call change username (PUT)
  function changeUsername(id, newUsername) {
    // console.log("Username: ", newUsername);

    return $.ajax({
      url: `${API_BASE}/users/${id}`,
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      contentType: "application/json",
      data: JSON.stringify({ username: newUsername }),
    });
  }

  function ajaxPromise(options) {
    return new Promise((resolve, reject) => {
      $.ajax(options)
        .done((data, textStatus, jqXHR) => resolve({ data, textStatus, jqXHR }))
        .fail((jqXHR, textStatus, errorThrown) => {
          reject({ jqXHR, textStatus, errorThrown });
        });
    });
  }

  function extractErrorMessage(err) {
    // err yakka obyekt bo'lishi mumkin: jqXHR, { jqXHR, ... }, yoki { status, responseText }, yoki string
    // 1) if we have normalized wrapper
    if (err && err.jqXHR) {
      const jq = err.jqXHR;
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

    // 2) if it's raw jqXHR
    if (err && err.responseJSON) {
      return (
        err.responseJSON.Message ||
        err.responseJSON.message ||
        JSON.stringify(err.responseJSON)
      );
    }
    if (err && err.responseText) {
      try {
        const parsed = JSON.parse(err.responseText);
        return parsed.Message || parsed.message || err.responseText;
      } catch {
        return err.responseText;
      }
    }

    // 3) if it's an object with status / text
    if (err && typeof err === "object") {
      if (err.status && err.statusText)
        return `${err.status} ${err.statusText}`;
      if (err.message) return err.message;
      // fallback: stringify
      try {
        return JSON.stringify(err);
      } catch {
        /* ignore */
      }
    }

    // 4) if it's a string or anything else
    if (typeof err === "string") return err;
    return "Noma'lum xatolik yuz berdi";
  }

  // Helper: call change password (PATCH)
  function changePassword(id, newPassword) {
    // console.log("Password: ", newPassword);

    // NOTE: adjust payload key if backend expects different DTO (e.g. { newPassword } or { Password })
    return $.ajax({
      url: `${API_BASE}/users/${id}/change-password`,
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      contentType: "application/json",
      data: JSON.stringify({ NewPassword: newPassword }),
    });
  }

  $("#editAdminForm").on("submit", function (e) {
    e.preventDefault();

    const newUsername = $("#editUsername").val()?.toString().trim();
    const newPassword = $("#editPassword").val()?.toString();

    // Basic validation
    if (
      (!newUsername || newUsername.length < 4) &&
      (!newPassword || newPassword.length < 6)
    ) {
      showAlert(
        "Iltimos, kamida 4 belgili username yoki kamida 6 belgili password kiriting."
      );
      return;
    }

    $("#editAdminModal").addClass("hidden");
    showConfirm(
      "O'zgartirishlarni saqlaysizmi?",
      () => {
        // Decide what to call: username only, password only, or both.
        const ops = [];

        if (newUsername && newUsername.length >= 4) {
          ops.push(changeUsername(editId, newUsername));
        }

        if (newPassword && newPassword.length >= 6) {
          ops.push(changePassword(editId, newPassword));
        }

        if (ops.length === 0) {
          showAlert("O'zgartirish uchun qiymat topilmadi.", () =>
            $("#editAdminModal").removeClass("hidden")
          );
          return;
        }

        // Execute ops in sequence to handle responses cleanly (username first, then password)
        // Convert jQuery promises to native Promise
        (async () => {
          try {
            for (let i = 0; i < ops.length; i++) {
              await ops[i];
            }
            showAlert("O'zgartirishlar saqlandi.", () => loadAdmins());
          } catch (err) {
            console.error("Edit operation failed (detailed):", err);
            const msg = extractErrorMessage(err);
            showConfirm(
              msg,
              () => $("#editAdminModal").removeClass("hidden"),
              null
            );
          }
        })();
      },
      () => $("#editAdminModal").removeClass("hidden")
    );
  });

  /* ——— DELETE ADMIN ——— */
  $("#adminsTable").on("click", ".del-btn", function () {
    const id = $(this).closest("tr").data("id");
    showConfirm(
      "Adminni o‘chirasizmi?",
      () => {
        $.ajax({
          url: `${API_BASE}/users/${id}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          success() {
            loadAdmins();
          },
          error(xhr) {
            const msg = xhr.responseJSON?.Message || "Xatolik yuz berdi";
            showConfirm(msg, null, null);
          },
        });
      },
      null
    );
  });

  /* ——— INITIAL LOAD ——— */
  loadAdmins();
});

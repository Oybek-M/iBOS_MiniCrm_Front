// js/admins.js
$(function () {
  const API_BASE = "http://crm.ibos.uz/api";
  const token = localStorage.getItem("jwtToken");
  if (!token) return (window.location.href = "../index.html");

  /* helpers */
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
        .done((data, textStatus, jqXHR) => resolve({ data, textStatus, jqXHR }))
        .fail((jqXHR, textStatus, errorThrown) =>
          reject({ jqXHR, textStatus, errorThrown })
        );
    });
  }

  function extractErrorMessage(err) {
    if (!err) return "Noma'lum xatolik";
    const jq = err.jqXHR || err;
    if (jq && jq.responseJSON) {
      const r = jq.responseJSON;
      if (r.Message || r.message) return r.Message || r.message;
      // ASP.NET Core ValidationProblemDetails
      if (r.errors) {
        // join first field messages
        const msgs = [];
        for (const k in r.errors) {
          if (Array.isArray(r.errors[k]))
            msgs.push(`${k}: ${r.errors[k].join(", ")}`);
        }
        if (msgs.length) return msgs.join(" | ");
      }
      return JSON.stringify(r);
    }
    if (jq && jq.responseText) {
      try {
        const p = JSON.parse(jq.responseText);
        return p.Message || p.message || jq.responseText;
      } catch {
        return jq.responseText;
      }
    }
    return err.statusText || "Xatolik yuz berdi";
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

  /* UI init */
  const me = parseJwt(token);
  $("#userName").text(me.username || "User");
  const darkStored = localStorage.getItem("darkMode") === "true";
  $("body").toggleClass("dark-mode", darkStored);
  $("#themeToggle").on("click", () => {
    const now = !$("body").hasClass("dark-mode");
    $("body").toggleClass("dark-mode", now);
    $("#themeToggle").text(now ? "☀️" : "🌙");
    localStorage.setItem("darkMode", now);
  });

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

  $("#btnLogout").on("click", () =>
    showConfirm(
      "Chiqishni tasdiqlaysizmi?",
      () => {
        localStorage.removeItem("jwtToken");
        window.location.href = "../index.html";
      },
      null
    )
  );

  /* state */
  let admins = [],
    editId = null,
    currentSearch = "";

  /* load admins */
  async function loadAdmins() {
    try {
      const res = await ajaxPromise({
        url: `${API_BASE}/users/admins`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      // support $values wrappers
      const arr = Array.isArray(res.data.$values)
        ? res.data.$values
        : Array.isArray(res.data)
        ? res.data
        : [];
      admins = arr.map((a) => ({
        id: a.id,
        username: a.username || a.userName || "",
        isActive: !!a.isActive,
      }));
      renderTable(admins);
    } catch (err) {
      console.error(err);
      showAlert("Adminlar ro'yxati olinmadi: " + extractErrorMessage(err));
    }
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
        </tr>
      `);
    });
  }

  $("#adminSearch").on("input", function () {
    currentSearch = $(this).val().toLowerCase().trim();
    renderTable(
      admins.filter((a) => a.username.toLowerCase().includes(currentSearch))
    );
  });

  /* CREATE admin */
  $("#btnAddAdmin").on("click", () => {
    editId = null;
    $("#adminForm")[0].reset();
    $("#adminFormTitle").text("Yangi admin");
    $("#adminFormModal").removeClass("hidden");
  });
  $("#adminFormCancel").on("click", () =>
    $("#adminFormModal").addClass("hidden")
  );

  $("#adminForm").on("submit", async function (e) {
    e.preventDefault();
    const payload = {
      firstName: String($("#adminFirstName").val() || "").trim(),
      lastName: String($("#adminLastName").val() || "").trim(),
      username: String($("#adminUsername").val() || "").trim(),
      password: String($("#adminPassword").val() || "").trim(),
    };

    // basic validation client-side
    // if (
    //   !payload.firstName ||
    //   !payload.lastName ||
    //   !payload.username ||
    //   !payload.username.length < 4 ||
    //   !payload.password ||
    //   payload.password.length < 6
    // ) {
    //   showAlert(
    //     "Iltimos, barcha maydonlarni to'ldiring."
    //   );
    //   return;
    // }

    $("#adminFormModal").addClass("hidden");
    showConfirm(
      "Yangi admin saqlansinmi?",
      async () => {
        try {
          await ajaxPromise({
            url: `${API_BASE}/auth/register/admin`,
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            contentType: "application/json",
            data: JSON.stringify(payload),
          });
          await loadAdmins();
        } catch (err) {
          console.error("Create admin error:", err);
          const msg = extractErrorMessage(err);
          showConfirm(
            msg,
            () => $("#adminFormModal").removeClass("hidden"),
            null
          );
        }
      },
      () => $("#adminFormModal").removeClass("hidden")
    );
  });

  /* EDIT open */
  $("#adminsTable").on("click", ".edit-btn", async function () {
    editId = $(this).closest("tr").data("id");
    try {
      const res = await ajaxPromise({
        url: `${API_BASE}/users/${editId}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const u = res.data;
      $("#editFirstName").val(u.firstName || "");
      $("#editLastName").val(u.lastName || "");
      $("#editUsername").val(u.username || u.userName || "");
      // $("#editPhoneNumber").val(u.phoneNumber || u.PhoneNumber);
      $("#editOldPassword").val("");
      $("#editNewPassword").val("");
      $("#editAdminModal").removeClass("hidden");
    } catch (err) {
      console.error(err);
      showAlert("Admin ma'lumotlari olinmadi: " + extractErrorMessage(err));
    }
  });

  $("#editAdminCancel").on("click", () =>
    $("#editAdminModal").addClass("hidden")
  );

  /* EDIT submit (PUT /users/{id}) */
  $("#editAdminForm").on("submit", async function (e) {
    e.preventDefault();
    if (!editId) {
      showAlert("Tahrirlash uchun ID topilmadi.");
      return;
    }

    const dto = {
      firstName: String($("#editFirstName").val() || "").trim(),
      lastName: String($("#editLastName").val() || "").trim(),
      username: String($("#editUsername").val() || "").trim(),
      // phoneNumber: String($("#editPhoneNumber").val || "").trim()
    };

    const oldP = String($("#editOldPassword").val() || "").trim();
    const newP = String($("#editNewPassword").val() || "").trim();

    if (
      !dto.firstName ||
      !dto.lastName ||
      !dto.username ||
      dto.username.length < 4
    ) {
      showAlert("Ism, familya va kamida 4 belgili username kiriting.");
      return;
    }

    if (oldP && newP) {
      if (oldP.length < 6 || newP.length < 6) {
        showAlert("Parollar kamida 6 belgidan bo'lishi kerak.");
        return;
      }
      dto.oldPassword = oldP;
      dto.newPassword = newP;
    }

    $("#editAdminModal").addClass("hidden");
    showConfirm(
      "O'zgartirishlarni saqlaysizmi?",
      async () => {
        try {
          await ajaxPromise({
            url: `${API_BASE}/users/${editId}`,
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            contentType: "application/json",
            data: JSON.stringify(dto),
          });
          showAlert("O'zgartirishlar saqlandi.", () => loadAdmins());
        } catch (err) {
          console.error("Update admin error:", err);
          const msg = extractErrorMessage(err);
          showConfirm(
            msg,
            () => $("#editAdminModal").removeClass("hidden"),
            null
          );
        }
      },
      () => $("#editAdminModal").removeClass("hidden")
    );
  });

  /* DELETE */
  $("#adminsTable").on("click", ".del-btn", function () {
    const id = $(this).closest("tr").data("id");
    showConfirm(
      "Adminni o'chirasizmi?",
      async () => {
        try {
          await ajaxPromise({
            url: `${API_BASE}/users/${id}`,
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          await loadAdmins();
        } catch (err) {
          console.error(err);
          showAlert("O'chirishda xatolik: " + extractErrorMessage(err));
        }
      },
      null
    );
  });

  /* initial load */
  loadAdmins();
});

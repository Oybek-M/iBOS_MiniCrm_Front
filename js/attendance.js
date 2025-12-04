// js/attendances.js (refactored)
// Requires: jQuery, existing attendances.html with expected element IDs
$(function () {
  const API_BASE = "http://crm.ibos.uz/api";
  const token = localStorage.getItem("jwtToken");
  if (!token) return (window.location.href = "../index.html");

  /* -------------------- Helpers -------------------- */
  function parseJwt(t) {
    try {
      return JSON.parse(atob(t.split(".")[1]));
    } catch {
      return {};
    }
  }

  // Wrap $.ajax into a Promise that resolves with {data, textStatus, jqXHR}
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

  // Dereference $values / $ref style responses (safe)
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

  // Convert ISO date to 'yyyy-MM-ddTHH:mm' for datetime-local
  function toLocalDatetimeInput(isoDate) {
    const d = isoDate ? new Date(isoDate) : new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const yyyy = d.getFullYear(),
      MM = pad(d.getMonth() + 1),
      dd = pad(d.getDate());
    const hh = pad(d.getHours()),
      mm = pad(d.getMinutes());
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  }

  /* -------------------- State -------------------- */
  let attendances = [];
  let studentsMap = {}; // id -> student object
  let teachers = []; // list for select (id, name)
  let groups = []; // list for selects (id, name, teacherId)
  let editId = null;
  let filterGroup = "";
  let filterStatus = "";
  let searchTerm = "";

  /* -------------------- UI Init -------------------- */
  const me = parseJwt(token);
  $("#userName").text(me.username || "User");
  applyDark(localStorage.getItem("darkMode") === "true");
  $("#themeToggle").on("click", () => {
    const now = !$("body").hasClass("dark-mode");
    applyDark(now);
    localStorage.setItem("darkMode", now);
  });
  $("#btnLogout").on("click", () => {
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

  /* ——— DETERMINE ROLE & FETCH ——— */
  let isSuper = false;
  $.ajax({
    url: `${API_BASE}/users/role`,
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
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

  /* -------------------- Load support lists -------------------- */
  function loadGroups() {
    return ajaxPromise({
      url: `${API_BASE}/groups`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const arr = derefListWrapper(r.data);
        groups = arr.map((g) => ({
          id: g.id,
          name: g.name,
          teacherId: g.teacherId,
        }));
        const $sel = $("#filterGroup")
          .empty()
          .append(`<option value="">Hammasi (guruh bo'yicha)</option>`);
        groups.forEach((g) =>
          $sel.append(`<option value="${g.id}">${g.name}</option>`)
        );
      })
      .catch((err) => {
        console.error(err);
        showAlert("Guruhlar olinmadi");
      });
  }

  function loadStudentsForSelect() {
    return ajaxPromise({
      url: `${API_BASE}/students`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const arr = derefListWrapper(r.data);
        // normalize structure (like earlier student page)
        const normalized = [];
        const idMap = {};
        arr.forEach((item) => {
          if (item.$id && item.id) idMap[item.$id] = item;
        });
        arr.forEach((item) => {
          if (item.id) normalized.push(item);
          const nested = item.group?.students?.$values || [];
          nested.forEach((n) => {
            const real = n.$ref ? idMap[n.$ref] : n;
            if (real && real.id && !normalized.find((x) => x.id === real.id))
              normalized.push(real);
          });
        });
        studentsMap = {};
        const $sel = $("#attStudent")
          .empty()
          .append('<option value="">- Tanlang -</option>');
        normalized.forEach((s) => {
          studentsMap[s.id] = s;
          $sel.append(
            `<option value="${s.id}">${s.firstName} ${s.lastName} (${
              s.phoneNumber || ""
            })</option>`
          );
        });
      })
      .catch((err) => {
        console.error(err);
        showAlert("O'quvchilar olinmadi");
      });
  }

  function loadTeachersForSelect() {
    return ajaxPromise({
      url: `${API_BASE}/teachers`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const arr = derefListWrapper(r.data);
        teachers = arr.map((t) => ({
          id: t.id,
          name:
            t.fullName ||
            t.username ||
            `${t.firstName || ""} ${t.lastName || ""}`,
        }));
        const $sel = $("#attTeacher")
          .empty()
          .append('<option value="">- Tanlang -</option>');
        teachers.forEach((t) =>
          $sel.append(`<option value="${t.id}">${t.name}</option>`)
        );
      })
      .catch((err) => {
        console.error(err);
        showAlert("O'qituvchilar olinmadi");
      });
  }

  /* -------------------- Load attendances -------------------- */
  function loadAttendances() {
    const url = filterGroup
      ? `${API_BASE}/attendances/group/${filterGroup}`
      : `${API_BASE}/attendances`;
    return ajaxPromise({
      url,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const arr = derefListWrapper(r.data);
        attendances = arr.map((a) => ({
          id: a.id,
          studentId: a.studentId,
          student: a.student && (a.student.$ref ? null : a.student),
          teacherId: a.teacherId,
          date: a.date,
          status: a.status,
          note: a.note,
        }));
        renderTable();
      })
      .catch((err) => {
        console.error(err);
        showAlert("Davomatlarni olishda xatolik");
      });
  }

  /* -------------------- Render table -------------------- */
  function statusText(s) {
    if (s === 1) return "Keldi";
    if (s === 2) return "Kelmadi";
    if (s === 3) return "Kech qoldi";
    return "-";
  }

  function renderTable() {
    let arr = attendances.slice();
    if (filterStatus)
      arr = arr.filter((a) => String(a.status) === String(filterStatus));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      arr = arr.filter((a) => {
        const st =
          (studentsMap[a.studentId] &&
            `${studentsMap[a.studentId].firstName} ${
              studentsMap[a.studentId].lastName
            }`) ||
          (a.student && `${a.student.firstName} ${a.student.lastName}`) ||
          "";
        const phone =
          (studentsMap[a.studentId] && studentsMap[a.studentId].phoneNumber) ||
          (a.student && a.student.phoneNumber) ||
          "";
        return st.toLowerCase().includes(q) || phone.toLowerCase().includes(q);
      });
    }

    const $body = $("#attTable tbody").empty();
    arr.forEach((a) => {
      const sname = studentsMap[a.studentId]
        ? `${studentsMap[a.studentId].firstName} ${
            studentsMap[a.studentId].lastName
          }`
        : a.student
        ? `${a.student.firstName} ${a.student.lastName}`
        : a.studentId;
      const tname =
        teachers.find((t) => t.id === a.teacherId)?.name || a.teacherId || "–";
      const dateStr = a.date ? new Date(a.date).toLocaleString() : "–";
      $body.append(`
        <tr data-id="${a.id}">
          <td>${sname}</td>
          <td>${tname}</td>
          <td>${dateStr}</td>
          <td>${statusText(a.status)}</td>
          <td>${a.note || ""}</td>
          <td>
            <button class="actBtn view-btn">👁️</button>
            <button class="actBtn edit-btn">✏️</button>
            <button class="actBtn del-btn">🗑️</button>
          </td>
        </tr>
      `);
    });
  }

  /* -------------------- UI events (filters) -------------------- */
  $("#filterGroup").on("change", function () {
    filterGroup = $(this).val();
    loadAttendances();
  });
  $("#filterStatus").on("change", function () {
    filterStatus = $(this).val();
    renderTable();
  });
  $("#attendanceSearch").on("input", function () {
    searchTerm = $(this).val().trim();
    renderTable();
  });

  /* -------------------- Modal: Add / Bulk flow -------------------- */

  // When opening Add modal: reset form, ensure groups loaded, default date, clear group students
  $("#btnAddAttendance").on("click", async () => {
    editId = null;
    $("#attendanceFormTitle").text("Yangi davomat yozuvi");
    $("#attendanceForm")[0].reset();
    $("#groupStudentsContainer").empty();
    $("#attTeacher").val("").prop("disabled", true);
    $("#attDate").val(toLocalDatetimeInput());
    // Populate groups dropdown inside modal (attGroup)
    await loadGroupsForModal(); // defined below
    $("#attendanceFormModal").removeClass("hidden");
  });

  $("#attendanceFormCancel").on("click", () =>
    $("#attendanceFormModal").addClass("hidden")
  );

  // Load groups into modal-specific select (#attGroup)
  function loadGroupsForModal() {
    return ajaxPromise({
      url: `${API_BASE}/groups`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const arr = derefListWrapper(r.data);
        groups = arr.map((g) => ({
          id: g.id,
          name: g.name,
          teacherId: g.teacherId,
        }));
        const $sel = $("#attGroup")
          .empty()
          .append('<option value="">- Tanlang -</option>');
        groups.forEach((g) =>
          $sel.append(`<option value="${g.id}">${g.name}</option>`)
        );
      })
      .catch((err) => {
        console.error(err);
        showAlert("Guruhlar yuklanmadi");
      });
  }

  // Render students list for a chosen group (rows with radio buttons)
  function renderGroupStudents(list) {
    const $c = $("#groupStudentsContainer").empty();
    if (!list || list.length === 0) {
      $c.append("<p>Guruhda o'quvchi topilmadi.</p>");
      return;
    }
    list.forEach((s) => {
      const id = s.id || s.$id || s.studentId;
      const name = `${s.firstName || ""} ${s.lastName || ""}`.trim();
      const phone = s.phoneNumber ? ` (${s.phoneNumber})` : "";
      const row = $(`
        <div class="student-row" data-id="${id}" style="display:flex;align-items:center;gap:.5rem;padding:.25rem;border-bottom:1px solid #f1f1f1">
          <div style="flex:1"><strong>${name}</strong>${phone}</div>
          <div style="white-space:nowrap;display:grid;justify-items:endl">
            <label style="margin-right:.4rem"><input type="radio" name="st-${id}" value="1" checked> Keldi</label>
            <label style="margin-right:.4rem"><input type="radio" name="st-${id}" value="2"> Kelmadi</label>
            <label><input type="radio" name="st-${id}" value="3"> Kechqoldi</label>
          </div>
        </div>
      `);
      $c.append(row);
    });
  }

  // Try to load group students via "students/groups/{id}", fallback to students and filter
  // Replace your loadGroupStudents with this robust version:
  function loadGroupStudents(gid) {
    return ajaxPromise({
      url: `${API_BASE}/students/group/${gid}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        // normalize response to array of concrete student objects
        const list = normalizeRefResponse(r.data);
        renderGroupStudents(list);
      })
      .catch(() => {
        // fallback: use all students and filter by groupId (existing logic)
        return ajaxPromise({
          url: `${API_BASE}/students`,
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => {
            const arr = derefListWrapper(r.data); // your existing derefListWrapper can handle students endpoint
            const normalized = [];
            const idMap = {};
            arr.forEach((item) => {
              if (item.$id && item.id) idMap[item.$id] = item;
            });
            arr.forEach((item) => {
              if (item.id) normalized.push(item);
              const nested = item.group?.students?.$values || [];
              nested.forEach((n) => {
                const real = n.$ref ? idMap[n.$ref] : n;
                if (
                  real &&
                  real.id &&
                  !normalized.find((x) => x.id === real.id)
                )
                  normalized.push(real);
              });
            });
            const filtered = normalized.filter(
              (s) => s.groupId === gid || (s.group && s.group.id === gid)
            );
            renderGroupStudents(filtered);
          })
          .catch((e) => {
            console.error(e);
            showAlert("Guruhdagi o'quvchilar olinmadi");
          });
      });
  }
  // Helper: recursively collect nodes that have $id and an id property
  function collectNodesWithId(node, idMap) {
    if (!node || typeof node !== "object") return;
    // if this node itself has $id and id -> store it
    if (node.$id && node.id) {
      idMap[node.$id] = node;
    }
    // also if it's an array, iterate
    if (Array.isArray(node)) {
      node.forEach((n) => collectNodesWithId(n, idMap));
      return;
    }
    // iterate object props
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === "object") collectNodesWithId(v, idMap);
    }
  }
  // Normalize response that has $values / $ref patterns to an array of concrete objects
  function normalizeRefResponse(resp) {
    // resp may be { $values: [...] } or raw array
    const raw = Array.isArray(resp) ? resp : (resp && resp.$values) || [];
    // build id map by scanning entire response (so nested items are included)
    const idMap = {};
    collectNodesWithId(resp, idMap);

    // map raw entries: if item is $ref -> replace with idMap ref; else take item
    const result = raw
      .map((item) => {
        if (!item) return null;
        if (item.$ref) {
          return idMap[item.$ref] || null;
        }
        // if item itself is a $ref-like string/object without $id but has id -> return as-is
        return item;
      })
      .filter(Boolean);

    // Some referenced items may only exist nested (not present top-level) — ensure we include those too:
    // Find nested arrays like group.students.$values and include their concrete objects if any are missing.
    // Scan resp for arrays named "$values" and add items resolved via idMap if they aren't yet in result.
    function collectValuesArrays(node) {
      if (!node || typeof node !== "object") return [];
      let out = [];
      if (node.$values && Array.isArray(node.$values))
        out = out.concat(node.$values);
      for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object")
          out = out.concat(collectValuesArrays(v));
      }
      return out;
    }
    const nestedValues = collectValuesArrays(resp);
    nestedValues.forEach((nv) => {
      if (nv && nv.$ref) {
        const real = idMap[nv.$ref];
        if (real && !result.find((x) => x.id === real.id)) result.push(real);
      } else if (nv && nv.id && !result.find((x) => x.id === nv.id)) {
        result.push(nv);
      }
    });

    // deduplicate by id (keep first occurrence)
    const seen = new Set();
    const unique = [];
    result.forEach((item) => {
      const id = item.id || (item.$id ? item.$id : null);
      if (id && !seen.has(id)) {
        seen.add(id);
        unique.push(item);
      } else if (!id) {
        unique.push(item); // keep items without id (rare)
      }
    });

    return unique;
  }

  // When group select in modal changes
  $("#attGroup").on("change", function () {
    const gid = $(this).val();
    if (!gid) {
      $("#groupStudentsContainer").empty();
      $("#attTeacher").val("").prop("disabled", true);
      return;
    }
    const group = groups.find((g) => g.id === gid);
    // set teacher if known
    if (group && group.teacherId) {
      ajaxPromise({
        url: `${API_BASE}/teachers/${group.teacherId}`,
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          const t = r.data;
          $("#attTeacher")
            .empty()
            .append(
              `<option value="${t.id}">${
                t.fullName || t.username || t.firstName + " " + t.lastName
              }</option>`
            );
          $("#attTeacher").val(t.id).prop("disabled", false);
        })
        .catch(() => {
          $("#attTeacher").val(group.teacherId).prop("disabled", false);
        });
    } else {
      $("#attTeacher").val("").prop("disabled", false);
    }
    loadGroupStudents(gid);
  });

  /* mass-set buttons (Barchani Keldi / Kelmadi / Kech) */
  $("#setAllPresent").on("click", () => {
    $("#groupStudentsContainer .student-row").each(function () {
      const id = $(this).data("id");
      $(this).find(`input[name="st-${id}"][value="1"]`).prop("checked", true);
    });
  });
  $("#setAllAbsent").on("click", () => {
    $("#groupStudentsContainer .student-row").each(function () {
      const id = $(this).data("id");
      $(this).find(`input[name="st-${id}"][value="2"]`).prop("checked", true);
    });
  });
  $("#setAllLate").on("click", () => {
    $("#groupStudentsContainer .student-row").each(function () {
      const id = $(this).data("id");
      $(this).find(`input[name="st-${id}"][value="3"]`).prop("checked", true);
    });
  });

  /* -------------------- Submit handler (single or bulk) -------------------- */
  $("#attendanceForm").on("submit", function (e) {
    e.preventDefault();

    // If groupStudentsContainer has children -> treat as bulk
    const studentRows = $("#groupStudentsContainer .student-row");
    const dateIso = new Date($("#attDate").val()).toISOString();
    const commonNote = $("#attNote").val() || "";
    const teacherIdVal = $("#attTeacher").val();

    if (studentRows.length > 0) {
      // Bulk mode
      const payloads = [];
      studentRows.each(function () {
        const sid = $(this).data("id");
        const val = $(this).find(`input[name="st-${sid}"]:checked`).val();
        payloads.push({
          studentId: sid,
          teacherId: teacherIdVal || "",
          date: dateIso,
          status: parseInt(val, 10),
          note: commonNote,
        });
      });
      if (payloads.length === 0) {
        showAlert("Guruhda o'quvchi topilmadi.");
        return;
      }
      $("#attendanceFormModal").addClass("hidden");
      showConfirm(
        "Barchasini yozishni tasdiqlaysizmi?",
        () => {
          const ops = payloads.map((p) =>
            ajaxPromise({
              url: `${API_BASE}/attendances`,
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              contentType: "application/json",
              data: JSON.stringify(p),
            })
          );
          Promise.allSettled(ops)
            .then((results) => {
              const succeeded = results.filter(
                (r) => r.status === "fulfilled"
              ).length;
              const failed = results.filter((r) => r.status === "rejected");
              if (failed.length === 0) {
                showAlert(
                  `Barchasi muvaffaqiyatli saqlandi (${succeeded}).`,
                  () => loadAttendances()
                );
              } else {
                const firstErr = failed[0].reason;
                const msg =
                  extractErrorMessage(firstErr) ||
                  `Ba'zi yozuvlar saqlanmadi. Muvaffaqiyat: ${succeeded}, xato: ${failed.length}`;
                showConfirm(
                  msg,
                  () => {
                    loadAttendances();
                  },
                  null
                );
              }
            })
            .catch((err) => {
              console.error(err);
              showAlert("Server bilan aloqa xatosi.");
            });
        },
        () => {
          $("#attendanceFormModal").removeClass("hidden");
        }
      );
      return;
    }

    // Single mode (old behaviour) — use attStudent value
    const payload = {
      studentId: $("#attStudent").val(),
      teacherId: teacherIdVal,
      date: dateIso,
      status: parseInt($("#attStatus").val(), 10),
      note: $("#attNote").val(),
    };
    if (!payload.studentId || !payload.teacherId) {
      showAlert("O'quvchi va o'qituvchi tanlanishi shart.");
      return;
    }
    $("#attendanceFormModal").addClass("hidden");
    showConfirm(
      "Davomat saqlansinmi?",
      () => {
        const url = editId
          ? `${API_BASE}/attendances/${editId}`
          : `${API_BASE}/attendances`;
        const method = editId ? "PUT" : "POST";
        ajaxPromise({
          url,
          method,
          headers: { Authorization: `Bearer ${token}` },
          contentType: "application/json",
          data: JSON.stringify(payload),
        })
          .then(() => {
            loadAttendances();
          })
          .catch((err) => {
            console.error(err);
            showAlert(extractErrorMessage(err));
          });
      },
      () => $("#attendanceFormModal").removeClass("hidden")
    );
  });

  /* -------------------- View / Edit / Delete handlers -------------------- */
  $("#attTable").on("click", ".view-btn", function () {
    const id = $(this).closest("tr").data("id");
    ajaxPromise({
      url: `${API_BASE}/attendances/${id}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const a = r.data;
        const s = studentsMap[a.studentId] || a.student || {};
        const t = teachers.find((t) => t.id === a.teacherId) || {};
        $("#viewAStudent").text(`${s.firstName || ""} ${s.lastName || ""}`);
        $("#viewATeacher").text(t.name || a.teacherId);
        $("#viewADate").text(new Date(a.date).toLocaleString());
        $("#viewAStatus").text(statusText(a.status));
        $("#viewANote").text(a.note || "");
        $("#attendanceViewModal").removeClass("hidden");
      })
      .catch((err) => {
        console.error(err);
        showAlert(extractErrorMessage(err));
      });
  });
  $("#attendanceViewClose").on("click", () =>
    $("#attendanceViewModal").addClass("hidden")
  );

  $("#attTable").on("click", ".edit-btn", function () {
    editId = $(this).closest("tr").data("id");
    $("#attendanceFormTitle").text("Davomatni tahrirlash");
    // For edit we use single-item form (attStudent select)
    ajaxPromise({
      url: `${API_BASE}/attendances/${editId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        const a = r.data;
        $("#groupStudentsContainer").empty(); // ensure no bulk rows
        $("#attStudent").val(a.studentId);
        $("#attTeacher").val(a.teacherId).prop("disabled", false);
        $("#attDate").val(toLocalDatetimeInput(a.date));
        $("#attStatus").val(String(a.status));
        $("#attNote").val(a.note || "");
        $("#attendanceFormModal").removeClass("hidden");
      })
      .catch((err) => {
        console.error(err);
        showAlert(extractErrorMessage(err));
      });
  });

  $("#attTable").on("click", ".del-btn", function () {
    const id = $(this).closest("tr").data("id");
    showConfirm(
      "Davomat yozuvini o'chirasizmi?",
      () => {
        ajaxPromise({
          url: `${API_BASE}/attendances/${id}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(() => loadAttendances())
          .catch((err) => {
            console.error(err);
            showAlert(extractErrorMessage(err));
          });
      },
      null
    );
  });

  /* -------------------- Initial load -------------------- */
  // load support lists and main data
  Promise.all([loadGroups(), loadStudentsForSelect(), loadTeachersForSelect()])
    .then(() => loadAttendances())
    .catch(() => loadAttendances());
});

// js/dashboard.js
$(function () {
	const API_BASE = "http://crm.ibos.uz/api";
	const token = localStorage.getItem("jwtToken");
	if (!token) {
		window.location.href = "../index.html";
		return;
	}

	/* ——— HELPERS ——— */
	function parseJwt(t) {
		try { return JSON.parse(atob(t.split(".")[1])); }
		catch { return {}; }
	}
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
	function applyDark(on) {
		$("body").toggleClass("dark-mode", on);
		$("#themeToggle").text(on ? "☀️" : "🌙");
	}
	function initSidebar() {
		$("#sidebarToggle").on("click", () => {
			$(".sidebar").toggleClass("open");
			$("#sidebarToggle").toggleClass("lightColor");
			$(".main-content").toggleClass("shifted");
		});
		$(window).on("resize", () => {
			if (window.innerWidth >= 993) {
				$(".sidebar, .main-content").removeClass("open shifted");
				$("#sidebarToggle").removeClass("lightColor");
			}
		});
	}

	/* ——— NORMALIZE NESTED STUDENTS ——— */
	function normalizeStudents(apiValues) {
		const raw = apiValues || [], idMap = {};
		raw.forEach(item => {
			if (item.$id && item.id) idMap[item.$id] = item;
		});
		const result = [];
		raw.forEach(item => {
			if (!item.id) return;
			result.push({ ...item, __group: item.group });
			(item.group?.students?.$values || []).forEach(n => {
				const real = n.$ref ? idMap[n.$ref] : n;
				if (real?.id && !result.find(r => r.id === real.id)) {
					result.push({ ...real, __group: item.group });
				}
			});
		});
		return result;
	}

	/* ——— STATE FOR UNPAID TABLE ——— */
	let unpaidData = [];
	let unpaidSort = { field: null, dir: 1 };
	let unpaidSearchTerm = "";

	// Search event
	$("#unpaidSearch").on("input", () => {
		unpaidSearchTerm = $("#unpaidSearch").val().trim().toLowerCase();
		renderUnpaidTable();
	});

	// Sort event
	$("#unpaidTable thead").on("click", "th[data-sort]", function () {
		const field = $(this).data("sort");
		if (unpaidSort.field === field) unpaidSort.dir *= -1;
		else { unpaidSort.field = field; unpaidSort.dir = 1; }
		$("#unpaidTable thead th").removeClass("asc desc");
		$(this).addClass(unpaidSort.dir > 0 ? "asc" : "desc");
		renderUnpaidTable();
	});

	function renderUnpaidTable() {
		let arr = unpaidData.slice();
		// Search
		if (unpaidSearchTerm) {
			arr = arr.filter(s =>
				s.firstName.toLowerCase().includes(unpaidSearchTerm) ||
				s.lastName.toLowerCase().includes(unpaidSearchTerm) ||
				s.phoneNumber.toLowerCase().includes(unpaidSearchTerm) ||
				s.groupName.toLowerCase().includes(unpaidSearchTerm)
			);
		}
		// Sort
		if (unpaidSort.field) {
			arr.sort((a, b) => {
				let av = a[unpaidSort.field], bv = b[unpaidSort.field];
				if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
				if (av < bv) return -1 * unpaidSort.dir;
				if (av > bv) return 1 * unpaidSort.dir;
				return 0;
			});
		}
		// Draw
		const $tb = $("#unpaidTable tbody").empty();
		arr.forEach(s => {
			$tb.append(`
        <tr>
          <td>${s.firstName}</td>
          <td>${s.lastName}</td>
          <td>${s.phoneNumber}</td>
          <td>${s.groupName}</td>
        </tr>`);
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
	$("#btnLogout").off("click").on("click", () =>
		showModal("Chiqishni tasdiqlaysizmi?", () => {
			localStorage.removeItem("jwtToken");
			window.location.href = "../index.html";
		}, null)
	);
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
		}
	});

	/* ——— SUPERADMIN: ALL CARDS ——— */
	/* ——— SUPERADMIN: ALL CARDS ——— */
	function fetchSuperStats() {
		$.when(
			$.get(`${API_BASE}/students`),
			$.get(`${API_BASE}/groups`),
			$.get(`${API_BASE}/teachers`),
			$.get(`${API_BASE}/users/admins`),
			$.get(`${API_BASE}/students/filter-by-payment-status?status=1`),
			$.get(`${API_BASE}/payments/total-collected-amount`)
		).done((sR, gR, tR, aR, pR, totR) => {
			const flat = normalizeStudents(sR[0].$values);
			const totalS = flat.length;
			$("#studentsCount, #studentsCountDup").text(totalS);
			$("#groupsCount").text((gR[0].$values || []).length);
			$("#teachersCount").text((tR[0].$values || []).length);
			$("#adminsCount").text((aR[0].$values || []).length);

			// Paid count & percent (unchanged)
			const paidBody = pR[0];
			const paidCount = typeof paidBody.count === "number"
				? paidBody.count
				: Array.isArray(paidBody.students?.$values)
					? paidBody.students.$values.length
					: 0;
			$("#paidCount").text(paidCount);
			$("#paidPercent").text(totalS ? Math.round(paidCount / totalS * 100) : 0);

			// === BU YERDA O‘ZGARTIRILDI: to‘liq response aniqligi ===
			const totBody = totR[0];
			// Agar server totalAmount ni son sifatida qaytarsa, o‘sha; aks holda 0
			const totalAmt = typeof totBody.totalAmount === "number"
				? totBody.totalAmount
				: 0;
			$("#totalCollected").text(totalAmt.toFixed(2) + " UZS");
			// =================================================================

			$(".stats-grid").show();
			$("#unpaidSection").addClass("hidden");
		}).fail(() => {
			showModal("Statistikani olishda xatolik yuz berdi.", null, null);
		});
	}


	/* ——— ADMIN: ONLY UNPAID LIST ——— */
	function fetchAdminStats() {
		$.when(
			$.get(`${API_BASE}/students`),
			$.get(`${API_BASE}/students/filter-by-payment-status?status=1`)
		).done((sR, pR) => {
			const flat = normalizeStudents(sR[0].$values);
			const totalS = flat.length;
			const paidBody = pR[0];
			const paidCount = Array.isArray(paidBody.students?.$values)
				? paidBody.students.$values.length
				: (typeof paidBody.count === "number" ? paidBody.count : 0);

			const unpaidCount = totalS - paidCount;
			$("#unpaidCount").text(unpaidCount);

			$(".stats-grid").hide();
			$("#unpaidSection").removeClass("hidden");

			unpaidData = flat
				.filter(s => s.paymentStatus === 2)
				.map(s => ({
					firstName: s.firstName,
					lastName: s.lastName,
					phoneNumber: s.phoneNumber,
					groupName: s.__group?.name || "–"
				}));
			renderUnpaidTable();
		}).fail(() => {
			showModal("To'lov qilmagan o'quvchilarni olishda xatolik yuz berdi.", null, null);
		});
	}
});

// js/main.js
$(function () {
  const API_BASE = "http://crm.ibos.uz/api";

  /**
   * JWT tokenni localStorage'dan olish
   * @returns {string|null}
   */
  function getToken() {
    return localStorage.getItem('jwtToken');
  }

  /**
   * Login sahifasi nomlari (public sahifalar)
   */
  const PUBLIC_PAGES = ['index.html', '../index.html'];

  /**
   * Joriy sahifani olish
   * @returns {string}
   */
  function getCurrentPage() {
    return window.location.pathname.split('/').pop();
  }

  /**
   * Agar foydalanuvchi login qilmagan bo‘lsa, login sahifasiga yo‘naltiramiz
   */
  function redirectIfNotAuthenticated() {
    const token = getToken();
    const currentPage = getCurrentPage();

    if (!PUBLIC_PAGES.includes(currentPage) && !token) {
      window.location.href = '../index.html';
    }
  }

  /**
   * Global AJAX sozlamalar — har bir requestga token qo‘shish
   */
  function setupAjaxHeaders() {
    $.ajaxSetup({
      beforeSend: function (xhr) {
        const token = getToken();
        if (token) {
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        }
      },
      contentType: 'application/json'
    });
  }

  // === INIT ===
  redirectIfNotAuthenticated();
  setupAjaxHeaders();

  // API_BASE ni kerak joyda export qilib olish uchun global qilish mumkin:
  window.API_BASE = API_BASE;
});

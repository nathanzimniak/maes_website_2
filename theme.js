(function () {
  'use strict';

  var storageKey = 'maes-theme';
  var root = document.documentElement;
  var systemTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var moonIconPath = 'M22.81 15.95a9.35 9.35 0 0 1-12.36-12.36A9.9 9.9 0 1 0 22.81 15.95Z';
  var sunIconPath = 'M12 4.5V2m0 20v-2.5M4.5 12H2m20 0h-2.5M6.7 6.7 4.93 4.93m14.14 14.14-1.77-1.77M17.3 6.7l1.77-1.77M4.93 19.07 6.7 17.3M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z';
  var themeToggle = null;

  function getSavedTheme() {
    try {
      var theme = window.localStorage.getItem(storageKey);
      return theme === 'dark' || theme === 'light' ? theme : null;
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch (error) {
      // The theme remains active for the current page when storage is unavailable.
    }
  }

  function getSystemTheme() {
    return systemTheme && systemTheme.matches ? 'dark' : 'light';
  }

  function updateToggle(theme) {
    if (!themeToggle) return;

    var isDark = theme === 'dark';
    var label = isDark ? 'Activer le mode clair' : 'Activer le mode sombre';
    var iconPath = themeToggle.querySelector('path');

    themeToggle.setAttribute('aria-label', label);
    themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    themeToggle.setAttribute('title', label);
    if (iconPath) iconPath.setAttribute('d', isDark ? sunIconPath : moonIconPath);
  }

  function announceThemeChange(theme) {
    var event;

    if (typeof window.CustomEvent === 'function') {
      event = new window.CustomEvent('maes:themechange', { detail: { theme: theme } });
    } else {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('maes:themechange', false, false, { theme: theme });
    }

    window.dispatchEvent(event);
  }

  function applyTheme(theme, persist, announce) {
    root.setAttribute('data-theme', theme);
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add('theme-' + theme);
    updateToggle(theme);

    if (persist) saveTheme(theme);
    if (announce) announceThemeChange(theme);
  }

  function bindToggle() {
    themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle || themeToggle.getAttribute('data-theme-bound') === 'true') return;

    themeToggle.setAttribute('data-theme-bound', 'true');
    updateToggle(root.getAttribute('data-theme') || getSystemTheme());
    themeToggle.addEventListener('click', function () {
      var nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true, true);
    });
  }

  function handleSystemThemeChange(event) {
    if (!getSavedTheme()) applyTheme(event.matches ? 'dark' : 'light', false, true);
  }

  applyTheme(getSavedTheme() || getSystemTheme(), false, false);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle);
  } else {
    bindToggle();
  }

  if (systemTheme) {
    if (typeof systemTheme.addEventListener === 'function') {
      systemTheme.addEventListener('change', handleSystemThemeChange);
    } else if (typeof systemTheme.addListener === 'function') {
      systemTheme.addListener(handleSystemThemeChange);
    }
  }
}());

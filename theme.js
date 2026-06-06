(function () {
  'use strict';

  var storageKey = 'maes-theme';
  var root = document.documentElement;
  var systemTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var moonIconPath = 'M22.81 15.95a9.35 9.35 0 0 1-12.36-12.36A9.9 9.9 0 1 0 22.81 15.95Z';
  var sunIconPath = 'M12 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM11 2h2v4h-2V2Zm0 18h2v4h-2v-4ZM1 12h4v2H1v-2Zm18 0h4v2h-4v-2ZM3.515 5.929l1.414-1.414 2.828 2.828-1.414 1.414-2.828-2.828Zm12.728 12.728 1.414-1.414 2.828 2.828-1.414 1.414-2.828-2.828Zm0-11.314 2.828-2.828 1.414 1.414-2.828 2.828-1.414-1.414ZM3.515 20.071l2.828-2.828 1.414 1.414-2.828 2.828-1.414-1.414Z';
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

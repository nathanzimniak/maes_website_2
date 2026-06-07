(function () {
  'use strict';

  var storageKey = 'maes-theme';
  var root = document.documentElement;
  var systemTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var moonIconPath = 'M15 3A9 9 0 1 0 15 21Q21 12 15 3Z';
  var sunIconPath = 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM11 2h2v3.5h-2V2Zm0 16.5h2V22h-2v-3.5ZM2 11h3.5v2H2v-2Zm16.5 0H22v2h-3.5v-2ZM4.293 5.707l1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm11.525 11.525 1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm0-10.464 2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414ZM4.293 18.293l2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414Z';
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

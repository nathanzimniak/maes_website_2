(function () {
  'use strict';

  const storageKey = 'maes-theme';
  const root = document.documentElement;
  const systemTheme = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const moonIconPath = 'M21.684126 14.675874a9.35 9.35 0 0 1-12.36-12.36A9.9 9.9 0 1 0 21.684126 14.675874Z';
  const sunIconPath = 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM11 2h2v3.5h-2V2Zm0 16.5h2V22h-2v-3.5ZM2 11h3.5v2H2v-2Zm16.5 0H22v2h-3.5v-2ZM4.293 5.707l1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm11.525 11.525 1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm0-10.464 2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414ZM4.293 18.293l2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414Z';
  let themeToggle = null;

  function getSavedTheme() {
    try {
      const theme = window.localStorage.getItem(storageKey);
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

    const isDark = theme === 'dark';
    const label = isDark ? 'Activer le mode clair' : 'Activer le mode sombre';
    const iconPath = themeToggle.querySelector('path');

    themeToggle.setAttribute('aria-label', label);
    themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    themeToggle.setAttribute('title', label);
    if (iconPath) iconPath.setAttribute('d', isDark ? sunIconPath : moonIconPath);
  }

  function announceThemeChange(theme) {
    window.dispatchEvent(new window.CustomEvent('maes:themechange', { detail: { theme: theme } }));
  }

  function applyTheme(theme, persist, announce) {
    root.setAttribute('data-theme', theme);
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
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
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

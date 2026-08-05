(function () {
  'use strict';

  const THEME_STORAGE_KEY = 'maes-theme';
  const root = document.documentElement;
  const systemThemeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const ICON_PATHS = {
    dark: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM11 2h2v3.5h-2V2Zm0 16.5h2V22h-2v-3.5ZM2 11h3.5v2H2v-2Zm16.5 0H22v2h-3.5v-2ZM4.293 5.707l1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm11.525 11.525 1.414-1.414 2.475 2.475-1.414 1.414-2.475-2.475Zm0-10.464 2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414ZM4.293 18.293l2.475-2.475 1.414 1.414-2.475 2.475-1.414-1.414Z',
    light: 'M21.684126 14.675874a9.35 9.35 0 0 1-12.36-12.36A9.9 9.9 0 1 0 21.684126 14.675874Z',
  };

  function getStoredTheme() {
    try {
      const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
      return theme === 'dark' || theme === 'light' ? theme : null;
    } catch (error) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      // The theme remains active for the current page when storage is unavailable.
    }
  }

  function getSystemTheme() {
    return systemThemeQuery?.matches ? 'dark' : 'light';
  }

  function updateToggle(toggle, theme) {
    if (!toggle) return;

    const isDark = theme === 'dark';
    const label = isDark ? 'Activer le mode clair' : 'Activer le mode sombre';
    const iconPath = toggle.querySelector('path');

    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('title', label);
    iconPath?.setAttribute('d', ICON_PATHS[theme]);
  }

  function applyTheme(theme, { persist = false, announce = false } = {}) {
    root.setAttribute('data-theme', theme);
    updateToggle(document.getElementById('theme-toggle'), theme);

    if (persist) saveTheme(theme);
    if (announce) {
      window.dispatchEvent(new window.CustomEvent('maes:themechange', { detail: { theme } }));
    }
  }

  function bindToggle() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle || toggle.dataset.themeBound === 'true') return;

    toggle.dataset.themeBound = 'true';
    updateToggle(toggle, root.getAttribute('data-theme') || getSystemTheme());
    toggle.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, { persist: true, announce: true });
    });
  }

  applyTheme(getStoredTheme() || getSystemTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindToggle);
  } else {
    bindToggle();
  }

  if (systemThemeQuery) {
    const handleSystemThemeChange = (event) => {
      if (!getStoredTheme()) applyTheme(event.matches ? 'dark' : 'light', { announce: true });
    };

    if (typeof systemThemeQuery.addEventListener === 'function') {
      systemThemeQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof systemThemeQuery.addListener === 'function') {
      systemThemeQuery.addListener(handleSystemThemeChange);
    }
  }
}());

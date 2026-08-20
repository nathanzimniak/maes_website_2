import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
document.getElementById('year')?.replaceChildren(new Date().getFullYear().toString());
const chartContainer = document.querySelector('.chart__plot-area');
const chartControls = document.querySelector('.chart__controls');
const chartFigure = document.querySelector('.chart__figure');
const chartHovered = document.querySelector('.chart__hovered');
const chartPlot = document.querySelector('.chart__plot');
const scatterTooltip = document.getElementById('scatter-tooltip');
const chartProfiles = document.querySelector('.chart__profiles');
const chartSurface3d = document.querySelector('.chart__surface3d');
const chartSettingsButton = document.getElementById('chart-settings-button');
const chartSettingsPanel = document.getElementById('chart-settings-panel');
const profileSettingsButton = document.getElementById('profile-settings-button');
const profileSettingsPanel = document.getElementById('profile-settings-panel');
const profileContent = document.getElementById('profile-content');
const profileLoadingStatus = document.getElementById('profile-loading-status');
const jetLoadingStatus = document.getElementById('jet-loading-status');
const profileAxisSelect = document.getElementById('profile-axis-select');
const profileFocusSelect = document.getElementById('profile-title-select-1');
const profileScaleSelect = document.getElementById('profile-title-select-2');
const hoveredValues = document.getElementById('hovered-values');
const axisLabelElements = {
  x: document.getElementById('x-axis-label'),
  y: document.getElementById('y-axis-label'),
};
const scenarioButtons = Array.from(document.querySelectorAll('[data-scenario]'));
const scaleSelects = Array.from(document.querySelectorAll('[data-scale-select]'));
const profileSelects = Array.from(document.querySelectorAll('.chart__select--profile'));
const axisSelects = profileSelects.filter((select) => select.classList.contains('chart__select--axis'));
const profileLabelSelects = profileSelects.filter((select) => !select.classList.contains('chart__select--axis'));
const profile1DSelects = profileSelects.filter((select) => (
  select.id === 'profile-axis-select'
  || select.id === 'profile-title-select-1'
  || select.id === 'profile-title-select-2'
));
const profileFocusLatexByAxis = {
  x: {
    disk: '[0, 2x_{SM}]',
    'disk-outflow': '[0, 2x_{A}]',
    outflow: '[0, x_{max}]',
  },
  z: {
    disk: '[0, 2z_{SM}]',
    'disk-outflow': '[0, 2z_{A}]',
    outflow: '[0, z_{max}]',
  },
};
const resizeObserver = 'ResizeObserver' in window
  ? new ResizeObserver(() => updateChart())
  : null;
const profileHeightObserver = ('ResizeObserver' in window && chartProfiles)
  ? new ResizeObserver(() => syncSurfaceHeightWithProfiles())
  : null;

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function isGzipBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  return buffer.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function parseMaybeCompressedJson(buffer) {
  const plainPayload = parseJsonText(new TextDecoder().decode(buffer));
  if (plainPayload || !isGzipBuffer(buffer) || typeof DecompressionStream === 'undefined') {
    return plainPayload;
  }

  const decompressedStream = new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip')));
  return parseJsonText(await decompressedStream.text());
}

const sliderIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
const sliders = sliderIds.map((id) => ({
  id,
  element: document.getElementById(`${id}-slider`),
  labelValue: document.getElementById(`${id}-label-value`),
}));
let xAxisKey = 'g7';
let yAxisKey = 'g6';
let xScaleType = 'log';
let yScaleType = 'log';
let selectedScenario = 'A';
let axisDomainOverrides = null;
let currentSolutions = [];
let selectedSolutionIndex = null;
let pinnedSolutionIndex = null;
const customSelects = new Map();

const realDataCache = new Map();
const solutionProfileCache = new Map();
const scientificDataBaseUrl = 'https://pub-d2768af1923e4312bbdec32f0c1c222e.r2.dev/data';
let jetScene = null;
let jetCamera = null;
let jetRenderer = null;
let jetControls = null;
let jetMesh = null;
let jetMeshMirror = null;
let jetDiskMesh = null;
let jetDiskMeshMirror = null;
let jetDiskOuterMesh = null;
let jetAnimationFrameId = null;
const datasetDirectories = [
  '0.100_1.0_1.0_1.0_0.0_0_0',
];
const folderParameterKeys = ['ep', 'alpham', 'chim', 'Pm', 'alphap', 'turbulence_profile', 'heat_profile'];

const datasetConfigs = datasetDirectories
  .map((folderName) => {
    const values = folderName.split('_');
    if (values.length !== folderParameterKeys.length) {
      return null;
    }
    const config = { folderName };
    folderParameterKeys.forEach((key, index) => {
      config[key] = Number(values[index]);
      config[`${key}Raw`] = values[index];
    });
    return config;
  })
  .filter(Boolean);

const parameterValueLists = folderParameterKeys.reduce((accumulator, key) => {
  const uniqueSortedValues = Array.from(new Set(datasetConfigs.map((config) => config[key]))).sort((a, b) => a - b);
  accumulator[key] = uniqueSortedValues;
  return accumulator;
}, {});

const parameterValueLabels = folderParameterKeys.reduce((accumulator, key) => {
  const list = parameterValueLists[key] || [];
  accumulator[key] = list.map((value) => {
    const match = datasetConfigs.find((config) => config[key] === value);
    return match ? match[`${key}Raw`] : value.toString();
  });
  return accumulator;
}, {});

const sliderParameterMap = {
  p1: 'ep',
  p2: 'alpham',
  p3: 'chim',
  p4: 'Pm',
  p5: 'alphap',
};

function formatParameterValue(value, fallback = '—') {
  return value ?? fallback;
}

function configureSlidersFromDatasets() {
  sliders.forEach((slider) => {
    const parameterKey = sliderParameterMap[slider.id];
    const availableValues = parameterValueLists[parameterKey] || [];
    slider.element.min = '0';
    slider.element.max = String(Math.max(availableValues.length - 1, 0));
    slider.element.step = '1';
    slider.element.dataset.parameterKey = parameterKey;
    slider.element.dataset.maxIndex = String(Math.max(availableValues.length - 1, 0));
    slider.element.value = '0';
    if (slider.labelValue) {
      const labels = parameterValueLabels[parameterKey] || [];
      slider.labelValue.textContent = formatParameterValue(labels[0]);
    }
  });
}

function getSelectedParameterValue(sliderId, sliderIndexValue) {
  const parameterKey = sliderParameterMap[sliderId];
  const availableValues = parameterValueLists[parameterKey] || [];
  const safeIndex = clamp(Math.round(Number(sliderIndexValue)), 0, Math.max(availableValues.length - 1, 0));
  return availableValues[safeIndex];
}

function getSelectedParameterLabel(sliderId, sliderIndexValue) {
  const parameterKey = sliderParameterMap[sliderId];
  const labels = parameterValueLabels[parameterKey] || [];
  const safeIndex = clamp(Math.round(Number(sliderIndexValue)), 0, Math.max(labels.length - 1, 0));
  return labels[safeIndex];
}

function pickDiscreteValueFromSlider(sliderValue, availableValues) {
  if (!availableValues?.length) {
    return null;
  }
  const index = clamp(Math.round(Number(sliderValue)), 0, Math.max(availableValues.length - 1, 0));
  return availableValues[index];
}

function resolveFolderFromInputs(baseParams) {
  const turbulenceProfileSelect = document.getElementById('turbulence-profile-select');
  const heatProfileSelect = document.getElementById('heat-profile-select');
  const requested = {
    ep: pickDiscreteValueFromSlider(baseParams.p1, parameterValueLists.ep),
    alpham: pickDiscreteValueFromSlider(baseParams.p2, parameterValueLists.alpham),
    chim: pickDiscreteValueFromSlider(baseParams.p3, parameterValueLists.chim),
    Pm: pickDiscreteValueFromSlider(baseParams.p4, parameterValueLists.Pm),
    alphap: pickDiscreteValueFromSlider(baseParams.p5, parameterValueLists.alphap),
    turbulence_profile: Number(turbulenceProfileSelect?.dataset.profileCode ?? 0),
    heat_profile: Number(heatProfileSelect?.dataset.profileCode ?? 0),
  };

  const exactMatch = datasetConfigs.find((config) => folderParameterKeys.every((key) => config[key] === requested[key]));
  if (exactMatch) {
    return exactMatch.folderName;
  }

  const closestMatch = datasetConfigs
    .map((config) => {
      const distance = folderParameterKeys.reduce((sum, key) => sum + Math.abs(config[key] - requested[key]), 0);
      return { config, distance };
    })
    .sort((a, b) => a.distance - b.distance)[0];

  return closestMatch?.config?.folderName || datasetDirectories[0];
}

async function loadRealDataset(folderName) {
  if (realDataCache.has(folderName)) return realDataCache.get(folderName);
  const url = `${scientificDataBaseUrl}/${folderName}/${folderName}.json.gz`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de charger les données réelles (${response.status}) depuis ${url}`);
  }
  const buffer = await response.arrayBuffer();
  const payload = await parseMaybeCompressedJson(buffer);

  if (!payload) {
    throw new Error(`Le fichier de données ${url} n'est pas un JSON valide.`);
  }
  const quantities = payload.quantities || [];
  const rows = payload.data || [];
  const metricToQuantity = {
    g1: 'ep',
    g2: 'alpham',
    g3: 'chim',
    g4: 'Pm',
    g5: 'alphap',
    g6: 'xi',
    g7: 'mu',
    g8: 'p',
    g9: 'q',
    g10: 'delta',
    g11: 'ms',
    g12: 'alphav',
    g13: 'kappaBP',
    g14: 'lambdaBP',
    g15: 'omega_star',
    g16: 'e',
    g17: 'x_id',
    g18: 'x_sm',
    g19: 'x_a',
    g20: 'x_max',
    g21: 'z_id',
    g22: 'z_sm',
    g23: 'z_a',
    g24: 'z_max',
  };
  const quantityIndexMap = quantities.reduce((accumulator, name, index) => {
    accumulator[name] = index;
    return accumulator;
  }, {});

  const solutions = rows.map((row) => {
    const parsed = row.map((value) => Number(value));
    const solution = { scenario: 'SM', profiles: null, rawMetrics: {}, critState: null, folderName, profileFileBase: null };
    Object.entries(metricToQuantity).forEach(([key, quantityName]) => {
      const sourceIndex = quantityIndexMap[quantityName];
      const numericValue = sourceIndex !== undefined ? parsed[sourceIndex] : NaN;
      const rawValue = sourceIndex !== undefined ? row[sourceIndex] : 'NaN';
      solution[key] = numericValue;
      solution.rawMetrics[key] = rawValue;
    });

    const xiValue = solution.rawMetrics.g6;
    const muValue = solution.rawMetrics.g7;
    const pValue = solution.rawMetrics.g8;
    if (xiValue !== undefined && muValue !== undefined && pValue !== undefined) {
      solution.profileFileBase = `${folderName}_${xiValue}_${muValue}_${pValue}`;
    }

    const critStateIndex = quantityIndexMap.crit_state;
    solution.critState = critStateIndex !== undefined ? Number(parsed[critStateIndex]) : null;
    return solution;
  }).filter((item) => Number.isFinite(item.g1));
  realDataCache.set(folderName, solutions);
  return solutions;
}


const SELECT_CARET_GAP_BUFFER = 4;

function createTextRuler() {
  const ruler = document.createElement('span');
  ruler.setAttribute('aria-hidden', 'true');
  Object.assign(ruler.style, {
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    left: '-9999px',
    top: '-9999px',
  });
  document.body.appendChild(ruler);
  return ruler;
}

function getSelectWidthParts(referenceElement, caretElement) {
  const styles = window.getComputedStyle(referenceElement);
  return {
    styles,
    paddingLeft: parseFloat(styles.paddingLeft) || 0,
    paddingRight: parseFloat(styles.paddingRight) || 0,
    borderLeft: parseFloat(styles.borderLeftWidth) || 0,
    borderRight: parseFloat(styles.borderRightWidth) || 0,
    gap: parseFloat(styles.columnGap || styles.gap) || 0,
    caretWidth: caretElement?.getBoundingClientRect().width || 0,
  };
}

function applyTextStyles(ruler, styles) {
  ruler.style.fontFamily = styles.fontFamily;
  ruler.style.fontSize = styles.fontSize;
  ruler.style.fontWeight = styles.fontWeight;
  ruler.style.letterSpacing = styles.letterSpacing;
}

function applySelectWidth(select, width, { resizeButton = false } = {}) {
  const wrapper = select.closest('.chart__latex-select');
  const button = wrapper?.querySelector('.chart__latex-button');

  if (wrapper) wrapper.style.width = `${width}px`;
  if (resizeButton && button) button.style.width = `${width}px`;
  select.style.width = `${width}px`;
}

function measureSelectTextWidth(select, ruler) {
  const customSelectState = customSelects.get(select);
  const measureNode = document.createElement('span');
  Object.assign(measureNode.style, {
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap',
  });
  ruler.replaceChildren(measureNode);

  return Array.from(select.options).reduce((maxWidth, option) => {
    if (customSelectState?.renderOption) {
      customSelectState.renderOption(measureNode, option);
      renderMathLabels(measureNode);
    } else {
      measureNode.textContent = option.textContent || '';
    }
    return Math.max(maxWidth, measureNode.getBoundingClientRect().width);
  }, 0);
}

function getSharedSelectWidth(selects) {
  const ruler = createTextRuler();
  const referenceButton = selects
    .map((select) => select.parentElement?.querySelector('.chart__latex-button'))
    .find(Boolean);
  const referenceElement = referenceButton || selects[0];
  const widthParts = getSelectWidthParts(
    referenceElement,
    referenceButton?.querySelector('.chart__latex-button-caret')
  );

  applyTextStyles(ruler, widthParts.styles);
  const maxTextWidth = selects.reduce(
    (maxWidth, select) => Math.max(maxWidth, measureSelectTextWidth(select, ruler)),
    0
  );
  document.body.removeChild(ruler);

  return Math.ceil(
    maxTextWidth
      + widthParts.paddingLeft
      + widthParts.paddingRight
      + widthParts.borderLeft
      + widthParts.borderRight
      + widthParts.gap
      + widthParts.caretWidth
      + SELECT_CARET_GAP_BUFFER
  );
}

function updateSharedSelectWidths(selects, options = {}) {
  if (!selects.length) return;

  const targetWidth = getSharedSelectWidth(selects);
  selects.forEach((select) => applySelectWidth(select, targetWidth, options));
}

function updateIndividualSelectWidths(selects) {
  if (!selects.length) return;

  const ruler = createTextRuler();
  selects.forEach((select) => {
    const wrapper = select.closest('.chart__latex-select');
    const button = wrapper?.querySelector('.chart__latex-button');
    const referenceElement = button || select;
    const widthParts = getSelectWidthParts(referenceElement, button?.querySelector('.chart__latex-button-caret'));

    applyTextStyles(ruler, widthParts.styles);
    const maxTextWidth = measureSelectTextWidth(select, ruler);
    const targetWidth = Math.ceil(
      maxTextWidth
        + widthParts.paddingLeft
        + widthParts.paddingRight
        + widthParts.borderLeft
        + widthParts.borderRight
        + widthParts.gap
        + widthParts.caretWidth
        + SELECT_CARET_GAP_BUFFER
    );

    applySelectWidth(select, targetWidth, { resizeButton: true });
  });
  document.body.removeChild(ruler);
}

const updateScaleSelectWidths = () => updateSharedSelectWidths(scaleSelects);
const updateAxisSelectWidths = () => updateSharedSelectWidths(axisSelects, { resizeButton: true });
const updateProfile1DSelectWidths = () => updateIndividualSelectWidths(profile1DSelects);

const refreshSelectWidths = () => {
  updateScaleSelectWidths();
  updateAxisSelectWidths();
  updateProfile1DSelectWidths();
};

const scheduleSelectWidthRefresh = () => {
  refreshSelectWidths();
  requestAnimationFrame(refreshSelectWidths);
  setTimeout(refreshSelectWidths, 120);
  setTimeout(refreshSelectWidths, 320);
};


configureSlidersFromDatasets();

let width = 0;
let height = 0;
const outerMargin = 24;
const margin = {
  top: outerMargin,
  right: outerMargin,
  bottom: outerMargin,
  left: outerMargin
};

const svgNS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(svgNS, 'svg');
svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
svg.setAttribute('role', 'presentation');

let innerWidth = 0;
let innerHeight = 0;

const gridGroup = document.createElementNS(svgNS, 'g');
gridGroup.classList.add('chart__grid');

svg.appendChild(gridGroup);

const axesGroup = document.createElementNS(svgNS, 'g');
axesGroup.classList.add('chart__axes');
svg.appendChild(axesGroup);

const ticksGroup = document.createElementNS(svgNS, 'g');
ticksGroup.classList.add('chart__ticks');
svg.appendChild(ticksGroup);

const tickLabelsGroup = document.createElementNS(svgNS, 'g');
tickLabelsGroup.classList.add('chart__tick-labels');
svg.appendChild(tickLabelsGroup);

const pointsGroup = document.createElementNS(svgNS, 'g');
svg.appendChild(pointsGroup);

chartContainer.appendChild(svg);

function resizeChart() {
  const chartBody = document.querySelector('.chart__body');
  if (chartControls && chartBody) {
    const controlsHeight = chartControls.offsetHeight;
    chartBody.style.setProperty('--chart-controls-height', `${controlsHeight}px`);
    const bodyStyles = window.getComputedStyle(chartBody);
    const shouldSyncHeights = bodyStyles.flexDirection !== 'column';
    if (shouldSyncHeights) {
      if (chartFigure) {
        chartFigure.style.height = `${controlsHeight}px`;
        chartFigure.style.maxHeight = `${controlsHeight}px`;
      }
      if (chartHovered) {
        chartHovered.style.height = `${controlsHeight}px`;
        chartHovered.style.maxHeight = `${controlsHeight}px`;
      }
    } else {
      if (chartFigure) {
        chartFigure.style.height = '';
        chartFigure.style.maxHeight = '';
      }
      if (chartHovered) {
        chartHovered.style.height = '';
        chartHovered.style.maxHeight = '';
      }
    }
  }
  if (chartBody && chartProfiles) {
    chartProfiles.style.width = `${chartBody.offsetWidth}px`;
  }

  width = chartContainer.clientWidth || 720;
  height = chartContainer.clientHeight || 320;
  const plotSize = Math.min(width, height);
  const offsetX = (width - plotSize) / 2;
  const offsetY = (height - plotSize) / 2;

  margin.left = outerMargin + offsetX;
  margin.right = outerMargin + offsetX;
  margin.top = outerMargin + offsetY;
  margin.bottom = outerMargin + offsetY;

  innerWidth = width - margin.left - margin.right;
  innerHeight = height - margin.top - margin.bottom;

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (chartPlot) {
    chartPlot.style.removeProperty('--plot-area-pad-x');
    chartPlot.style.removeProperty('--plot-area-pad-y');
    chartPlot.style.removeProperty('--scatter-plot-x');
    chartPlot.style.removeProperty('--scatter-plot-y');
    chartPlot.style.removeProperty('--axis-x-select-x');
    chartPlot.style.removeProperty('--axis-x-select-y');
    chartPlot.style.removeProperty('--axis-y-select-x');
    chartPlot.style.removeProperty('--axis-y-select-y');
  }

}

function createScale(domain, scaleType, axis) {
  const normalize = scaleType === 'log'
    ? (value) => Math.log10(Math.max(value, domain.min))
    : (value) => value;

  const start = normalize(domain.min);
  const end = normalize(domain.max);
  const span = end - start || 1;

  return (value) => {
    const position = (normalize(value) - start) / span;
    return axis === 'x'
      ? margin.left + position * innerWidth
      : margin.top + innerHeight - position * innerHeight;
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function buildSolutions(baseParams, scenario) {
  const folderName = resolveFolderFromInputs(baseParams);
  const solutions = await loadRealDataset(folderName);
  const scenarioToCritStates = {
    SM: [1, 2, 3],
    A: [2, 3],
    FM: [3],
  };
  const allowedCritStates = scenarioToCritStates[scenario] ?? [1, 2, 3];

  const filteredSolutions = solutions
    .filter((solution) => allowedCritStates.includes(solution.critState))
    .map((solution) => ({ ...solution, scenario }));

  return filteredSolutions.length ? filteredSolutions : [];
}

function getDomain(values, scaleType = 'linear') {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (scaleType === 'log') {
    const positives = values.filter((value) => value > 0);

    if (!positives.length) {
      return { min: 0.1, max: 1 };
    }

    const smallestPositive = Math.min(...positives);
    const safeMin = min > 0 ? min : smallestPositive;
    const safeMax = max > safeMin ? max : safeMin * 10;

    return {
      min: 10 ** Math.floor(Math.log10(safeMin)),
      max: 10 ** Math.ceil(Math.log10(safeMax)),
    };
  }

  const span = max - min;
  const magnitude = Math.max(Math.abs(min), Math.abs(max), 1);

  if (span === 0) {
    const padding = Math.max(magnitude * 0.08, 1e-6);
    return { min: min - padding, max: max + padding };
  }

  const padding = Math.max(span * 0.08, magnitude * 0.02, 1e-6);
  return { min: min - padding, max: max + padding };
}

function buildTicks(domain, scaleType = 'linear', tickCount = 5) {
  if (scaleType === 'log') {
    const ticks = [];
    const startExp = Math.floor(Math.log10(domain.min));
    const endExp = Math.ceil(Math.log10(domain.max));

    for (let exp = startExp; exp <= endExp; exp++) {
      const value = 10 ** exp;
      if (value >= domain.min && value <= domain.max) {
        ticks.push(value);
      }
    }
    return ticks;
  }

  return Array.from({ length: tickCount + 1 }, (_, i) => domain.min + (domain.max - domain.min) * (i / tickCount));
}

function formatTick(value, domain, scaleType = 'linear') {
  if (!Number.isFinite(value)) {
    return '';
  }

  if (scaleType === 'log') {
    if (value <= 0) return '';
    const exponent = Math.log10(value);
    const roundedExponent = Math.round(exponent);
    const isIntegerExponent = Math.abs(exponent - roundedExponent) < 1e-8;
    const displayExponent = isIntegerExponent
      ? roundedExponent
      : Number.parseFloat(exponent.toFixed(2)).toString();
    return `10${toSuperscript(displayExponent)}`;
  }

  const span = Math.abs((domain?.max ?? value) - (domain?.min ?? value));
  const step = span > 0 ? span / 5 : Math.abs(value) || 1;
  const absValue = Math.abs(value);

  if ((absValue >= 1e5 || (absValue > 0 && absValue < 1e-4))) {
    return value.toExponential(1).replace('e+', 'e');
  }

  const decimals = Math.min(8, Math.max(0, Math.ceil(-Math.log10(step)) + 1));
  const roundedValue = Number.parseFloat(value.toFixed(decimals));

  if (roundedValue === 0 && absValue > 0) {
    return value.toExponential(2).replace('e+', 'e');
  }

  return roundedValue.toString();
}
function toSuperscript(value) {
  const superscriptMap = {
    '-': '⁻',
    '.': '·',
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
  };
  return String(value)
    .split('')
    .map((char) => superscriptMap[char] ?? char)
    .join('');
}

function renderAxes(xDomain, yDomain, xScale, yScale, xType, yType, xTicks, yTicks) {
  gridGroup.innerHTML = '';
  axesGroup.innerHTML = '';
  ticksGroup.innerHTML = '';
  tickLabelsGroup.innerHTML = '';

  const resolvedXTicks = xTicks ?? buildTicks(xDomain, xType);
  const resolvedYTicks = yTicks ?? buildTicks(yDomain, yType);

  const axisX = document.createElementNS(svgNS, 'line');
  axisX.setAttribute('x1', margin.left);
  axisX.setAttribute('x2', margin.left + innerWidth);
  axisX.setAttribute('y1', margin.top + innerHeight);
  axisX.setAttribute('y2', margin.top + innerHeight);
  axesGroup.appendChild(axisX);

  const axisY = document.createElementNS(svgNS, 'line');
  axisY.setAttribute('x1', margin.left);
  axisY.setAttribute('x2', margin.left);
  axisY.setAttribute('y1', margin.top);
  axisY.setAttribute('y2', margin.top + innerHeight);
  axesGroup.appendChild(axisY);

  resolvedXTicks.forEach((xValue) => {
    const xPos = xScale(xValue);
    const gridLine = document.createElementNS(svgNS, 'line');
    gridLine.setAttribute('x1', xPos);
    gridLine.setAttribute('x2', xPos);
    gridLine.setAttribute('y1', margin.top);
    gridLine.setAttribute('y2', margin.top + innerHeight);
    gridGroup.appendChild(gridLine);

    const tick = document.createElementNS(svgNS, 'line');
    tick.setAttribute('x1', xPos);
    tick.setAttribute('x2', xPos);
    tick.setAttribute('y1', margin.top + innerHeight);
    tick.setAttribute('y2', margin.top + innerHeight + 6);
    ticksGroup.appendChild(tick);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', xPos);
    label.setAttribute('y', margin.top + innerHeight + 18);
    label.setAttribute('text-anchor', 'middle');
    label.textContent = formatTick(xValue, xDomain, xType);
    tickLabelsGroup.appendChild(label);
  });

  resolvedYTicks.forEach((yValue) => {
    const yPos = yScale(yValue);
    const gridLine = document.createElementNS(svgNS, 'line');
    gridLine.setAttribute('x1', margin.left);
    gridLine.setAttribute('x2', margin.left + innerWidth);
    gridLine.setAttribute('y1', yPos);
    gridLine.setAttribute('y2', yPos);
    gridGroup.appendChild(gridLine);

    const tick = document.createElementNS(svgNS, 'line');
    tick.setAttribute('x1', margin.left - 6);
    tick.setAttribute('x2', margin.left);
    tick.setAttribute('y1', yPos);
    tick.setAttribute('y2', yPos);
    ticksGroup.appendChild(tick);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', margin.left - 10);
    label.setAttribute('y', yPos + 4);
    label.setAttribute('text-anchor', 'end');
    label.textContent = formatTick(yValue, yDomain, yType);
    tickLabelsGroup.appendChild(label);
  });
}

function renderMathLabels(scope = document) {
  if (!window.katex) return;

  scope.querySelectorAll('.math-label').forEach((element) => {
    const latex = element.dataset.latex;
    if (!latex) return;

    window.katex.render(latex, element, { throwOnError: false, output: 'html' });
  });
}

const hoveredMetricLabels = {
  g1: { label: 'Aspect ratio', latex: '\\varepsilon', symbol: 'ε' },
  g2: { label: 'Magnetic diffusivity', latex: '\\alpha_m', symbol: 'αₘ' },
  g3: { label: 'Magnetic diffusivity anisotropy', latex: '\\chi_m', symbol: 'χₘ' },
  g4: { label: 'Magnetic Prandtl number', latex: '\\mathcal{P}_m', symbol: '𝒫ₘ' },
  g5: { label: 'Turbulent magnetic pressure', latex: '\\alpha_p', symbol: 'αₚ' },
  g6: { label: 'Ejection index', latex: '\\xi', symbol: 'ξ' },
  g7: { label: 'Magnetization', latex: '\\mu', symbol: 'μ' },
  g8: { label: 'Toroidal electric current', latex: 'p', symbol: 'p' },
  g9: { label: 'Radial electric current', latex: 'q', symbol: 'q' },
  g10: { label: 'Rotation', latex: '\\delta', symbol: 'δ' },
  g11: { label: 'Sonic Mach number', latex: 'm_s', symbol: 'mₛ' },
  g12: { label: 'Turbulent viscosity', latex: '\\alpha_v', symbol: 'αᵥ' },
  g13: { label: 'Mass load', latex: '\\kappa', symbol: 'κ' },
  g14: { label: 'Magnetic lever arm', latex: '\\lambda', symbol: 'λ' },
  g15: { label: 'Magnetic surface rotation', latex: '\\omega_*', symbol: 'ω*' },
  g16: { label: 'Bernoulli invariant', latex: 'e', symbol: 'e' },
  g17: { label: 'Ideal angle', latex: 'x_{id}', symbol: 'xid' },
  g18: { label: 'SM angle', latex: 'x_{SM}', symbol: 'xSM' },
  g19: { label: 'A angle', latex: 'x_A', symbol: 'xA' },
  g20: { label: 'Maximum angle', latex: 'x_{max}', symbol: 'xmax' },
  g21: { label: 'Ideal altitude', latex: 'z_{id}', symbol: 'zid' },
  g22: { label: 'SM altitude', latex: 'z_{SM}', symbol: 'zSM' },
  g23: { label: 'A altitude', latex: 'z_A', symbol: 'zA' },
  g24: { label: 'Maximum altitude', latex: 'z_{max}', symbol: 'zmax' }
};

const axisExcludedMetricKeys = new Set(['g1', 'g2', 'g3', 'g4', 'g5']);

function populateAxisSelectOptions() {
  axisSelects.forEach((select) => {
    select.innerHTML = '';
    const entries = Object.keys(hoveredMetricLabels)
      .filter((key) => !axisExcludedMetricKeys.has(key))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

    entries.forEach((key) => {
      const { label, latex, symbol } = getHoveredMetricLabel(key);
      const option = document.createElement('option');
      option.value = key;
      option.dataset.name = label;
      option.dataset.latex = latex;
      option.textContent = symbol || key.toUpperCase();
      select.appendChild(option);
    });
  });

  const xSelect = axisSelects.find((select) => select.dataset.axisSettings === 'x');
  const ySelect = axisSelects.find((select) => select.dataset.axisSettings === 'y');
  if (xSelect) {
    xSelect.value = xAxisKey;
  }
  if (ySelect) {
    ySelect.value = yAxisKey;
  }
}

function getHoveredMetricLabel(key) {
  const fallbackIndex = Number(key.slice(1));
  return hoveredMetricLabels[key] ?? {
    label: `Grandeur ${fallbackIndex}`,
    latex: '\\varepsilon',
    symbol: key.toUpperCase()
  };
}

function getMetricLatex(key) {
  return getHoveredMetricLabel(key).latex ?? key.toUpperCase();
}

function updateCustomSelectDisplay(select) {
  const state = customSelects.get(select);
  if (!state) return;

  const { buttonLabel, menu, renderLabel, usesMath, renderOption } = state;
  renderLabel(buttonLabel, select);

  if (usesMath) {
    renderMathLabels(buttonLabel);
  }

  if (menu) {
    const menuItems = Array.from(menu.querySelectorAll('[data-value]'));
    const options = Array.from(select.options);
    menuItems.forEach((item, index) => {
      const option = options[index];
      if (option && renderOption) {
        renderOption(item, option);
      }
      item.classList.toggle('chart__latex-option--selected', item.dataset.value === select.value);
    });
    if (usesMath) {
      renderMathLabels(menu);
    }
  }
}

function closeCustomMenus() {
  customSelects.forEach(({ menu }, select) => {
    const button = menu?.previousElementSibling;
    if (menu) {
      menu.classList.remove('chart__latex-menu--open');
    }
    if (button && button.classList.contains('chart__latex-button')) {
      button.setAttribute('aria-expanded', 'false');
    }
  });
}

function setSettingsPanelOpen(panel, button, isOpen) {
  if (!panel || !button) return false;

  panel.hidden = !isOpen;
  button.setAttribute('aria-expanded', String(isOpen));
  return true;
}

function closeSettingsPanel() {
  setSettingsPanelOpen(chartSettingsPanel, chartSettingsButton, false);
}

function closeProfileSettingsPanel() {
  setSettingsPanelOpen(profileSettingsPanel, profileSettingsButton, false);
}

function toggleSettingsPanel(panel, button, onOpen) {
  const shouldOpen = panel?.hidden ?? false;
  if (!setSettingsPanelOpen(panel, button, shouldOpen)) return;

  if (shouldOpen) {
    onOpen?.();
  }
}

function refreshChartSettingsSelects() {
  requestAnimationFrame(() => {
    updateScaleSelectWidths();
    updateAxisSelectWidths();
    updateProfile1DSelectWidths();
  });
}

function buildCustomSelect(select, { renderLabel, renderOption, usesMath = false, wrapperClass = '' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart__latex-select';
  if (wrapperClass) {
    wrapper.classList.add(wrapperClass);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chart__latex-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');

  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'chart__latex-button-label';
  button.appendChild(buttonLabel);

  const caret = document.createElement('span');
  caret.className = 'chart__latex-button-caret';
  caret.innerHTML = '<svg viewBox="0 0 12 8" aria-hidden="true" focusable="false"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
  button.appendChild(caret);

  const menu = document.createElement('div');
  menu.className = 'chart__latex-menu';
  menu.setAttribute('role', 'listbox');

  Array.from(select.options).forEach((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chart__latex-option';
    item.dataset.value = option.value;
    renderOption(item, option);
    item.addEventListener('click', () => {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      menu.classList.remove('chart__latex-menu--open');
      button.setAttribute('aria-expanded', 'false');
    });
    menu.appendChild(item);
  });

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = menu.classList.contains('chart__latex-menu--open');
    closeCustomMenus();
    if (wasOpen) {
      return;
    }
    menu.classList.add('chart__latex-menu--open');
    button.setAttribute('aria-expanded', 'true');
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);

  select.classList.add('chart__latex-select-native');
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  customSelects.set(select, { buttonLabel, menu, renderLabel, renderOption, usesMath });
  updateCustomSelectDisplay(select);
}

document.addEventListener('click', () => {
  closeCustomMenus();
});

function buildHoveredList(entries, valueFormatter) {
  const rows = entries
    .reduce((acc, key, index) => {
      const sectionTitles = {
        1: "Input parameters",
        6: "Disk properties",
        13: "Outflow properties",
      };
      const entryIndex = index + 1;
      if (sectionTitles[entryIndex]) {
        if (acc.length) {
          acc.push('<li class="chart__hovered-divider" role="separator" aria-hidden="true"></li>');
        }
        acc.push(`<li class="chart__hovered-title">${sectionTitles[entryIndex]}</li>`);
      }
      const { label, latex } = getHoveredMetricLabel(key);
      const value = valueFormatter(key);
      acc.push(`
      <li class="chart__hovered-item chart__control-label--aspect">
        <span class="chart__label-text">${label}</span>
        <span class="chart__label-math">
          <span class="math-label" data-latex="${latex}"></span>
          <span class="chart__label-equals">=</span>
          <span class="chart__label-value">${value}</span>
        </span>
      </li>
    `);
      return acc;
    }, [])
    .join('');

  return `
    <ul class="chart__hovered-list">
      ${rows}
    </ul>
  `;
}

function renderHoveredValues(solution) {
  if (!hoveredValues || !solution) return;

  const previousList = hoveredValues.querySelector('.chart__hovered-list');
  const previousScrollTop = previousList ? previousList.scrollTop : 0;
  const entries = Object.entries(solution)
    .filter(([key]) => key.startsWith('g'))
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([key]) => key);

  hoveredValues.innerHTML = buildHoveredList(entries, (key) => solution.rawMetrics?.[key] ?? solution[key].toString());
  renderMathLabels(hoveredValues);
  const nextList = hoveredValues.querySelector('.chart__hovered-list');
  if (nextList) {
    nextList.scrollTop = previousScrollTop;
  }
}

function renderEmptyHoveredValues() {
  if (!hoveredValues) return;

  const previousList = hoveredValues.querySelector('.chart__hovered-list');
  const previousScrollTop = previousList ? previousList.scrollTop : 0;
  const entries = Object.keys(hoveredMetricLabels)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  hoveredValues.innerHTML = buildHoveredList(entries, () => '―');
  renderMathLabels(hoveredValues);
  const nextList = hoveredValues.querySelector('.chart__hovered-list');
  if (nextList) {
    nextList.scrollTop = previousScrollTop;
  }
}

function resetHoveredValues() {
  renderEmptyHoveredValues();
}

function hideScatterTooltip() {
  if (!scatterTooltip) return;
  scatterTooltip.classList.remove('chart__sparkline-tooltip--visible');
}

function showScatterTooltip(point, circle, xKey, yKey) {
  if (!scatterTooltip || !chartPlot || !circle || !point) return;

  const xLatex = getMetricLatex(xKey);
  const yLatex = getMetricLatex(yKey);
  scatterTooltip.innerHTML = `
    <div class="chart__sparkline-tooltip-row">
      <span class="chart__sparkline-tooltip-pair">
        <span class="chart__sparkline-tooltip-key">
          <span class="math-label" data-latex="${yLatex}"></span>
        </span>
        <span class="chart__sparkline-tooltip-value">${point.rawMetrics?.[yKey] ?? formatTick(point[yKey])}</span>
      </span>
      <span class="chart__sparkline-tooltip-pair">
        <span class="chart__sparkline-tooltip-key">
          <span class="math-label" data-latex="${xLatex}"></span>
        </span>
        <span class="chart__sparkline-tooltip-value">${point.rawMetrics?.[xKey] ?? formatTick(point[xKey])}</span>
      </span>
    </div>
  `;
  renderMathLabels(scatterTooltip);

  const plotBounds = chartPlot.getBoundingClientRect();
  const circleBounds = circle.getBoundingClientRect();
  const centerX = circleBounds.left - plotBounds.left + circleBounds.width / 2;
  const centerY = circleBounds.top - plotBounds.top + circleBounds.height / 2;
  const tooltipWidth = scatterTooltip.offsetWidth || 140;
  const tooltipHeight = scatterTooltip.offsetHeight || 42;
  const tooltipPadding = 6;
  const desiredLeft = centerX - tooltipWidth / 2;
  const desiredTop = centerY - tooltipHeight - 20;
  const minLeft = tooltipPadding;
  const maxLeft = Math.max(minLeft, plotBounds.width - tooltipWidth - tooltipPadding);
  const minTop = tooltipPadding;
  const maxTop = Math.max(minTop, plotBounds.height - tooltipHeight - tooltipPadding);

  scatterTooltip.style.left = `${clamp(desiredLeft, minLeft, maxLeft)}px`;
  scatterTooltip.style.top = `${clamp(desiredTop, minTop, maxTop)}px`;
  scatterTooltip.classList.add('chart__sparkline-tooltip--visible');
}

function restorePinnedValues() {
  if (pinnedSolutionIndex === null) {
    resetHoveredValues();
    return;
  }

  const pinned = currentSolutions[pinnedSolutionIndex];
  if (pinned) {
    renderHoveredValues(pinned);
  } else {
    resetHoveredValues();
  }
}

function renderPoints(points, xKey, yKey, scaleX, scaleY) {
  pointsGroup.innerHTML = '';
  points.forEach((point, index) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.classList.add('chart__point');
    circle.setAttribute('cx', scaleX(point[xKey]));
    circle.setAttribute('cy', scaleY(point[yKey]));
    circle.setAttribute('r', 4);
    circle.dataset.solutionIndex = index;
    circle.setAttribute('tabindex', '0');

    if (index === selectedSolutionIndex) {
      circle.classList.add('chart__point--selected');
    }

    circle.addEventListener('pointerenter', () => {
      const hovered = currentSolutions[Number(circle.dataset.solutionIndex)];
      renderHoveredValues(hovered);
      showScatterTooltip(hovered, circle, xKey, yKey);
    });

    circle.addEventListener('pointermove', () => {
      const hovered = currentSolutions[Number(circle.dataset.solutionIndex)];
      showScatterTooltip(hovered, circle, xKey, yKey);
    });

    circle.addEventListener('pointerleave', () => {
      restorePinnedValues();
      hideScatterTooltip();
    });

    circle.addEventListener('focus', () => {
      const hovered = currentSolutions[Number(circle.dataset.solutionIndex)];
      showScatterTooltip(hovered, circle, xKey, yKey);
    });

    circle.addEventListener('blur', () => {
      restorePinnedValues();
      hideScatterTooltip();
    });

    circle.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false || event.button !== 0) return;

      // Pin the hovered values before focus/leave events can restore the old selection.
      pinnedSolutionIndex = index;
      renderHoveredValues(currentSolutions[index]);
    });

    circle.addEventListener('click', () => {
      selectSolution(index);
    });

    circle.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectSolution(index);
      }
    });

    pointsGroup.appendChild(circle);
  });
}

function buildProfileChart(
  xValues,
  yValues,
  width = 320,
  height = 200,
  yDomainOverride = null,
  xDomainOverride = null,
  disableYPadding = false,
  xScaleType = 'linear'
) {
  const padding = { top: 10, right: 16, bottom: 36, left: 40 };
  const dataXMin = Math.min(...xValues);
  const dataXMax = Math.max(...xValues);
  const xMin = xDomainOverride?.min ?? dataXMin;
  const xMax = xDomainOverride?.max ?? dataXMax;
  const getInterpolatedYAtX = (targetX) => {
    if (!xValues.length) return null;
    if (targetX <= xValues[0]) return yValues[0];
    if (targetX >= xValues[xValues.length - 1]) return yValues[yValues.length - 1];

    const rightIndex = xValues.findIndex((x) => x >= targetX);
    if (rightIndex <= 0) return yValues[0];
    const leftIndex = rightIndex - 1;
    const xLeft = xValues[leftIndex];
    const xRight = xValues[rightIndex];
    const yLeft = yValues[leftIndex];
    const yRight = yValues[rightIndex];
    if (xRight === xLeft) return yLeft;
    const ratio = (targetX - xLeft) / (xRight - xLeft);
    return yLeft + ratio * (yRight - yLeft);
  };

  const visibleYValues = [];
  xValues.forEach((x, index) => {
    if (x >= xMin && x <= xMax) {
      visibleYValues.push(yValues[index]);
    }
  });
  const yAtXMin = getInterpolatedYAtX(xMin);
  const yAtXMax = getInterpolatedYAtX(xMax);
  if (Number.isFinite(yAtXMin)) visibleYValues.push(yAtXMin);
  if (Number.isFinite(yAtXMax)) visibleYValues.push(yAtXMax);

  const computedYMin = visibleYValues.length ? Math.min(...visibleYValues) : Math.min(...yValues);
  const computedYMax = visibleYValues.length ? Math.max(...visibleYValues) : Math.max(...yValues);
  const rawYMin = yDomainOverride?.min ?? computedYMin;
  const rawYMax = yDomainOverride?.max ?? computedYMax;
  const xRange = xMax - xMin || 1;
  const rawYRange = rawYMax - rawYMin || 1;
  const yScaleReference = Math.max(Math.abs(rawYMin), Math.abs(rawYMax), 1e-6);
  const minYPadding = Math.max(rawYRange * 0.03, yScaleReference * 0.015, 1e-6);
  const yPadding = disableYPadding ? 0 : Math.max(rawYRange * 0.2, minYPadding);
  const yMin = rawYMin - yPadding;
  const yMax = rawYMax + yPadding;
  const yRange = yMax - yMin || 1;
  const safeWidth = Math.max(width, padding.left + padding.right + 1);
  const safeHeight = Math.max(height, padding.top + padding.bottom + 1);
  const plotWidth = safeWidth - padding.left - padding.right;
  const plotHeight = safeHeight - padding.top - padding.bottom;
  const step = xRange / (xValues.length - 1 || 1);

  const positiveVisibleXValues = xValues.filter((x) => x > 0 && x >= xMin && x <= xMax);
  const minPositiveVisibleX = positiveVisibleXValues.length ? Math.min(...positiveVisibleXValues) : null;
  const domainLogXMin = xMin > 0 ? xMin : minPositiveVisibleX;
  const useLogXScale = xScaleType === 'log' && xMax > 0 && Number.isFinite(domainLogXMin);
  const safeXMin = useLogXScale ? Math.max(domainLogXMin, 1e-12) : 0;
  const safeXRange = useLogXScale ? Math.log10(xMax) - Math.log10(safeXMin) || 1 : xRange;
  const xScale = (x) => {
    if (useLogXScale) {
      const clampedX = Math.max(x, safeXMin);
      return padding.left + ((Math.log10(clampedX) - Math.log10(safeXMin)) / safeXRange) * plotWidth;
    }
    return padding.left + ((x - xMin) / xRange) * plotWidth;
  };
  const xInvert = (screenX) => {
    const ratio = (screenX - padding.left) / (plotWidth || 1);
    if (useLogXScale) {
      return 10 ** (Math.log10(safeXMin) + ratio * safeXRange);
    }
    return xMin + ratio * xRange;
  };
  const yScale = (y) => padding.top + plotHeight - ((y - yMin) / yRange) * plotHeight;

  const pointPairs = xValues.reduce((accumulator, x, index) => {
    if (useLogXScale && x <= 0) return accumulator;
    accumulator.push({
      x: xScale(x),
      y: yScale(yValues[index]),
    });
    return accumulator;
  }, []);
  const points = pointPairs.map((point) => `${point.x},${point.y}`).join(' ');
  const baselineY = height - padding.bottom;
  const visibleAreaSamples = [];
  const pushVisibleSample = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const lastSample = visibleAreaSamples[visibleAreaSamples.length - 1];
    if (lastSample && Math.abs(lastSample.x - x) < 1e-9) {
      lastSample.y = y;
      return;
    }
    visibleAreaSamples.push({ x, y });
  };

  const visibleProfileXMin = useLogXScale ? Math.max(safeXMin, dataXMin) : Math.max(xMin, dataXMin);
  const visibleProfileXMax = Math.min(xMax, dataXMax);
  if (visibleProfileXMin <= visibleProfileXMax) {
    pushVisibleSample(visibleProfileXMin, getInterpolatedYAtX(visibleProfileXMin));
    xValues.forEach((x, index) => {
      if (x > visibleProfileXMin && x < visibleProfileXMax) {
        pushVisibleSample(x, yValues[index]);
      }
    });
    pushVisibleSample(visibleProfileXMax, getInterpolatedYAtX(visibleProfileXMax));
  }

  const visiblePointPairs = visibleAreaSamples.map((sample) => ({
    x: xScale(sample.x),
    y: yScale(sample.y),
  }));

  const areaPath = visiblePointPairs.length
    ? `${visiblePointPairs
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
      .join(' ')} L ${visiblePointPairs[visiblePointPairs.length - 1].x},${baselineY} L ${visiblePointPairs[0].x},${baselineY} Z`
    : '';

  const yMid = (yMin + yMax) / 2;
  const yTicks = [yMin, yMid, yMax];
  const xTicks = useLogXScale
    ? buildTicks({ min: safeXMin, max: xMax }, 'log', 4)
    : Array.from({ length: 4 }, (_, index) => xMin + xRange * (index / 3));
  const xGridTicks = xTicks;

  return {
    width: safeWidth,
    height: safeHeight,
    padding,
    points,
    areaPath,
    xTicks,
    yTicks,
    xGridTicks,
    yGridTicks: yTicks,
    formatX: (value) => formatTick(value, { min: xMin, max: xMax }, xScaleType),
    formatY: (value) => formatTick(value, { min: yMin, max: yMax }, 'linear'),
    xScale,
    xInvert,
    yScale,
    xMin,
    xMax,
    plotWidth,
    plotHeight,
    step,
  };
}

function attachSparklineHover({ sparkline, sparklineGrid, tooltip, marker, chart, xValues, yValues, yLabelLatex = 'y', xLabelLatex = 'x' }) {
  if (!sparkline || !tooltip || !marker || !chart) return;

  const updateHover = (event) => {
    const bounds = sparkline.getBoundingClientRect();
    const wrapperBounds = sparkline.parentElement?.getBoundingClientRect() || bounds;
    const gridBounds = sparklineGrid?.getBoundingClientRect() || bounds;
    const gridBox = sparklineGrid?.getBBox?.() || {
      x: chart.padding.left,
      y: chart.padding.top,
      width: chart.plotWidth,
      height: chart.plotHeight,
    };
    const gridOffsetX = gridBounds.left - wrapperBounds.left;
    const gridOffsetY = gridBounds.top - wrapperBounds.top;
    const gridScaleX = gridBox.width ? gridBounds.width / gridBox.width : bounds.width / chart.width;
    const gridScaleY = gridBox.height ? gridBounds.height / gridBox.height : bounds.height / chart.height;
    const svgPoint = sparkline.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const ctm = sparkline.getScreenCTM();
    if (!ctm) return;
    const transformed = svgPoint.matrixTransform(ctm.inverse());
    const gridXMin = gridBox.x;
    const gridXMax = gridBox.x + gridBox.width;
    const localX = clamp(transformed.x, gridXMin, gridXMax);
    const xValue = chart.xInvert(localX);
    const clampedDataX = clamp(xValue, xValues[0], xValues[xValues.length - 1]);
    let upperIndex = xValues.findIndex((value) => value >= clampedDataX);
    if (upperIndex === -1) upperIndex = xValues.length - 1;
    const lowerIndex = Math.max(0, upperIndex - 1);
    const xLower = xValues[lowerIndex];
    const xUpper = xValues[upperIndex];
    const span = xUpper - xLower || 1;
    const t = (clampedDataX - xLower) / span;
    const interpolatedY = yValues[lowerIndex] + t * (yValues[upperIndex] - yValues[lowerIndex]);
    const markerX = chart.xScale(clampedDataX);
    const markerY = chart.yScale(interpolatedY);

    marker.setAttribute('cx', markerX);
    marker.setAttribute('cy', markerY);
    marker.classList.add('chart__sparkline-marker--visible');

    tooltip.innerHTML = `
      <div class="chart__sparkline-tooltip-row">
        <span class="chart__sparkline-tooltip-pair">
          <span class="chart__sparkline-tooltip-key">
            <span class="math-label" data-latex="${yLabelLatex}"></span>
          </span>
          <span class="chart__sparkline-tooltip-value">${chart.formatY(interpolatedY)}</span>
        </span>
        <span class="chart__sparkline-tooltip-pair">
          <span class="chart__sparkline-tooltip-key">
            <span class="math-label" data-latex="${xLabelLatex}"></span>
          </span>
          <span class="chart__sparkline-tooltip-value">${formatTick(clampedDataX, { min: chart.xMin, max: chart.xMax }, 'linear')}</span>
        </span>
      </div>
    `;
    renderMathLabels(tooltip);

    const tooltipWidth = tooltip.offsetWidth || 140;
    const tooltipHeight = tooltip.offsetHeight || 42;
    const markerLeft = gridOffsetX + (markerX - gridBox.x) * gridScaleX;
    const markerTop = gridOffsetY + (markerY - gridBox.y) * gridScaleY;
    const desiredLeft = markerLeft - tooltipWidth / 2;
    const desiredTop = markerTop - tooltipHeight - 12;
    const tooltipPadding = 4;
    const minLeft = gridOffsetX + tooltipPadding;
    const maxLeft = Math.max(minLeft, gridOffsetX + gridBounds.width - tooltipWidth - tooltipPadding);
    const minTop = gridOffsetY + tooltipPadding;
    const maxTop = Math.max(minTop, gridOffsetY + gridBounds.height - tooltipHeight - tooltipPadding);

    tooltip.style.left = `${clamp(desiredLeft, minLeft, maxLeft)}px`;
    tooltip.style.top = `${clamp(desiredTop, minTop, maxTop)}px`;
    tooltip.classList.add('chart__sparkline-tooltip--visible');
  };

  const clearHover = () => {
    marker.classList.remove('chart__sparkline-marker--visible');
    tooltip.classList.remove('chart__sparkline-tooltip--visible');
  };

  sparkline.addEventListener('pointerenter', updateHover);
  sparkline.addEventListener('pointermove', updateHover);
  sparkline.addEventListener('pointerleave', clearHover);
  sparkline.addEventListener('blur', clearHover);
}


async function loadSolutionProfiles(solution) {
  if (!solution || !solution.folderName || !solution.profileFileBase) return null;
  const cacheKey = `${solution.folderName}/${solution.profileFileBase}`;
  if (solutionProfileCache.has(cacheKey)) return solutionProfileCache.get(cacheKey);

  const url = `${scientificDataBaseUrl}/${solution.folderName}/${solution.profileFileBase}.json.gz`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  const payload = await parseMaybeCompressedJson(buffer);

  if (!payload?.quantities?.length || !Array.isArray(payload.data)) {
    return null;
  }

  const quantityIndexMap = payload.quantities.reduce((accumulator, name, index) => {
    accumulator[name] = index;
    return accumulator;
  }, {});

  const getSeries = (name) => payload.data.map((row) => Number(row[quantityIndexMap[name]])).filter((value) => Number.isFinite(value));
  const baseProfiles = {
    x: getSeries('x'),
    pressure: getSeries('P'),
    density: getSeries('rho'),
    temperature: getSeries('T'),
    radialVelocity: getSeries('vr'),
    toroidalVelocity: getSeries('vphi'),
    verticalVelocity: getSeries('vz'),
    radialMagneticField: getSeries('Br'),
    toroidalMagneticField: getSeries('Bphi'),
    verticalMagneticField: getSeries('Bz'),
  };

  const psiProfiles = {
    x: getSeries('z_psi'),
    r: getSeries('r_psi'),
    pressure: getSeries('P_psi'),
    density: getSeries('rho_psi'),
    temperature: getSeries('T_psi'),
    radialVelocity: getSeries('vr_psi'),
    toroidalVelocity: getSeries('vphi_psi'),
    verticalVelocity: getSeries('vz_psi'),
    radialMagneticField: getSeries('Br_psi'),
    toroidalMagneticField: getSeries('Bphi_psi'),
    verticalMagneticField: getSeries('Bz_psi'),
  };

  const profiles = {
    standard: baseProfiles,
    psi: psiProfiles,
  };

  const standardLength = baseProfiles.x.length && Object.values(baseProfiles).every((values) => values.length === baseProfiles.x.length);
  const psiLength = psiProfiles.x.length && Object.values(psiProfiles).every((values) => values.length === psiProfiles.x.length);
  const consistentLength = standardLength && psiLength;
  if (!consistentLength) return null;

  solutionProfileCache.set(cacheKey, profiles);
  return profiles;
}

function initJetRenderer() {
  const container = document.getElementById('jet-surface-3d');
  if (!container || typeof THREE === 'undefined' || jetRenderer) return;

  jetScene = new THREE.Scene();
  jetScene.background = new THREE.Color(0x000000);

  const width = container.clientWidth || 480;
  const height = container.clientHeight || 320;
  jetCamera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000000000);
  jetCamera.position.set(-5.0, -20.0, 10.0);
  jetCamera.lookAt(0, 0, 0);

  jetRenderer = new THREE.WebGLRenderer({ antialias: true });
  jetRenderer.setSize(width, height);
  jetRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(jetRenderer.domElement);
  jetControls = new OrbitControls(jetCamera, jetRenderer.domElement);
  jetControls.enableDamping = true;
  jetControls.dampingFactor = 0.08;
  jetControls.rotateSpeed = 0.9;
  jetControls.zoomSpeed = 1.1;
  jetControls.panSpeed = 0.7;
  jetControls.target.set(0, 0, 0);
  jetControls.update();

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(2.5, 3, 4);
  jetScene.add(ambient, dir);

  const animate = () => {
    jetAnimationFrameId = requestAnimationFrame(animate);
    if (jetControls) jetControls.update();
    jetRenderer.render(jetScene, jetCamera);
  };
  animate();

  window.addEventListener('resize', () => {
    resizeJetRendererToContainer();
  });
}



function resetJetCameraView() {
  if (!jetCamera || !jetControls) return;
  jetCamera.position.set(-5.0, -20.0, 10.0);
  jetControls.target.set(0, 0, 0);
  jetControls.update();
}


function resizeJetRendererToContainer() {
  const container = document.getElementById('jet-surface-3d');
  if (!container || !jetRenderer || !jetCamera) return;
  const w = container.clientWidth || 480;
  const h = container.clientHeight || 320;
  jetCamera.aspect = w / h;
  jetCamera.updateProjectionMatrix();
  jetRenderer.setSize(w, h);
}

function syncSurfaceHeightWithProfiles() {
  if (!chartProfiles || !chartSurface3d) return;
  const profilesHeight = chartProfiles.getBoundingClientRect().height;
  if (!Number.isFinite(profilesHeight) || profilesHeight <= 0) return;
  chartSurface3d.style.height = `${Math.ceil(profilesHeight)}px`;
  resizeJetRendererToContainer();
}

function interpolateProfileValue(xValues, yValues, targetX) {
  if (!Array.isArray(xValues) || !Array.isArray(yValues) || xValues.length !== yValues.length || xValues.length === 0) {
    return NaN;
  }
  const tx = Number(targetX);
  if (!Number.isFinite(tx)) return NaN;

  let prevX = Number(xValues[0]);
  let prevY = Number(yValues[0]);
  if (!Number.isFinite(prevX) || !Number.isFinite(prevY)) return NaN;
  if (xValues.length === 1) return prevY;

  for (let i = 1; i < xValues.length; i += 1) {
    const currX = Number(xValues[i]);
    const currY = Number(yValues[i]);
    if (!Number.isFinite(currX) || !Number.isFinite(currY)) continue;
    if ((tx >= prevX && tx <= currX) || (tx >= currX && tx <= prevX)) {
      const span = currX - prevX;
      if (Math.abs(span) < 1e-12) return currY;
      const t = (tx - prevX) / span;
      return prevY + (currY - prevY) * t;
    }
    prevX = currX;
    prevY = currY;
  }
  return prevY;
}

const INFERNO_BASE_STOPS = [
  [0.001462, 0.000466, 0.013866],
  [0.016561, 0.013136, 0.080282],
  [0.046915, 0.030324, 0.150164],
  [0.092990, 0.045583, 0.234358],
  [0.142378, 0.046242, 0.308553],
  [0.197297, 0.038400, 0.367535],
  [0.258234, 0.038571, 0.406485],
  [0.318195, 0.055634, 0.425116],
  [0.381047, 0.091017, 0.418647],
  [0.442910, 0.130438, 0.404045],
  [0.505851, 0.170642, 0.380989],
  [0.570920, 0.210721, 0.350404],
  [0.636902, 0.257270, 0.304148],
  [0.701769, 0.314749, 0.244608],
  [0.763675, 0.385407, 0.172684],
  [0.819651, 0.471133, 0.093752],
  [0.865006, 0.578000, 0.050383],
  [0.938675, 0.735683, 0.171529],
  [0.978422, 0.877281, 0.349178],
  [0.988362, 0.998364, 0.644924],
];

const INFERNO_STOPS = Array.from({ length: 256 }, (_, index) => {
  const scaledIndex = (index / 255) * (INFERNO_BASE_STOPS.length - 1);
  const lowerIndex = Math.floor(scaledIndex);
  const upperIndex = Math.min(lowerIndex + 1, INFERNO_BASE_STOPS.length - 1);
  const progress = scaledIndex - lowerIndex;
  const lowerColor = INFERNO_BASE_STOPS[lowerIndex];
  const upperColor = INFERNO_BASE_STOPS[upperIndex];

  return [
    lowerColor[0] + (upperColor[0] - lowerColor[0]) * progress,
    lowerColor[1] + (upperColor[1] - lowerColor[1]) * progress,
    lowerColor[2] + (upperColor[2] - lowerColor[2]) * progress,
  ];
});

// Keep the lowest density visible against the black 3D scene background.
const INFERNO_MINIMUM_VISIBLE_PROGRESS = 0.1;
const INFERNO_LOGARITHMIC_PROGRESS_SCALE = 9;

function getFinitePositiveValues(values) {
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function createInfernoDensityMapper(logDensityMin, logDensityMax, minimumRange = 1e-6) {
  const safeRange = Math.max(logDensityMax - logDensityMin, minimumRange);

  return (density) => {
    const safeDensity = Number.isFinite(density) && density > 0 ? density : 10 ** logDensityMin;
    const logDensity = Math.log10(safeDensity);
    const normalizedProgress = clamp((logDensity - logDensityMin) / safeRange, 0, 1);
    // Bend the position within Inferno itself logarithmically while preserving
    // both endpoints of the colormap.
    const logarithmicProgress = Math.log10(
      1 + INFERNO_LOGARITHMIC_PROGRESS_SCALE * normalizedProgress
    ) / Math.log10(1 + INFERNO_LOGARITHMIC_PROGRESS_SCALE);
    const progress = INFERNO_MINIMUM_VISIBLE_PROGRESS
      + logarithmicProgress * (1 - INFERNO_MINIMUM_VISIBLE_PROGRESS);
    const scaledIndex = progress * (INFERNO_STOPS.length - 1);
    const lowerIndex = Math.floor(scaledIndex);
    const upperIndex = Math.min(lowerIndex + 1, INFERNO_STOPS.length - 1);
    const mix = scaledIndex - lowerIndex;
    const lowerColor = INFERNO_STOPS[lowerIndex];
    const upperColor = INFERNO_STOPS[upperIndex];

    return new THREE.Color(
      lowerColor[0] + (upperColor[0] - lowerColor[0]) * mix,
      lowerColor[1] + (upperColor[1] - lowerColor[1]) * mix,
      lowerColor[2] + (upperColor[2] - lowerColor[2]) * mix,
    ).convertSRGBToLinear();
  };
}


function createInfernoDensityMapperFromValues(densityValues) {
  const finitePositiveDensities = getFinitePositiveValues(densityValues);
  const densityMin = finitePositiveDensities.length ? Math.min(...finitePositiveDensities) : 1e-10;
  const densityMax = finitePositiveDensities.length ? Math.max(...finitePositiveDensities) : 1;

  return createInfernoDensityMapper(Math.log10(densityMin), Math.log10(densityMax));
}

function buildJetSurfaceMesh(rValues, zValues, densityValues = [], phiSegments = 64, center = null, logDensityMinOverride = null, logDensityMaxOverride = null, reflectAcrossXY = false) {
  if (!Array.isArray(rValues) || !Array.isArray(zValues)) return null;
  if (!rValues.length || rValues.length !== zValues.length) return null;

  const nz = rValues.length;
  const nphi = phiSegments;
  const positions = [];
  const colors = [];
  const indices = [];
  const finitePositiveDensities = getFinitePositiveValues(densityValues);
  const computedLogDensityMin = finitePositiveDensities.length ? Math.log10(Math.min(...finitePositiveDensities)) : 0;
  const defaultLogDensityMin = computedLogDensityMin - 0.5;
  const defaultLogDensityMax = 0.0;
  const logDensityMin = Number.isFinite(logDensityMinOverride) ? logDensityMinOverride : defaultLogDensityMin;
  const logDensityMax = Number.isFinite(logDensityMaxOverride) ? logDensityMaxOverride : defaultLogDensityMax;
  const densityToColor = createInfernoDensityMapper(logDensityMin, logDensityMax, 1e-12);

  for (let i = 0; i < nz; i += 1) {
    const r = Math.abs(Number(rValues[i]));
    const originalZ = Number(zValues[i]);
    const z = reflectAcrossXY ? -originalZ : originalZ;
    const density = Number(densityValues[i]);
    if (!Number.isFinite(r) || !Number.isFinite(z)) continue;
    const vertexColor = densityToColor(density);
    for (let j = 0; j < nphi; j += 1) {
      const phi = (j / nphi) * Math.PI * 2;
      const x = r * Math.cos(phi);
      const y = r * Math.sin(phi);
      positions.push(x, y, z);
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }
  }

  for (let i = 0; i < nz - 1; i += 1) {
    for (let j = 0; j < nphi; j += 1) {
      const jp1 = (j + 1) % nphi;
      const a = i * nphi + j;
      const b = i * nphi + jp1;
      const c = (i + 1) * nphi + j;
      const d = (i + 1) * nphi + jp1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  // Use an unlit material so the colormap matches scientific plotting (no scene-light washout).
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  if (center) {
    mesh.position.sub(center);
  }
  return mesh;
}

function buildDiskSurfaceMesh(rValues, zValues, densityValues = [], nphi = 64, center = null, reflectAcrossXY = false) {
  if (!Array.isArray(rValues) || !Array.isArray(zValues) || rValues.length !== zValues.length || rValues.length < 2) {
    return null;
  }

  const nz = rValues.length;
  const positions = [];
  const colors = [];
  const indices = [];
  const densityToColor = createInfernoDensityMapperFromValues(densityValues);

  for (let i = 0; i < nz; i += 1) {
    const r = Math.abs(Number(rValues[i]));
    const originalZ = Number(zValues[i]);
    const z = reflectAcrossXY ? -originalZ : originalZ;
    if (!Number.isFinite(r) || !Number.isFinite(z)) continue;
    for (let j = 0; j < nphi; j += 1) {
      const phi = (j / nphi) * Math.PI * 2;
      positions.push(r * Math.cos(phi), r * Math.sin(phi), z);
      const c = densityToColor(Number(densityValues[i]));
      colors.push(c.r, c.g, c.b);
    }
  }

  for (let i = 0; i < nz - 1; i += 1) {
    for (let j = 0; j < nphi; j += 1) {
      const jp1 = (j + 1) % nphi;
      const a = i * nphi + j;
      const b = i * nphi + jp1;
      const c = (i + 1) * nphi + j;
      const d = (i + 1) * nphi + jp1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  if (center) {
    mesh.position.sub(center);
  }
  return mesh;
}


function buildDiskOuterClosureMesh(rOuter, zOuter, densityOuter, nphi = 64, center = null) {
  if (!Number.isFinite(rOuter) || rOuter <= 0 || !Number.isFinite(zOuter) || !Number.isFinite(densityOuter)) return null;

  const positions = [];
  const colors = [];
  const indices = [];
  const densityToColor = createInfernoDensityMapperFromValues([densityOuter]);
  const color = densityToColor(densityOuter);

  for (let j = 0; j < nphi; j += 1) {
    const phi = (j / nphi) * Math.PI * 2;
    const x = rOuter * Math.cos(phi);
    const y = rOuter * Math.sin(phi);
    positions.push(x, y, zOuter);
    positions.push(x, y, -zOuter);
    colors.push(color.r, color.g, color.b);
    colors.push(color.r, color.g, color.b);
  }

  for (let j = 0; j < nphi; j += 1) {
    const jp1 = (j + 1) % nphi;
    const a = j * 2;
    const b = jp1 * 2;
    const c = a + 1;
    const d = b + 1;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  if (center) mesh.position.sub(center);
  return mesh;
}

function renderJetSurface(solution) {
  initJetRenderer();
  if (!jetScene || !solution?.profiles?.psi) return;

  const clearMesh = (meshRefSetter, mesh) => {
    if (!mesh) return;
    jetScene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    meshRefSetter(null);
  };

  clearMesh((value) => { jetMesh = value; }, jetMesh);
  clearMesh((value) => { jetMeshMirror = value; }, jetMeshMirror);
  clearMesh((value) => { jetDiskMesh = value; }, jetDiskMesh);
  clearMesh((value) => { jetDiskMeshMirror = value; }, jetDiskMeshMirror);
  clearMesh((value) => { jetDiskOuterMesh = value; }, jetDiskOuterMesh);

  const rValues = solution.profiles.psi.r;
  const zValues = solution.profiles.psi.x;
  const densityValues = solution.profiles.psi.density;
  const epValue = Number(solution?.g1);
  const xIdValue = Number(solution?.g17);
  const zIdValue = Number(solution?.g21);
  const diskRMin = Math.abs(interpolateProfileValue(zValues, rValues, zIdValue));
  const diskRMax = 4.0;
  const diskRadialSamples = 72;
  const diskRValues = Array.from({ length: diskRadialSamples }, (_, i) => {
    const t = diskRadialSamples <= 1 ? 0 : i / (diskRadialSamples - 1);
    return diskRMin + (diskRMax - diskRMin) * t;
  });
  const diskZValues = diskRValues.map((r) => epValue * r * xIdValue);
  const xiValue = Number(solution?.g6);
  const rhoPsiAtZid = interpolateProfileValue(zValues, densityValues, zIdValue);
  const exponent = 2.0 * (0.75 + 0.5 * xiValue) - 3.0;
  const diskDensityValues = diskRValues.map((r) => {
    const rho = interpolateProfileValue(rValues, densityValues, r);
    if (!Number.isFinite(rhoPsiAtZid) || !Number.isFinite(rho) || !Number.isFinite(r) || r <= 0 || !Number.isFinite(exponent)) return NaN;
    return rhoPsiAtZid * rho * (r ** exponent);
  });

  // Keep the 3D structure centered on the world origin.
  // We render both +z and mirrored -z branches, so applying an automatic
  // z recentering would offset the combined disk+jet away from (0, 0, 0).
  const center = new THREE.Vector3(0, 0, 0);

  const jetLogDensityMax = Number.isFinite(rhoPsiAtZid) && rhoPsiAtZid > 0 ? Math.log10(rhoPsiAtZid) : null;
  const finitePositiveDensities = getFinitePositiveValues(densityValues);
  const jetLogDensityMin = finitePositiveDensities.length ? Math.log10(Math.min(...finitePositiveDensities)) : null;
  jetMesh = buildJetSurfaceMesh(rValues, zValues, densityValues, 72, center, jetLogDensityMin, jetLogDensityMax);
  jetMeshMirror = buildJetSurfaceMesh(rValues, zValues, densityValues, 72, center, jetLogDensityMin, jetLogDensityMax, true);
  if (jetMesh) jetScene.add(jetMesh);
  if (jetMeshMirror) jetScene.add(jetMeshMirror);

  if (
    Number.isFinite(epValue)
    && Number.isFinite(xIdValue)
    && Number.isFinite(diskRMin)
    && Number.isFinite(diskRMax)
    && diskRMin > 0
    && diskRMin < diskRMax
    && diskRValues.length >= 2
    && diskDensityValues.length >= 2
  ) {
    jetDiskMesh = buildDiskSurfaceMesh(diskRValues, diskZValues, diskDensityValues, 72, center, false);
    jetDiskMeshMirror = buildDiskSurfaceMesh(diskRValues, diskZValues, diskDensityValues, 72, center, true);
    if (jetDiskMesh) jetScene.add(jetDiskMesh);
    if (jetDiskMeshMirror) jetScene.add(jetDiskMeshMirror);

    const diskROuter = Number(diskRValues[diskRValues.length - 1]);
    const diskZOuter = Number(diskZValues[diskZValues.length - 1]);
    const diskDensityOuter = Number(diskDensityValues[diskDensityValues.length - 1]);
    jetDiskOuterMesh = buildDiskOuterClosureMesh(diskROuter, diskZOuter, diskDensityOuter, 72, center);
    if (jetDiskOuterMesh) jetScene.add(jetDiskOuterMesh);
  }
}

async function ensureSolutionProfiles(solution) {
  if (!solution) return null;
  if (solution.profiles) return solution;
  solution.profiles = await loadSolutionProfiles(solution);
  return solution;
}

function renderProfiles(solution, options = {}) {
  const selectedProfileAxis = profileAxisSelect?.value === 'z' ? 'psi' : 'standard';
  const xLabelLatex = selectedProfileAxis === 'psi' ? 'z(\\Psi)' : 'x';
  const profiles = solution.profiles?.[selectedProfileAxis] ?? solution.profiles?.standard;
  if (!profiles) return;
  const xSmValue = selectedProfileAxis === 'psi' ? Number(solution?.g22) : Number(solution?.g18);
  const xAValue = selectedProfileAxis === 'psi' ? Number(solution?.g23) : Number(solution?.g19);
  const xMaxValue = selectedProfileAxis === 'psi' ? Number(solution?.g24) : Number(solution?.g20);
  const profileCurveColor = getComputedStyle(document.documentElement).getPropertyValue('--color-neutral').trim();
  const series = [
    { label: '<span class="chart__profile-title-text">Density</span><span class="chart__profile-title-math"><span class="math-label" data-latex="\\rho"></span></span>', ariaLabel: 'Density (rho)', key: 'density', color: profileCurveColor, tooltipSymbol: '\\rho' },
    { label: '<span class="chart__profile-title-text">Thermal pressure</span><span class="chart__profile-title-math"><span class="math-label" data-latex="P"></span></span>', ariaLabel: 'Thermal pressure (P)', key: 'pressure', color: profileCurveColor, tooltipSymbol: 'P' },
    { label: '<span class="chart__profile-title-text">Temperature</span><span class="chart__profile-title-math"><span class="math-label" data-latex="T"></span></span>', ariaLabel: 'Temperature (T)', key: 'temperature', color: profileCurveColor, tooltipSymbol: 'T' },
    { label: '<span class="chart__profile-title-text">Radial velocity</span><span class="chart__profile-title-math"><span class="math-label" data-latex="u_r"></span></span>', ariaLabel: 'Radial velocity (u_r)', key: 'radialVelocity', color: profileCurveColor, tooltipSymbol: 'u_r' },
    { label: '<span class="chart__profile-title-text">Toroidal velocity</span><span class="chart__profile-title-math"><span class="math-label" data-latex="u_\\phi"></span></span>', ariaLabel: 'Toroidal velocity (u_phi)', key: 'toroidalVelocity', color: profileCurveColor, tooltipSymbol: 'u_\\phi' },
    { label: '<span class="chart__profile-title-text">Vertical velocity</span><span class="chart__profile-title-math"><span class="math-label" data-latex="u_z"></span></span>', ariaLabel: 'Vertical velocity (u_z)', key: 'verticalVelocity', color: profileCurveColor, tooltipSymbol: 'u_z' },
    { label: '<span class="chart__profile-title-text">Radial magnetic field</span><span class="chart__profile-title-math"><span class="math-label" data-latex="B_r"></span></span>', ariaLabel: 'Radial magnetic field (B_r)', key: 'radialMagneticField', color: profileCurveColor, tooltipSymbol: 'B_r' },
    { label: '<span class="chart__profile-title-text">Toroidal magnetic field</span><span class="chart__profile-title-math"><span class="math-label" data-latex="B_{\\phi}"></span></span>', ariaLabel: 'Toroidal magnetic field (B_phi)', key: 'toroidalMagneticField', color: profileCurveColor, tooltipSymbol: 'B_{\\phi}' },
    { label: '<span class="chart__profile-title-text">Vertical magnetic field</span><span class="chart__profile-title-math"><span class="math-label" data-latex="B_z"></span></span>', ariaLabel: 'Vertical magnetic field (B_z)', key: 'verticalMagneticField', color: profileCurveColor, tooltipSymbol: 'B_z' },
  ];

  const previousScrollLeft = profileContent?.scrollLeft ?? 0;
  profileContent.innerHTML = '';
  const sparklineHeight = 200;

  series.forEach((serie) => {
    const values = profiles[serie.key];

    const card = document.createElement('div');
    card.className = 'chart__profile-card';
    card.innerHTML = `
      <div class="chart__profile-header">
        <div>
          <div class="chart__profile-title">${serie.label}</div>
        </div>
      </div>
      <div class="chart__sparkline-wrapper"></div>
    `;

    profileContent.appendChild(card);

    const sparklineWrapper = card.querySelector('.chart__sparkline-wrapper');
    const wrapperWidth = sparklineWrapper?.getBoundingClientRect().width ?? 0;
    const chartWidth = Math.max(1, Math.floor(wrapperWidth || 320));
    const profileXDomainOverride = (() => {
      const dataXMin = Math.min(...profiles.x);
      const minPositiveX = profiles.x.reduce((minimum, value) => (
        value > 0 && Number.isFinite(value) ? Math.min(minimum, value) : minimum
      ), Number.POSITIVE_INFINITY);
      const selectedFocus = profileFocusSelect?.value;
      const isLogProfileScale = profileScaleSelect?.value === 'log';
      const buildXDomain = (rawMax) => {
        if (!Number.isFinite(rawMax)) {
          return null;
        }
        const clampedMax = Math.max(dataXMin, rawMax);
        if (isLogProfileScale && clampedMax > 0) {
          const minPositiveVisibleX = profiles.x.reduce((minimum, value) => (
            value > 0 && value <= clampedMax && Number.isFinite(value)
              ? Math.min(minimum, value)
              : minimum
          ), Number.POSITIVE_INFINITY);
          const positiveDataXMin = Number.isFinite(minPositiveVisibleX)
            ? minPositiveVisibleX
            : (Number.isFinite(minPositiveX) ? minPositiveX : clampedMax);
          const roundedMin = 10 ** Math.ceil(Math.log10(positiveDataXMin));
          const roundedMax = 10 ** Math.ceil(Math.log10(clampedMax));
          const domainMax = roundedMax > roundedMin ? roundedMax : roundedMin * 10;
          return { min: roundedMin, max: domainMax };
        }
        return { min: dataXMin, max: clampedMax };
      };
      if (selectedFocus === 'disk-outflow') {
        if (Number.isFinite(xAValue) && xAValue !== 0) {
          return buildXDomain(2 * xAValue);
        }
        return null;
      }
      if (selectedFocus === 'outflow' && Number.isFinite(xMaxValue)) {
        return buildXDomain(xMaxValue);
      }
      if (Number.isFinite(xSmValue)) {
        return buildXDomain(2 * xSmValue);
      }
      return null;
    })();
    const chart = buildProfileChart(
      profiles.x,
      values,
      chartWidth,
      sparklineHeight,
      options.yDomainOverride ?? null,
      profileXDomainOverride,
      options.disableYPadding === true,
      profileScaleSelect?.value === 'log' ? 'log' : 'linear'
    );
    const markerPositionFromXValue = (xValue) => {
      const hasMarker = Number.isFinite(xValue) && Number.isFinite(chart?.xMin) && Number.isFinite(chart?.xMax) &&
        xValue >= chart.xMin && xValue <= chart.xMax;
      if (!hasMarker) return null;
      const markerX = chart.xScale(xValue);
      const insertionIndex = profiles.x.findIndex((x) => x >= xValue);
      const rightIndex = insertionIndex === -1 ? profiles.x.length - 1 : insertionIndex;
      const leftIndex = Math.max(0, rightIndex - 1);
      const xLeft = profiles.x[leftIndex];
      const xRight = profiles.x[rightIndex];
      const yLeft = values[leftIndex];
      const yRight = values[rightIndex];
      const interpolationRatio = xRight !== xLeft ? (xValue - xLeft) / (xRight - xLeft) : 0;
      const yAtX = yLeft + (yRight - yLeft) * interpolationRatio;
      const centerY = chart.yScale(yAtX);
      const pointRadius = 4;
      const markerHalfHeight = pointRadius;
      return {
        x: markerX,
        y: centerY,
        y1: Math.max(chart.padding.top, centerY - markerHalfHeight),
        y2: Math.min(chart.height - chart.padding.bottom, centerY + markerHalfHeight),
      };
    };

    const xSmMarker = markerPositionFromXValue(xSmValue);
    const xAMarker = xAValue === 0 ? null : markerPositionFromXValue(xAValue);

    const gradientId = `sparkline-gradient-${serie.key}`;
    const clipPathId = `sparkline-clip-${serie.key}`;

    sparklineWrapper.innerHTML = `
      <svg class="chart__sparkline" viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-label="${serie.ariaLabel}">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${profileCurveColor}" stop-opacity="0.1"></stop>
            <stop offset="100%" stop-color="${profileCurveColor}" stop-opacity="0"></stop>
          </linearGradient>
          <clipPath id="${clipPathId}">
            <rect x="${chart.padding.left}" y="${chart.padding.top}" width="${chart.width - chart.padding.left - chart.padding.right}" height="${chart.height - chart.padding.top - chart.padding.bottom}"></rect>
          </clipPath>
        </defs>
        <g class="chart__sparkline-grid" aria-hidden="true">
          ${chart.yGridTicks.map((tick) => `
            <line x1="${chart.padding.left}" y1="${chart.padding.top + ((chart.yGridTicks[2] - tick) / (chart.yGridTicks[2] - chart.yGridTicks[0] || 1)) * (chart.height - chart.padding.top - chart.padding.bottom)}"
                  x2="${chart.width - chart.padding.right}" y2="${chart.padding.top + ((chart.yGridTicks[2] - tick) / (chart.yGridTicks[2] - chart.yGridTicks[0] || 1)) * (chart.height - chart.padding.top - chart.padding.bottom)}"></line>
          `).join('')}
          ${chart.xGridTicks.map((tick) => `
            <line x1="${chart.xScale(tick)}"
                  y1="${chart.padding.top}" x2="${chart.xScale(tick)}"
                  y2="${chart.height - chart.padding.bottom}"></line>
          `).join('')}
        </g>
        <g class="chart__sparkline-axes" aria-hidden="true">
          <line x1="${chart.padding.left}" y1="${chart.padding.top}" x2="${chart.padding.left}" y2="${chart.height - chart.padding.bottom}"></line>
          <line x1="${chart.padding.left}" y1="${chart.height - chart.padding.bottom}" x2="${chart.width - chart.padding.right}" y2="${chart.height - chart.padding.bottom}"></line>
          ${chart.yTicks.map((tick) => `
            <line x1="${chart.padding.left - 4}" y1="${chart.padding.top + ((chart.yTicks[2] - tick) / (chart.yTicks[2] - chart.yTicks[0] || 1)) * (chart.height - chart.padding.top - chart.padding.bottom)}"
                  x2="${chart.padding.left}" y2="${chart.padding.top + ((chart.yTicks[2] - tick) / (chart.yTicks[2] - chart.yTicks[0] || 1)) * (chart.height - chart.padding.top - chart.padding.bottom)}"></line>
          `).join('')}
          ${chart.xTicks.map((tick) => `
            <line x1="${chart.xScale(tick)}"
                  y1="${chart.height - chart.padding.bottom}" x2="${chart.xScale(tick)}"
                  y2="${chart.height - chart.padding.bottom + 4}"></line>
          `).join('')}
        </g>
        <g class="chart__sparkline-labels" aria-hidden="true">
          ${chart.yTicks.map((tick) => `
            <text x="${chart.padding.left - 8}" y="${chart.padding.top + ((chart.yTicks[2] - tick) / (chart.yTicks[2] - chart.yTicks[0] || 1)) * (chart.height - chart.padding.top - chart.padding.bottom) + 4}" text-anchor="end">
              ${chart.formatY(tick)}
            </text>
          `).join('')}
          ${chart.xTicks.map((tick) => `
            <text x="${chart.xScale(tick)}"
                  y="${chart.height - chart.padding.bottom + 18}" text-anchor="middle">
              ${chart.formatX(tick)}
            </text>
          `).join('')}
          <foreignObject class="chart__sparkline-axis-label" x="${chart.width / 2 - 24}" y="${chart.height - chart.padding.bottom + 18}" width="48" height="16">
            <div xmlns="http://www.w3.org/1999/xhtml" class="chart__sparkline-axis-label-text">
              <span class="math-label" data-latex="${xLabelLatex}"></span>
            </div>
          </foreignObject>
        </g>
        <g clip-path="url(#${clipPathId})">
          <path class="chart__sparkline-area" d="${chart.areaPath}" fill="url(#${gradientId})"></path>
          <polyline class="chart__sparkline-line" fill="none" stroke="${serie.color}" stroke-width="2" points="${chart.points}" />
          ${xSmMarker ? `<circle class="chart__sparkline-xsm-line" cx="${xSmMarker.x}" cy="${xSmMarker.y}" r="2.5" style="color:${serie.color};"></circle>` : ''}
          ${xAMarker ? `<circle class="chart__sparkline-xa-line" cx="${xAMarker.x}" cy="${xAMarker.y}" r="2.5" style="color:${serie.color};"></circle>` : ''}
          <circle class="chart__sparkline-marker" r="4" cx="0" cy="0"></circle>
        </g>
      </svg>
      <div class="chart__sparkline-tooltip" role="status" aria-live="polite"></div>
    `;

    const sparkline = card.querySelector('.chart__sparkline');
    const sparklineGrid = card.querySelector('.chart__sparkline-grid');
    const tooltip = card.querySelector('.chart__sparkline-tooltip');
    const marker = card.querySelector('.chart__sparkline-marker');
    attachSparklineHover({
      sparkline,
      sparklineGrid,
      tooltip,
      marker,
      chart,
      xValues: profiles.x,
      yValues: values,
      yLabelLatex: serie.tooltipSymbol,
      xLabelLatex,
    });
  });

  renderMathLabels(profileContent);
  if (profileContent) {
    profileContent.scrollLeft = previousScrollLeft;
  }
}

function renderFlatProfiles() {
  const xValues = [1, 10];
  const flatValues = xValues.map(() => 0);

  const flatProfileSet = {
    x: xValues,
    pressure: flatValues,
    density: flatValues,
    temperature: flatValues,
    radialVelocity: flatValues,
    toroidalVelocity: flatValues,
    verticalVelocity: flatValues,
    radialMagneticField: flatValues,
    toroidalMagneticField: flatValues,
    verticalMagneticField: flatValues,
  };

  renderProfiles({
    profiles: {
      standard: flatProfileSet,
      psi: flatProfileSet,
    },
  }, {
    yDomainOverride: { min: -1, max: 1 },
    disableYPadding: true,
  });
}

function setProfilesOverlayVisible(visible) {
  if (!chartProfiles) return;
  chartProfiles.classList.toggle('chart__profiles--empty', visible);
}

function setDetailedViewsLoading(loading) {
  if (chartProfiles) {
    chartProfiles.setAttribute('aria-busy', String(loading));
  }
  if (chartSurface3d) {
    chartSurface3d.setAttribute('aria-busy', String(loading));
  }
  if (profileLoadingStatus) {
    profileLoadingStatus.hidden = !loading;
  }
  if (jetLoadingStatus) {
    jetLoadingStatus.hidden = !loading;
  }
}

async function selectSolution(index) {
  selectedSolutionIndex = index;
  pinnedSolutionIndex = index;
  Array.from(pointsGroup.children).forEach((circle, idx) => {
    circle.classList.toggle('chart__point--selected', idx === index);
  });

  const solution = currentSolutions[index];
  if (solution) {
    renderHoveredValues(solution);
  }
  setDetailedViewsLoading(Boolean(solution && !solution.profiles));

  try {
    const selectedSolution = await ensureSolutionProfiles(solution);
    if (selectedSolutionIndex !== index) return;

    resetJetCameraView();
    if (selectedSolution?.profiles) {
      renderProfiles(selectedSolution);
      renderJetSurface(selectedSolution);
      setProfilesOverlayVisible(false);
    }
  } finally {
    if (selectedSolutionIndex === index) {
      setDetailedViewsLoading(false);
    }
  }
}

function resetProfiles() {
  selectedSolutionIndex = null;
  const clearResetMesh = (meshRefSetter, mesh) => {
    if (!jetScene || !mesh) return;
    jetScene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    meshRefSetter(null);
  };
  clearResetMesh((value) => { jetMesh = value; }, jetMesh);
  clearResetMesh((value) => { jetMeshMirror = value; }, jetMeshMirror);
  clearResetMesh((value) => { jetDiskMesh = value; }, jetDiskMesh);
  clearResetMesh((value) => { jetDiskMeshMirror = value; }, jetDiskMeshMirror);
  clearResetMesh((value) => { jetDiskOuterMesh = value; }, jetDiskOuterMesh);
  pinnedSolutionIndex = null;
  renderFlatProfiles();
  setProfilesOverlayVisible(true);
}

function updateScaleSelect(axis, scaleType) {
  const select = scaleSelects.find((option) => option.dataset.scaleSelect === axis);
  if (!select) return;

  select.value = scaleType;
  updateCustomSelectDisplay(select);
}

function syncAxisSelect(axis, value, sourceSelect) {
  const targetSelects = axisSelects.filter((select) => select.dataset.axisSettings === axis);
  targetSelects.forEach((select) => {
    if (select === sourceSelect) return;
    select.value = value;
    updateCustomSelectDisplay(select);
  });
  updateAxisLabel(axis);
}

function updateAxisLabel(axis) {
  const select = axisSelects.find((option) => option.dataset.axisSettings === axis);
  const label = axisLabelElements[axis];
  if (!select || !label) return;

  const selectedOption = select.options[select.selectedIndex];
  const name = selectedOption?.dataset.name || selectedOption?.textContent || select.value;
  const latex = selectedOption?.dataset.latex;

  label.innerHTML = `
    <span class="chart__axis-label-name">${name}</span>
    <span class="chart__axis-label-symbol">
      ${latex ? `<span class="math-label" data-latex="${latex}"></span>` : ''}
    </span>
  `;
  renderMathLabels(label);
}

async function updateChart(options = {}) {
  const {
    preserveAxisLimits = false,
    preserveSelection = false,
  } = options;
  const baseParams = sliders.reduce((acc, slider) => {
    const value = Number(slider.element.value);
    const selectedParameterValue = getSelectedParameterValue(slider.id, value);
    const selectedParameterLabel = getSelectedParameterLabel(slider.id, value);
    if (slider.labelValue) {
      slider.labelValue.textContent = formatParameterValue(selectedParameterLabel);
    }
    acc[slider.id] = value;
    return acc;
  }, {});

  const xKey = xAxisKey;
  const yKey = yAxisKey;
  const solutions = await buildSolutions(baseParams, selectedScenario);
  const allScenarioSolutions = await buildSolutions(baseParams, 'SM');
  currentSolutions = solutions;
  const hasPreservedSelection = preserveSelection
    && selectedSolutionIndex !== null
    && selectedSolutionIndex < currentSolutions.length;
  if (!hasPreservedSelection) {
    resetProfiles();
  }
  restorePinnedValues();
  hideScatterTooltip();

  if (!solutions.length) {
    pointsGroup.innerHTML = '';
    return;
  }

  const domainSourceSolutions = allScenarioSolutions.length ? allScenarioSolutions : solutions;
  const computedXDomain = getDomain(domainSourceSolutions.map(solution => solution[xKey]), xScaleType);
  const computedYDomain = getDomain(domainSourceSolutions.map(solution => solution[yKey]), yScaleType);
  const xDomain = preserveAxisLimits && axisDomainOverrides
    ? axisDomainOverrides.x
    : computedXDomain;
  const yDomain = preserveAxisLimits && axisDomainOverrides
    ? axisDomainOverrides.y
    : computedYDomain;
  axisDomainOverrides = {
    x: { ...xDomain },
    y: { ...yDomain },
  };
  const xTicks = buildTicks(xDomain, xScaleType);
  const yTicks = buildTicks(yDomain, yScaleType);

  resizeChart();

  const xScale = createScale(xDomain, xScaleType, 'x');
  const yScale = createScale(yDomain, yScaleType, 'y');

  renderAxes(xDomain, yDomain, xScale, yScale, xScaleType, yScaleType, xTicks, yTicks);
  renderPoints(solutions, xKey, yKey, xScale, yScale);
  syncSurfaceHeightWithProfiles();
}

sliders.forEach(({ element }) => element.addEventListener('input', updateChart));

scaleSelects.forEach((select) => {
  select.addEventListener('change', () => {
    const axis = select.dataset.scaleSelect;
    const nextScale = select.value;

    if (axis === 'x') {
      xScaleType = nextScale;
    }

    if (axis === 'y') {
      yScaleType = nextScale;
    }

    updateCustomSelectDisplay(select);
    updateChart();
  });
});

const profileCodeMap = {
  'exponential-decrease': 0,
  isothermal: 0,
};

profileSelects.forEach((select) => {
  const code = profileCodeMap[select.value] ?? 0;
  select.dataset.profileCode = String(code);
  select.dataset.previousValue = select.value;
  select.addEventListener('change', () => {
    const previousValue = select.dataset.previousValue ?? select.value;
    const selectedSolution = selectedSolutionIndex !== null ? currentSolutions[selectedSolutionIndex] : null;
    const selectedProfileAxis = profileAxisSelect?.value === 'z' ? 'psi' : 'standard';
    const xAValue = selectedProfileAxis === 'psi' ? Number(selectedSolution?.g23) : Number(selectedSolution?.g19);
    const hasNullAAltitude = Number.isFinite(xAValue) && xAValue === 0;

    if (select.id === 'profile-axis-select' && profileFocusSelect) {
      const axisFocusLatex = profileFocusLatexByAxis[select.value] ?? profileFocusLatexByAxis.x;
      Array.from(profileFocusSelect.options).forEach((option) => {
        const nextLatex = axisFocusLatex[option.value];
        if (!nextLatex) return;
        option.dataset.latex = nextLatex;
        option.textContent = nextLatex;
      });
      updateCustomSelectDisplay(profileFocusSelect);
    }

    if (select.id === 'profile-title-select-1' && select.value === 'disk-outflow' && hasNullAAltitude) {
      select.value = previousValue;
      updateCustomSelectDisplay(select);
      return;
    }

    select.dataset.profileCode = String(profileCodeMap[select.value] ?? 0);
    select.dataset.previousValue = select.value;
    updateCustomSelectDisplay(select);
    const isProfileFocusSelect = select.id === 'profile-title-select-1' || select.id === 'profile-title-select-2' || select.id === 'profile-axis-select';
    if (isProfileFocusSelect) {
      if (selectedSolution?.profiles) {
        renderProfiles(selectedSolution);
      } else if (selectedSolution) {
        ensureSolutionProfiles(selectedSolution).then((solutionWithProfiles) => {
          if (solutionWithProfiles?.profiles) {
            renderProfiles(solutionWithProfiles);
            renderJetSurface(solutionWithProfiles);
          }
        });
      } else {
        renderFlatProfiles();
      }
      return;
    }
    updateChart();
  });
});

axisSelects.forEach((select) => {
  select.addEventListener('change', () => {
    const axis = select.dataset.axisSettings || (select.id.startsWith('x-') ? 'x' : 'y');
    syncAxisSelect(axis, select.value, select);
    if (axis === 'x') {
      xAxisKey = select.value;
    } else if (axis === 'y') {
      yAxisKey = select.value;
    }
    updateChart();
  });
});

populateAxisSelectOptions();

function getSelectedOptionText(select) {
  return select.options[select.selectedIndex]?.textContent || select.value;
}

function renderCustomSelectText(target, text) {
  target.textContent = text;
}

function renderCustomSelectMath(target, text, latex) {
  target.innerHTML = latex
    ? `<span class="math-label" data-latex="${latex}"></span>`
    : text;
}

function buildTextCustomSelect(select) {
  buildCustomSelect(select, {
    renderLabel: (label, select) => renderCustomSelectText(label, getSelectedOptionText(select)),
    renderOption: (item, option) => renderCustomSelectText(item, option.textContent),
  });
}

function buildMathCustomSelect(select) {
  buildCustomSelect(select, {
    usesMath: true,
    renderLabel: (label, select) => {
      const selectedOption = select.options[select.selectedIndex];
      renderCustomSelectMath(label, getSelectedOptionText(select), selectedOption?.dataset.latex);
    },
    renderOption: (item, option) => {
      renderCustomSelectMath(item, option.textContent, option.dataset.latex);
    },
  });
}

scaleSelects.forEach(buildTextCustomSelect);
profileLabelSelects.forEach((select) => {
  const usesMath = select.id === 'profile-title-select-1' || select.id === 'profile-axis-select';
  if (usesMath) {
    buildMathCustomSelect(select);
  } else {
    buildTextCustomSelect(select);
  }
});
axisSelects.forEach(buildMathCustomSelect);

scheduleSelectWidthRefresh();
updateScaleSelect('x', xScaleType);
updateScaleSelect('y', yScaleType);
updateAxisLabel('x');
updateAxisLabel('y');

scenarioButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const scenario = button.dataset.scenario;
    if (scenario === selectedScenario) return;

    selectedScenario = scenario;
    scenarioButtons.forEach((btn) => {
      const isActive = btn === button;
      btn.classList.toggle('chart__toggle-button--active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    updateChart({ preserveAxisLimits: true });
  });
});

window.addEventListener('resize', () => {
  scheduleSelectWidthRefresh();
  updateChart();
  syncSurfaceHeightWithProfiles();
});

window.addEventListener('maes:themechange', () => {
  updateChart({
    preserveAxisLimits: true,
    preserveSelection: true,
  });
});

function closeFloatingControls() {
  closeCustomMenus();
  closeSettingsPanel();
  closeProfileSettingsPanel();
}

function stopPanelClickPropagation(event) {
  event.stopPropagation();
  closeCustomMenus();
}

function bindSettingsPanel({ button, panel, closeOtherPanel, onOpen }) {
  if (!button || !panel) return;

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    closeOtherPanel();
    toggleSettingsPanel(panel, button, onOpen);
  });

  panel.addEventListener('click', stopPanelClickPropagation);
}

document.addEventListener('click', closeFloatingControls);

bindSettingsPanel({
  button: profileSettingsButton,
  panel: profileSettingsPanel,
  closeOtherPanel: closeSettingsPanel,
  onOpen: scheduleSelectWidthRefresh,
});

bindSettingsPanel({
  button: chartSettingsButton,
  panel: chartSettingsPanel,
  closeOtherPanel: closeProfileSettingsPanel,
  onOpen: refreshChartSettingsSelects,
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeFloatingControls();
  }
});

updateChart();
syncSurfaceHeightWithProfiles();

if (resizeObserver && chartControls) {
  resizeObserver.observe(chartControls);
}

if (profileHeightObserver && chartProfiles) {
  profileHeightObserver.observe(chartProfiles);
}

window.addEventListener('load', () => {
  renderMathLabels();

  scheduleSelectWidthRefresh();
  updateChart();
  syncSurfaceHeightWithProfiles();
});

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    scheduleSelectWidthRefresh();
  });
}

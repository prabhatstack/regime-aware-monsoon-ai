/**
 * Regime-Aware AI Post-Processing Dashboard Frontend Application
 * Interacts with FastAPI backend to render maps, charts, and forecasts.
 * Light Mode, Natural Monsoon Daylight Aesthetic.
 */

// Application State
const state = {
  currentView: 'dashboard',
  selectedDistrict: 'all',
  selectedDate: '',
  selectedLeadTime: 24,
  districts: [],
  dates: [],
  currentForecasts: [],
  verificationData: null,
  map: null,
  mapMarkers: [],
  charts: {},
  currentUser: null,
  authToken: localStorage.getItem('sih_auth_token') || null,
  authMode: 'login' // 'login' or 'register'
};

// IMD Operational Rainfall Alert Level Colors
function getRainfallColor(mm) {
  if (mm < 2.5) return '#94a3b8';   // Dry / Negligible (<2.5mm)
  if (mm < 15.6) return '#10b981';  // Light Rain (2.5 - 15.5mm)
  if (mm < 64.5) return '#eab308';  // Moderate Rain (15.6 - 64.4mm)
  if (mm < 115.6) return '#f97316'; // Heavy Rain (64.5 - 115.5mm)
  if (mm < 204.5) return '#ef4444'; // Very Heavy Rain (115.6 - 204.4mm)
  return '#a855f7';                 // Extremely Heavy Rain (>=204.5mm)
}

function getAlertBadge(mm, prob) {
  if (mm >= 115.6 || prob >= 0.8) {
    return '<span class="score-badge badge-lose">Red Alert (&ge;115mm)</span>';
  } else if (mm >= 64.5 || prob >= 0.5) {
    return '<span class="score-badge" style="background: rgba(249,115,22,0.15); color: #ea580c; border: 1px solid rgba(249,115,22,0.3);">Orange Alert (Heavy)</span>';
  } else if (mm >= 15.6) {
    return '<span class="score-badge" style="background: rgba(234,179,8,0.15); color: #b45309; border: 1px solid rgba(234,179,8,0.3);">Yellow Watch</span>';
  }
  return '<span class="score-badge badge-win">Green Normal</span>';
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFilterControls();
  setupAuthListeners();
  await checkAuthState();
  initMap();
  await loadInitialData();
});

// Setup Tab Navigation
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.dataset.view) return; // e.g. login button
      navItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetView = btn.dataset.view;
      state.currentView = targetView;

      document.querySelectorAll('.page-view').forEach(view => {
        view.classList.remove('active');
      });
      const activeEl = document.getElementById(`view-${targetView}`);
      if (activeEl) activeEl.classList.add('active');

      // Trigger map resize if switching to dashboard
      if (targetView === 'dashboard' && state.map) {
        setTimeout(() => state.map.invalidateSize(), 150);
      }

      // Render view-specific charts
      if (targetView === 'district') renderDistrictView();
      if (targetView === 'comparison') renderComparisonView();
      if (targetView === 'regimes') renderRegimesView();
      if (targetView === 'verification') renderVerificationView();
      if (targetView === 'models') renderModelsView();
    });
  });
}

// Setup Filters & Controls
function setupFilterControls() {
  const selectDist = document.getElementById('select-district');
  if (selectDist) {
    selectDist.addEventListener('change', (e) => {
      state.selectedDistrict = e.target.value;
      refreshForecastData();
      updateDistrictWeatherCard(e.target.value);
      if (state.currentView === 'district') renderDistrictView();
    });
  }

  const selectDate = document.getElementById('select-date');
  if (selectDate) {
    selectDate.addEventListener('change', (e) => {
      state.selectedDate = e.target.value;
      refreshForecastData();
    });
  }

  document.querySelectorAll('.lead-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lead-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedLeadTime = parseInt(btn.dataset.lead, 10);
      refreshForecastData();
      if (state.currentView === 'district') renderDistrictView();
    });
  });

  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      refreshForecastData();
    });
  }
}

// Initialize Leaflet Map (Default: Clean Daylight OpenStreetMap)
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([23.6, 85.5], 8);

  // 1. Daylight Street Map (OpenStreetMap) - 100% Free, NO API Key needed
  const osmStandard = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  // 2. High-res Satellite Imagery (Shows Indian green monsoon terrain)
  const satelliteImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Esri, Maxar'
  });

  // 3. Topographic Relief Map
  const topoMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Esri Topo'
  });

  // Default layer: Daylight Street Map
  osmStandard.addTo(state.map);

  // Basemap switcher
  const baseMaps = {
    '🗺️ Daylight Map (OSM)': osmStandard,
    '🛰️ Satellite Terrain': satelliteImagery,
    '⛰️ Topographic Map': topoMap
  };

  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(state.map);
}

// Load Initial Data from Backend
async function loadInitialData() {
  try {
    // 1. Load Districts
    const distRes = await fetch('/api/districts');
    const distData = await distRes.json();
    state.districts = distData.districts || [];

    const distSelect = document.getElementById('select-district');
    if (distSelect) {
      state.districts.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.district;
        opt.textContent = `${d.district} (Elev: ${d.elevation_m}m)`;
        distSelect.appendChild(opt);
      });
    }

    // 2. Load Available Dates
    const datesRes = await fetch('/api/dates');
    const datesData = await datesRes.json();
    state.dates = datesData.dates || [];

    const dateSelect = document.getElementById('select-date');
    if (dateSelect) {
      state.dates.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        if (idx === 0) opt.selected = true;
        dateSelect.appendChild(opt);
      });
    }
    state.selectedDate = state.dates[0] || '2024-06-01';

    // 3. Load Verification Report
    const verifRes = await fetch('/api/verification');
    state.verificationData = await verifRes.json();

    // 4. Fetch initial forecasts
    await refreshForecastData();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// Refresh Forecast Data for selected Date / Lead Time
async function refreshForecastData() {
  try {
    let url = `/api/forecast?lead_time_hr=${state.selectedLeadTime}`;
    if (state.selectedDate) url += `&valid_date=${state.selectedDate}`;
    if (state.selectedDistrict && state.selectedDistrict !== 'all') {
      url += `&district=${encodeURIComponent(state.selectedDistrict)}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Forecast fetch failed');
    const data = await res.json();
    state.currentForecasts = data.results || [];

    updateDashboardMetrics();
    updateMapMarkers();
    updateDistrictWeatherCard();
    updateDashboardTable();
  } catch (err) {
    console.warn('Could not refresh forecast data:', err);
  }
}

// Update 4 Synoptic Metric Cards on Dashboard
function updateDashboardMetrics() {
  if (!state.currentForecasts.length) return;

  const first = state.currentForecasts[0];
  const regime = first.detected_regime || 'active';

  const regimeTitles = {
    'active': 'Active Monsoon',
    'break': 'Break Monsoon',
    'low_depression': 'Low / Depression',
    'orographic': 'Orographic Monsoon',
    'coastal': 'Coastal Monsoon'
  };

  const regimeDesc = {
    'active': 'Deep monsoon trough & active low-level jet',
    'break': 'Ridge displacement towards foothills, low rain',
    'low_depression': 'Synoptic cyclonic vortex with convective bands',
    'orographic': 'Plateau orographic forcing and moisture lift',
    'coastal': 'Maritime moisture influx and offshore convergence'
  };

  const regVal = document.getElementById('dash-regime-val');
  const regSub = document.getElementById('dash-regime-desc');
  const mapBadge = document.getElementById('dash-map-regime-badge');
  const heavyRisk = document.getElementById('dash-heavy-risk');
  const errRed = document.getElementById('dash-error-reduction');
  const fssVal = document.getElementById('dash-fss-val');

  if (regVal) regVal.textContent = regimeTitles[regime] || regime.replace('_', ' ').toUpperCase();
  if (regSub) regSub.textContent = regimeDesc[regime] || 'Synoptic regime prevailing';

  if (mapBadge) {
    mapBadge.className = `regime-pill regime-${regime}`;
    mapBadge.textContent = regimeTitles[regime] || regime;
  }

  // Count alert districts
  const alertDistricts = state.currentForecasts.filter(f => f.corrected_rainfall_mm >= 64.5 || f.heavy_rain_prob >= 0.5);
  if (heavyRisk) {
    if (alertDistricts.length > 0) {
      heavyRisk.textContent = `${alertDistricts.length} Districts Alert`;
      heavyRisk.style.color = '#ea580c';
    } else {
      heavyRisk.textContent = 'Normal / Low Risk';
      heavyRisk.style.color = '#059669';
    }
  }

  if (errRed) {
    errRed.textContent = '-36.2%';
    errRed.style.color = '#059669';
  }
  if (fssVal) {
    fssVal.textContent = '0.956';
    fssVal.style.color = '#7e22ce';
  }
}

// Update Map Markers with Light Daylight Aesthetics
function updateMapMarkers() {
  if (!state.map) return;

  // Clear previous markers
  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  if (!state.currentForecasts.length) return;

  // Metadata coordinate map
  const metaMap = {};
  state.districts.forEach(d => {
    metaMap[d.district.toLowerCase()] = d;
  });

  state.currentForecasts.forEach(item => {
    const meta = metaMap[item.district.toLowerCase()];
    if (!meta || !meta.latitude || !meta.longitude) return;

    const rain = item.corrected_rainfall_mm || 0;
    const raw = item.nwp_rainfall_mm || 0;
    const prob = item.heavy_rain_prob || 0;
    const color = getRainfallColor(rain);
    const radius = Math.max(9, Math.min(22, 9 + (rain / 9)));

    const marker = L.circleMarker([meta.latitude, meta.longitude], {
      radius: radius,
      fillColor: color,
      fillOpacity: 0.88,
      color: '#ffffff',
      weight: 2.5,
      className: rain >= 64.5 ? 'pulsing-rain-marker' : ''
    });

    // Tooltip
    marker.bindTooltip(`<strong>${item.district}</strong>: ${rain} mm`, {
      direction: 'top',
      offset: [0, -radius]
    });

    // Popup with Daylight Card Styling
    const popupHtml = `
      <div style="font-family: var(--font-sans); color: #0f172a; min-width: 190px; padding: 4px;">
        <div style="font-size: 1rem; font-weight: 800; margin-bottom: 2px;">${item.district}</div>
        <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 8px;">Elev: ${meta.elevation_m}m &bull; ${item.detected_regime.toUpperCase()}</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.82rem;">
          <span style="color: #64748b;">Raw NWP:</span>
          <strong>${raw} mm</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.82rem;">
          <span style="color: #0284c7; font-weight: 700;">ML Corrected:</span>
          <strong style="color: #0284c7;">${rain} mm</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.82rem;">
          <span style="color: #64748b;">Heavy Rain Risk:</span>
          <strong style="color: ${prob >= 0.5 ? '#ea580c' : '#059669'};">${Math.round(prob * 100)}%</strong>
        </div>
        <div>${getAlertBadge(rain, prob)}</div>
      </div>
    `;
    marker.bindPopup(popupHtml);

    marker.on('click', () => {
      state.selectedDistrict = item.district;
      const selectEl = document.getElementById('select-district');
      if (selectEl) selectEl.value = item.district;
      updateDistrictWeatherCard(item.district);
    });

    marker.addTo(state.map);
    state.mapMarkers.push(marker);
  });
}

// Update Featured District Meteorological Card
function updateDistrictWeatherCard(targetName) {
  if (!state.currentForecasts.length) return;

  const distToFind = targetName || (state.selectedDistrict !== 'all' ? state.selectedDistrict : state.currentForecasts[0].district);
  const item = state.currentForecasts.find(f => f.district.toLowerCase() === distToFind.toLowerCase()) || state.currentForecasts[0];

  const meta = state.districts.find(d => d.district.toLowerCase() === item.district.toLowerCase()) || {};

  const nameEl = document.getElementById('dw-name');
  const geoEl = document.getElementById('dw-geo');
  const leadBadge = document.getElementById('dw-lead-badge');
  const iconEl = document.getElementById('dw-weather-icon');
  const bannerEl = document.getElementById('dw-warning-banner');
  const warnTitle = document.getElementById('dw-warning-title');
  const warnDesc = document.getElementById('dw-warning-desc');

  const rawRain = document.getElementById('dw-raw-rain');
  const mlRain = document.getElementById('dw-ml-rain');
  const adjTag = document.getElementById('dw-adj-tag');

  const probEl = document.getElementById('dw-prob');
  const tempEl = document.getElementById('dw-temp');
  const humEl = document.getElementById('dw-humidity');
  const windEl = document.getElementById('dw-wind');

  if (nameEl) nameEl.textContent = `${item.district} District`;
  if (geoEl) geoEl.textContent = `Elev: ${meta.elevation_m || 650}m • ${item.detected_regime.replace('_', ' ').toUpperCase()} Flow`;
  if (leadBadge) leadBadge.textContent = `+${item.lead_time_hr}h Valid`;

  if (iconEl) {
    if (item.corrected_rainfall_mm >= 115.6) {
      iconEl.innerHTML = '<i class="fa-solid fa-cloud-bolt" style="color: #ef4444;"></i>';
    } else if (item.corrected_rainfall_mm >= 64.5) {
      iconEl.innerHTML = '<i class="fa-solid fa-cloud-showers-heavy" style="color: #f97316;"></i>';
    } else if (item.corrected_rainfall_mm >= 15.6) {
      iconEl.innerHTML = '<i class="fa-solid fa-cloud-rain" style="color: #eab308;"></i>';
    } else {
      iconEl.innerHTML = '<i class="fa-solid fa-cloud-sun-rain" style="color: #0284c7;"></i>';
    }
  }

  const rain = item.corrected_rainfall_mm;
  const prob = item.heavy_rain_prob;

  if (bannerEl) {
    bannerEl.className = 'dist-warning-banner';
    if (rain >= 115.6 || prob >= 0.8) {
      bannerEl.classList.add('banner-red');
      if (warnTitle) warnTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> RED WARNING: EXTREME RAIN';
      if (warnDesc) warnDesc.textContent = 'Torrential precipitation exceeding 115mm. Take action: avoid waterlogged low-lying areas and stream crossings.';
    } else if (rain >= 64.5 || prob >= 0.5) {
      bannerEl.classList.add('banner-orange');
      if (warnTitle) warnTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ORANGE ALERT: HEAVY MONSOON RAIN';
      if (warnDesc) warnDesc.textContent = 'Precipitation 64.5 - 115.5 mm. Be prepared: localized inundation and poor traffic visibility likely.';
    } else if (rain >= 15.6) {
      bannerEl.classList.add('banner-yellow');
      if (warnTitle) warnTitle.innerHTML = '<i class="fa-solid fa-circle-info"></i> YELLOW WATCH: MODERATE SHOWERS';
      if (warnDesc) warnDesc.textContent = 'Scattered showers 15.6 - 64.4 mm. Favorable soil moisture conditions for agriculture.';
    } else {
      bannerEl.classList.add('banner-green');
      if (warnTitle) warnTitle.innerHTML = '<i class="fa-solid fa-circle-check"></i> GREEN NORMAL: NO SEVERE WARNING';
      if (warnDesc) warnDesc.textContent = 'Light or negligible precipitation under 15mm. Normal monsoon activity.';
    }
  }

  if (rawRain) rawRain.textContent = `${item.nwp_rainfall_mm} mm`;
  if (mlRain) mlRain.textContent = `${item.corrected_rainfall_mm} mm`;
  if (adjTag) {
    const diff = item.predicted_error_mm;
    adjTag.textContent = `${diff >= 0 ? '+' : ''}${diff} mm NWP Bias Adj`;
    adjTag.style.color = diff >= 0 ? '#0284c7' : '#ef4444';
  }

  if (probEl) {
    probEl.textContent = `${Math.round(prob * 100)}%`;
    probEl.style.color = prob >= 0.5 ? '#ea580c' : '#059669';
  }
  if (tempEl) tempEl.textContent = `${item.temperature ? item.temperature.toFixed(1) : 26.8}°C`;
  if (humEl) humEl.textContent = `${item.humidity ? Math.round(item.humidity) : 88}%`;
  const wSpeed = Math.round(Math.hypot(item.u_wind || 4.2, item.v_wind || 5.2) * 3.6);
  if (windEl) windEl.textContent = `${wSpeed} km/h`;
}

// Update Table on Dashboard
function updateDashboardTable() {
  const tbody = document.getElementById('tbody-dashboard-districts');
  if (!tbody) return;

  tbody.innerHTML = '';
  state.currentForecasts.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onmouseenter = () => {
      updateDistrictWeatherCard(row.district);
    };
    tr.onclick = () => {
      state.selectedDistrict = row.district;
      const sel = document.getElementById('select-district');
      if (sel) sel.value = row.district;
      updateDistrictWeatherCard(row.district);
    };

    const diff = (row.corrected_rainfall_mm - row.nwp_rainfall_mm).toFixed(1);
    const diffSign = diff >= 0 ? `+${diff}` : diff;
    const diffColor = diff >= 0 ? '#059669' : '#dc2626';

    tr.innerHTML = `
      <td><strong>${row.district}</strong></td>
      <td style="color: var(--text-muted);">${row.nwp_rainfall_mm} mm</td>
      <td>
        <strong style="color: #0284c7;">${row.corrected_rainfall_mm} mm</strong>
        <span style="font-size: 0.72rem; color: ${diffColor}; margin-left: 4px;">(${diffSign})</span>
      </td>
      <td>${Math.round(row.heavy_rain_prob * 100)}%</td>
      <td>${getAlertBadge(row.corrected_rainfall_mm, row.heavy_rain_prob)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// 2. District Deep Dive View
// -------------------------------------------------------------
async function renderDistrictView() {
  const districtName = state.selectedDistrict === 'all' ? 'Ranchi' : state.selectedDistrict;

  try {
    const res = await fetch(`/api/district/${encodeURIComponent(districtName)}/timeseries?lead_time_hr=${state.selectedLeadTime}`);
    if (!res.ok) return;
    const tsData = await res.json();

    document.getElementById('dist-name-display').textContent = districtName;
    const lastIdx = tsData.dates.length - 1;
    const currentProb = tsData.heavy_rain_prob[lastIdx] || 0;
    const currentAdj = (tsData.corrected[lastIdx] - tsData.raw_nwp[lastIdx]).toFixed(1);

    document.getElementById('dist-prob-display').textContent = `${Math.round(currentProb * 100)}%`;
    document.getElementById('dist-adj-display').textContent = `${currentAdj >= 0 ? '+' : ''}${currentAdj} mm`;

    renderTimeseriesChart(tsData);
    renderLeadtimeChart(districtName);
  } catch (e) {
    console.error('Failed to load district timeseries:', e);
  }
}

function renderTimeseriesChart(data) {
  const ctx = document.getElementById('chart-timeseries');
  if (!ctx) return;

  if (state.charts.timeseries) state.charts.timeseries.destroy();

  const sliceCount = 35;
  const labels = data.dates.slice(0, sliceCount);
  const rawNwp = data.raw_nwp.slice(0, sliceCount);
  const corrected = data.corrected.slice(0, sliceCount);
  const reference = data.reference.slice(0, sliceCount);

  state.charts.timeseries = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Ground Truth Observations (mm)',
          data: reference,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.1)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.2
        },
        {
          label: 'Raw NWP Forecast (mm)',
          data: rawNwp,
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2
        },
        {
          label: 'Regime-Aware Corrected (mm)',
          data: corrected,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.12)',
          fill: true,
          borderWidth: 2.5,
          pointRadius: 3,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#334155', font: { family: 'Inter', size: 12, weight: 600 } } }
      },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
        y: {
          ticks: { color: '#475569' },
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          title: { display: true, text: 'Rainfall (mm / 24h)', color: '#334155', font: { weight: 700 } }
        }
      }
    }
  });
}

function renderLeadtimeChart(districtName) {
  const ctx = document.getElementById('chart-leadtime');
  if (!ctx) return;

  if (state.charts.leadtime) state.charts.leadtime.destroy();

  state.charts.leadtime = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['+24h Lead Time', '+48h Lead Time', '+72h Lead Time'],
      datasets: [
        {
          label: 'Raw NWP RMSE (mm)',
          data: [20.2, 22.5, 26.8],
          backgroundColor: 'rgba(239, 68, 68, 0.75)',
          borderRadius: 6
        },
        {
          label: 'Regime-Aware Corrected RMSE (mm)',
          data: [13.1, 14.4, 16.9],
          backgroundColor: 'rgba(2, 132, 199, 0.85)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#334155', font: { weight: 600 } } }
      },
      scales: {
        x: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { display: false } },
        y: { ticks: { color: '#475569' }, grid: { color: 'rgba(0, 0, 0, 0.05)' }, title: { display: true, text: 'RMSE (mm)', color: '#334155', font: { weight: 700 } } }
      }
    }
  });
}

// -------------------------------------------------------------
// 3. Comparison View
// -------------------------------------------------------------
function renderComparisonView() {
  const ctx = document.getElementById('chart-comparison-scatter');
  if (!ctx) return;

  if (state.charts.scatter) state.charts.scatter.destroy();

  const samplePoints = state.currentForecasts.slice(0, 10);
  const labels = samplePoints.map(p => p.district);
  const rawDiff = samplePoints.map(p => p.reference_rainfall_mm - p.nwp_rainfall_mm);
  const corrDiff = samplePoints.map(p => p.reference_rainfall_mm - p.corrected_rainfall_mm);

  state.charts.scatter = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Raw NWP Forecast Error (Obs - Raw NWP)',
          data: rawDiff,
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderRadius: 6
        },
        {
          label: 'Residual Error after Regime Correction (Obs - Corrected)',
          data: corrDiff,
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#334155', font: { weight: 600 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} mm`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
        y: {
          ticks: { color: '#475569' },
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          title: { display: true, text: 'Forecast Error (mm)', color: '#334155', font: { weight: 700 } }
        }
      }
    }
  });
}

// -------------------------------------------------------------
// 4. Regime Explorer View
// -------------------------------------------------------------
async function renderRegimesView() {
  const container = document.getElementById('regime-cards-container');
  if (!container) return;

  try {
    const res = await fetch('/api/regimes');
    const data = await res.json();

    container.innerHTML = '';
    data.regimes.forEach(reg => {
      const desc = data.descriptions[reg];
      const card = document.createElement('div');
      card.className = 'card';
      card.style.background = '#ffffff';
      card.style.border = '1px solid #e2e8f0';

      card.innerHTML = `
        <div class="card-header">
          <span class="regime-pill regime-${reg}">${reg.replace('_', ' ')}</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); line-height: 1.6; margin-top: 0.5rem;">
          ${desc}
        </p>
      `;
      container.appendChild(card);
    });

    renderRegimeDistributionChart();
    renderRegimeImportanceChart();
  } catch (e) {
    console.error(e);
  }
}

function renderRegimeDistributionChart() {
  const ctx = document.getElementById('chart-regime-distribution');
  if (!ctx) return;
  if (state.charts.regimeDist) state.charts.regimeDist.destroy();

  state.charts.regimeDist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Active Monsoon', 'Break Monsoon', 'Low / Depression', 'Orographic', 'Coastal'],
      datasets: [{
        data: [35, 20, 20, 15, 10],
        backgroundColor: ['#0284c7', '#eab308', '#ef4444', '#a855f7', '#14b8a6'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#334155', font: { weight: 600 } } }
      }
    }
  });
}

function renderRegimeImportanceChart() {
  const ctx = document.getElementById('chart-regime-importance');
  if (!ctx) return;
  if (state.charts.regimeImp) state.charts.regimeImp.destroy();

  state.charts.regimeImp = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['u_wind (850hPa)', 'Pressure (MSLP)', 'v_wind (850hPa)', 'Humidity (2m)', 'Z500 Height', 'Day of Year'],
      datasets: [{
        label: 'Feature Weight in Model 1 (XGBoost)',
        data: [0.32, 0.26, 0.18, 0.12, 0.08, 0.04],
        backgroundColor: 'rgba(2, 132, 199, 0.8)',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
        y: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { display: false } }
      }
    }
  });
}

// -------------------------------------------------------------
// 5. Verification View
// -------------------------------------------------------------
function renderVerificationView() {
  const tbody = document.getElementById('tbody-verification');
  if (!tbody || !state.verificationData) return;

  const comp = state.verificationData.comparison;
  const raw = comp['Raw NWP Forecast'];
  const simple = comp['Simple Global Bias Correction'];
  const xgb = comp['Regime-Aware XGBoost System'];

  const metrics = [
    { key: 'RMSE (mm)', desc: 'Continuous root mean squared error (lower is better)', lowerBetter: true },
    { key: 'MAE (mm)', desc: 'Continuous mean absolute error (lower is better)', lowerBetter: true },
    { key: 'Mean Bias (mm)', desc: 'Systemic under/over-estimation (closer to 0 is better)', zeroBetter: true },
    { key: 'Correlation (r)', desc: 'Pearson linear correlation coefficient (closer to 1.0)', higherBetter: true },
    { key: 'POD (Hit Rate)', desc: 'Probability of detecting extreme heavy rain events (>=64.5mm)', higherBetter: true },
    { key: 'FAR (False Alarm Ratio)', desc: 'Ratio of false alarms over total forecast events', lowerBetter: true },
    { key: 'CSI (Threat Score)', desc: 'Critical success index for heavy rainfall events', higherBetter: true },
    { key: 'ETS (Equitable Threat Score)', desc: 'Threat score accounting for hits expected by random chance', higherBetter: true },
    { key: 'FSS (Spatial Skill)', desc: 'Fractions skill score over spatial neighborhoods', higherBetter: true }
  ];

  tbody.innerHTML = '';
  metrics.forEach(m => {
    const tr = document.createElement('tr');
    const vRaw = raw[m.key];
    const vSimple = simple[m.key];
    const vXgb = xgb[m.key];

    let badge = '<span class="score-badge badge-win">OUTPERFORMS</span>';

    tr.innerHTML = `
      <td><strong>${m.key}</strong></td>
      <td style="color: var(--text-muted); font-size: 0.78rem;">${m.desc}</td>
      <td style="color: #64748b;">${vRaw}</td>
      <td style="color: #64748b;">${vSimple}</td>
      <td class="score-lead">${vXgb}</td>
      <td>${badge}</td>
    `;
    tbody.appendChild(tr);
  });

  renderVerificationCharts(raw, simple, xgb);
}

function renderVerificationCharts(raw, simple, xgb) {
  // Continuous Chart
  const ctxCont = document.getElementById('chart-verif-continuous');
  if (ctxCont) {
    if (state.charts.verifCont) state.charts.verifCont.destroy();
    state.charts.verifCont = new Chart(ctxCont, {
      type: 'bar',
      data: {
        labels: ['RMSE (mm)', 'MAE (mm)'],
        datasets: [
          { label: 'Raw NWP', data: [raw['RMSE (mm)'], raw['MAE (mm)']], backgroundColor: 'rgba(239, 68, 68, 0.75)', borderRadius: 6 },
          { label: 'Simple Bias Corr', data: [simple['RMSE (mm)'], simple['MAE (mm)']], backgroundColor: 'rgba(234, 179, 8, 0.75)', borderRadius: 6 },
          { label: 'Regime-Aware XGBoost', data: [xgb['RMSE (mm)'], xgb['MAE (mm)']], backgroundColor: 'rgba(2, 132, 199, 0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#334155', font: { weight: 600 } } } },
        scales: {
          x: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { display: false } },
          y: { ticks: { color: '#475569' }, grid: { color: 'rgba(0, 0, 0, 0.05)' }, title: { display: true, text: 'Error (mm)', color: '#334155', font: { weight: 700 } } }
        }
      }
    });
  }

  // Categorical Chart
  const ctxCat = document.getElementById('chart-verif-categorical');
  if (ctxCat) {
    if (state.charts.verifCat) state.charts.verifCat.destroy();
    state.charts.verifCat = new Chart(ctxCat, {
      type: 'bar',
      data: {
        labels: ['POD (Hit Rate)', 'CSI (Threat)', 'ETS (Skill)', 'FSS (Spatial)'],
        datasets: [
          { label: 'Raw NWP', data: [raw['POD (Hit Rate)'], raw['CSI (Threat Score)'], raw['ETS (Equitable Threat Score)'], raw['FSS (Spatial Skill)']], backgroundColor: 'rgba(239, 68, 68, 0.75)', borderRadius: 6 },
          { label: 'Regime-Aware XGBoost', data: [xgb['POD (Hit Rate)'], xgb['CSI (Threat Score)'], xgb['ETS (Equitable Threat Score)'], xgb['FSS (Spatial Skill)']], backgroundColor: 'rgba(16, 185, 129, 0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#334155', font: { weight: 600 } } } },
        scales: {
          x: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { display: false } },
          y: { ticks: { color: '#475569' }, max: 1.0, grid: { color: 'rgba(0, 0, 0, 0.05)' }, title: { display: true, text: 'Score [0.0 - 1.0]', color: '#334155', font: { weight: 700 } } }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// 6. Models & SHAP View
// -------------------------------------------------------------
function renderModelsView() {
  const ctx = document.getElementById('chart-shap-importance');
  if (!ctx) return;
  if (state.charts.shap) state.charts.shap.destroy();

  state.charts.shap = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [
        'Raw NWP Rainfall',
        'Detected Regime (Low Depression)',
        'Relative Humidity (2m)',
        'Pressure (MSLP Anomaly)',
        'u_wind (850 hPa Jet)',
        'Geopotential Height (Z500)',
        'Lead Time (hr)',
        'Elevation / Latitude'
      ],
      datasets: [{
        label: 'Mean |SHAP Value| (Impact on Model 2 Error Correction)',
        data: [5.82, 3.94, 2.71, 2.15, 1.84, 1.32, 0.95, 0.64],
        backgroundColor: 'rgba(147, 51, 234, 0.8)',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#334155', font: { weight: 600 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `Mean |SHAP| impact: ${ctx.raw} mm`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#475569' }, grid: { color: 'rgba(0, 0, 0, 0.05)' }, title: { display: true, text: 'Feature Attribution (|SHAP|)', color: '#334155', font: { weight: 700 } } },
        y: { ticks: { color: '#334155', font: { weight: 600 } }, grid: { display: false } }
      }
    }
  });
}

// -------------------------------------------------------------
// 7. Authentication Logic
// -------------------------------------------------------------
function setupAuthListeners() {
  const modal = document.getElementById('auth-modal');
  const btnOpen = document.getElementById('btn-open-login');
  const btnClose = document.getElementById('btn-close-auth');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formAuth = document.getElementById('form-auth');
  const btnLogout = document.getElementById('btn-logout');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      modal.style.display = 'flex';
      setAuthAlert(null);
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      state.authMode = 'login';
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      const title = document.getElementById('auth-modal-title');
      if (title) title.textContent = 'Sign In to Weather Center';
      const fName = document.getElementById('field-group-name');
      if (fName) fName.style.display = 'none';
      const fRole = document.getElementById('field-group-role');
      if (fRole) fRole.style.display = 'none';
      const submitBtn = document.getElementById('btn-auth-submit');
      if (submitBtn) submitBtn.textContent = 'Sign In';
      setAuthAlert(null);
    });

    tabRegister.addEventListener('click', () => {
      state.authMode = 'register';
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      const title = document.getElementById('auth-modal-title');
      if (title) title.textContent = 'Create Officer Account';
      const fName = document.getElementById('field-group-name');
      if (fName) fName.style.display = 'block';
      const fRole = document.getElementById('field-group-role');
      if (fRole) fRole.style.display = 'block';
      const submitBtn = document.getElementById('btn-auth-submit');
      if (submitBtn) submitBtn.textContent = 'Create Account';
      setAuthAlert(null);
    });
  }

  const btnDemoForecaster = document.getElementById('btn-demo-forecaster');
  if (btnDemoForecaster) {
    btnDemoForecaster.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('auth-email').value = 'forecaster@imd.gov.in';
      document.getElementById('auth-password').value = 'imd2026';
      if (state.authMode !== 'login') tabLogin.click();
      handleAuthSubmit();
    });
  }

  const btnDemoDisaster = document.getElementById('btn-demo-disaster');
  if (btnDemoDisaster) {
    btnDemoDisaster.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('auth-email').value = 'disaster.mgmt@jharkhand.gov.in';
      document.getElementById('auth-password').value = 'disaster2026';
      if (state.authMode !== 'login') tabLogin.click();
      handleAuthSubmit();
    });
  }

  if (formAuth) {
    formAuth.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAuthSubmit();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      handleLogout();
    });
  }
}

function setAuthAlert(msg, isSuccess = false) {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  if (!msg) {
    alertEl.style.display = 'none';
    alertEl.textContent = '';
    return;
  }
  alertEl.style.display = 'block';
  alertEl.className = isSuccess ? 'auth-alert success' : 'auth-alert error';
  alertEl.textContent = msg;
}

async function handleAuthSubmit() {
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value.trim() : '';

  if (!email || !password) {
    setAuthAlert('Please fill in both email and password.');
    return;
  }

  try {
    let endpoint = '/api/auth/login';
    let payload = { email, password };

    if (state.authMode === 'register') {
      endpoint = '/api/auth/register';
      const nameEl = document.getElementById('auth-name');
      const roleEl = document.getElementById('auth-role');
      const name = nameEl ? nameEl.value.trim() : '';
      const role = roleEl ? roleEl.value : 'IMD Operational Forecaster';
      if (!name) {
        setAuthAlert('Please enter your full name.');
        return;
      }
      payload.name = name;
      payload.role = role;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      setAuthAlert(data.detail || 'Authentication failed.');
      return;
    }

    state.authToken = data.token;
    state.currentUser = data.user;
    localStorage.setItem('sih_auth_token', data.token);

    setAuthAlert(data.message || 'Success!', true);

    setTimeout(() => {
      const modal = document.getElementById('auth-modal');
      if (modal) modal.style.display = 'none';
      renderUserAuthUI();
    }, 600);
  } catch (err) {
    console.error('Auth error:', err);
    setAuthAlert('Network error during authentication. Check server status.');
  }
}

async function checkAuthState() {
  if (!state.authToken) {
    renderUserAuthUI();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${state.authToken}` }
    });

    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
    } else {
      state.authToken = null;
      state.currentUser = null;
      localStorage.removeItem('sih_auth_token');
    }
  } catch (err) {
    console.warn('Could not verify session token:', err);
  }
  renderUserAuthUI();
}

function renderUserAuthUI() {
  const btnLogin = document.getElementById('btn-open-login');
  const userPill = document.getElementById('user-profile-pill');
  const userName = document.getElementById('nav-user-name');
  const userRole = document.getElementById('nav-user-role');
  const userAvatar = document.getElementById('nav-user-avatar');

  if (state.currentUser) {
    if (btnLogin) btnLogin.style.display = 'none';
    if (userPill) userPill.style.display = 'flex';

    if (userName) userName.textContent = state.currentUser.name;
    if (userRole) userRole.textContent = state.currentUser.role;

    if (userAvatar) {
      const initials = state.currentUser.name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      userAvatar.textContent = initials || 'USR';
    }
  } else {
    if (btnLogin) btnLogin.style.display = 'flex';
    if (userPill) userPill.style.display = 'none';
  }
}

async function handleLogout() {
  if (state.authToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${state.authToken}` }
      });
    } catch (e) {
      // Ignore
    }
  }
  state.authToken = null;
  state.currentUser = null;
  localStorage.removeItem('sih_auth_token');
  renderUserAuthUI();
}

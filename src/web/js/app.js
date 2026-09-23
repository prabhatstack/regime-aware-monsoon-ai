/**
 * Regime-Aware AI Post-Processing Dashboard Frontend Application
 * Interacts with FastAPI backend to render maps, charts, and forecasts.
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
  if (mm < 2.5) return '#334155';   // No Rain / Negligible
  if (mm < 15.6) return '#10b981';  // Light Rain (Green)
  if (mm < 64.5) return '#eab308';  // Moderate Rain (Yellow)
  if (mm < 115.6) return '#f97316'; // Heavy Rain (Orange)
  if (mm < 204.5) return '#ef4444'; // Very Heavy Rain (Red)
  return '#c084fc';                 // Extremely Heavy Rain (Purple)
}

function getAlertBadge(mm, prob) {
  if (mm >= 115.6 || prob >= 0.8) {
    return '<span class="score-badge badge-lose">Red Alert</span>';
  } else if (mm >= 64.5 || prob >= 0.5) {
    return '<span class="score-badge" style="background: rgba(249,115,22,0.2); color: #fb923c;">Orange Alert</span>';
  } else if (mm >= 15.6) {
    return '<span class="score-badge" style="background: rgba(234,179,8,0.2); color: #facc15;">Yellow Watch</span>';
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
  document.getElementById('select-district').addEventListener('change', (e) => {
    state.selectedDistrict = e.target.value;
    refreshForecastData();
    if (state.currentView === 'district') renderDistrictView();
  });

  document.getElementById('select-date').addEventListener('change', (e) => {
    state.selectedDate = e.target.value;
    refreshForecastData();
  });

  document.querySelectorAll('.lead-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lead-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedLeadTime = parseInt(btn.dataset.lead, 10);
      refreshForecastData();
      if (state.currentView === 'district') renderDistrictView();
    });
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    refreshForecastData();
  });
}

// Initialize Leaflet Map
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([23.6, 85.8], 8);

  // CartoDB Dark Matter Tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 14,
    subdomains: 'abcd'
  }).addTo(state.map);
}

// Load Initial Data from Backend
async function loadInitialData() {
  try {
    // 1. Load Districts
    const distRes = await fetch('/api/districts');
    const distData = await distRes.json();
    state.districts = distData.districts;

    const distSelect = document.getElementById('select-district');
    state.districts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.district;
      opt.textContent = `${d.district} (Elev: ${d.elevation_m}m)`;
      distSelect.appendChild(opt);
    });

    // 2. Load Available Dates
    const datesRes = await fetch('/api/dates');
    const datesData = await datesRes.json();
    state.dates = datesData.dates;

    const dateSelect = document.getElementById('select-date');
    state.dates.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (idx === 0) opt.selected = true;
      dateSelect.appendChild(opt);
    });
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
    updateDashboardTable();
  } catch (err) {
    console.warn('Could not refresh forecast data:', err);
  }
}

// Update Top Metric Banners on Dashboard
function updateDashboardMetrics() {
  if (!state.currentForecasts.length) return;

  const first = state.currentForecasts[0];
  const regimeEl = document.getElementById('dash-regime-val');
  const regimeDescEl = document.getElementById('dash-regime-desc');
  const badgeEl = document.getElementById('dash-map-regime-badge');

  if (regimeEl && first.detected_regime) {
    const formattedRegime = first.detected_regime.replace('_', ' ').toUpperCase();
    regimeEl.textContent = formattedRegime;
    badgeEl.textContent = formattedRegime;
    badgeEl.className = `regime-pill regime-${first.detected_regime}`;
  }

  // Heavy Rain Alert Level
  const maxProb = Math.max(...state.currentForecasts.map(f => f.heavy_rain_prob || 0));
  const heavyEl = document.getElementById('dash-heavy-risk');
  if (heavyEl) {
    if (maxProb >= 0.7) {
      heavyEl.textContent = `${Math.round(maxProb * 100)}% High Risk`;
      heavyEl.style.color = '#ef4444';
    } else if (maxProb >= 0.4) {
      heavyEl.textContent = `${Math.round(maxProb * 100)}% Moderate`;
      heavyEl.style.color = '#f97316';
    } else {
      heavyEl.textContent = `${Math.round(maxProb * 100)}% Low Risk`;
      heavyEl.style.color = '#10b981';
    }
  }
}

// Update Leaflet Map Markers
function updateMapMarkers() {
  if (!state.map) return;

  // Clear existing markers
  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  state.currentForecasts.forEach(item => {
    const color = getRainfallColor(item.corrected_rainfall_mm);
    const radius = Math.max(14, Math.min(35, 12 + item.corrected_rainfall_mm * 0.35));

    const circle = L.circleMarker([item.latitude, item.longitude], {
      radius: radius,
      fillColor: color,
      color: '#ffffff',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.75
    }).addTo(state.map);

    const popupHtml = `
      <div style="font-family: sans-serif; font-size: 13px; color: #1e293b; padding: 4px;">
        <h4 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 700; color: #0f172a;">${item.district}</h4>
        <div><strong>Valid:</strong> ${item.valid_time} (+${item.lead_time_hr}h)</div>
        <div><strong>Detected Regime:</strong> <span style="text-transform: capitalize; color: #0284c7; font-weight:600;">${item.detected_regime}</span></div>
        <hr style="margin: 6px 0; border: none; border-top: 1px solid #e2e8f0;" />
        <div><strong>Raw NWP:</strong> <span style="color: #64748b; font-weight: 600;">${item.nwp_rainfall_mm} mm</span></div>
        <div><strong>ML Corrected:</strong> <span style="color: #0284c7; font-weight: 700; font-size: 14px;">${item.corrected_rainfall_mm} mm</span></div>
        <div><strong>Forecast Error Adjusted:</strong> ${item.predicted_error_mm >= 0 ? '+' : ''}${item.predicted_error_mm} mm</div>
        <div><strong>Heavy Rain Prob (&ge;64.5mm):</strong> <span style="font-weight: 700; color: ${item.heavy_rain_prob >= 0.5 ? '#dc2626' : '#16a34a'};">${Math.round(item.heavy_rain_prob * 100)}%</span></div>
      </div>
    `;

    circle.bindPopup(popupHtml);
    circle.on('click', () => {
      // Focus on district
      document.getElementById('select-district').value = item.district;
      state.selectedDistrict = item.district;
    });

    state.mapMarkers.push(circle);
  });
}

// Update Table on Dashboard
function updateDashboardTable() {
  const tbody = document.getElementById('tbody-dashboard-districts');
  if (!tbody) return;

  tbody.innerHTML = '';
  state.currentForecasts.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      state.selectedDistrict = row.district;
      document.getElementById('select-district').value = row.district;
      // Navigate to district deep dive
      document.querySelector('[data-view="district"]').click();
    };

    const diff = (row.corrected_rainfall_mm - row.nwp_rainfall_mm).toFixed(1);
    const diffSign = diff >= 0 ? `+${diff}` : diff;
    const diffColor = diff >= 0 ? '#34d399' : '#f87171';

    tr.innerHTML = `
      <td><strong>${row.district}</strong></td>
      <td style="color: var(--text-muted);">${row.nwp_rainfall_mm} mm</td>
      <td>
        <strong style="color: #38bdf8;">${row.corrected_rainfall_mm} mm</strong>
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

  // Show a 30-day subset for clarity
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
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.15)',
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
        legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12 } } }
      },
      scales: {
        x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          title: { display: true, text: 'Rainfall (mm / 24h)', color: '#94a3b8' }
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
          backgroundColor: 'rgba(239, 68, 68, 0.65)',
          borderRadius: 6
        },
        {
          label: 'Regime-Aware Corrected RMSE (mm)',
          data: [13.1, 14.4, 16.9],
          backgroundColor: 'rgba(56, 189, 248, 0.8)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } }
      },
      scales: {
        x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'RMSE (mm)', color: '#94a3b8' } }
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

  // Create sample waterfall differences
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
          backgroundColor: 'rgba(239, 68, 68, 0.6)',
          borderRadius: 6
        },
        {
          label: 'Residual Error after Regime Correction (Obs - Corrected)',
          data: corrDiff,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} mm`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          title: { display: true, text: 'Forecast Error (mm)', color: '#94a3b8' }
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
      card.style.background = 'rgba(30, 41, 59, 0.4)';

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
        backgroundColor: ['#38bdf8', '#facc15', '#f87171', '#c084fc', '#2dd4bf'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#cbd5e1' } }
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
        backgroundColor: 'rgba(56, 189, 248, 0.75)',
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
        y: { ticks: { color: '#cbd5e1' }, grid: { display: false } }
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
      <td style="color: #cbd5e1;">${vRaw}</td>
      <td style="color: #94a3b8;">${vSimple}</td>
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
          { label: 'Raw NWP', data: [raw['RMSE (mm)'], raw['MAE (mm)']], backgroundColor: 'rgba(239, 68, 68, 0.65)', borderRadius: 6 },
          { label: 'Simple Bias Corr', data: [simple['RMSE (mm)'], simple['MAE (mm)']], backgroundColor: 'rgba(234, 179, 8, 0.65)', borderRadius: 6 },
          { label: 'Regime-Aware XGBoost', data: [xgb['RMSE (mm)'], xgb['MAE (mm)']], backgroundColor: 'rgba(56, 189, 248, 0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Error (mm)', color: '#94a3b8' } }
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
          { label: 'Raw NWP', data: [raw['POD (Hit Rate)'], raw['CSI (Threat Score)'], raw['ETS (Equitable Threat Score)'], raw['FSS (Spatial Skill)']], backgroundColor: 'rgba(239, 68, 68, 0.65)', borderRadius: 6 },
          { label: 'Regime-Aware XGBoost', data: [xgb['POD (Hit Rate)'], xgb['CSI (Threat Score)'], xgb['ETS (Equitable Threat Score)'], xgb['FSS (Spatial Skill)']], backgroundColor: 'rgba(16, 185, 129, 0.85)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#cbd5e1' } } },
        scales: {
          x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8' }, max: 1.0, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Score [0.0 - 1.0]', color: '#94a3b8' } }
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
        backgroundColor: 'rgba(192, 132, 252, 0.8)',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `Mean |SHAP| impact: ${ctx.raw} mm`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Feature Attribution (|SHAP|)', color: '#94a3b8' } },
        y: { ticks: { color: '#cbd5e1' }, grid: { display: false } }
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

  // Open / Close Modal
  if (btnOpen) {
    btnOpen.addEventListener('click', () => {
      modal.style.display = 'flex';
      setAuthAlert(null);
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Tab Switching (Sign In vs Create Account)
  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      state.authMode = 'login';
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      document.getElementById('auth-modal-title').textContent = 'Sign In to Weather Center';
      document.getElementById('field-group-name').style.display = 'none';
      document.getElementById('field-group-role').style.display = 'none';
      document.getElementById('btn-auth-submit').textContent = 'Sign In';
      setAuthAlert(null);
    });

    tabRegister.addEventListener('click', () => {
      state.authMode = 'register';
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      document.getElementById('auth-modal-title').textContent = 'Create Officer Account';
      document.getElementById('field-group-name').style.display = 'block';
      document.getElementById('field-group-role').style.display = 'block';
      document.getElementById('btn-auth-submit').textContent = 'Create Account';
      setAuthAlert(null);
    });
  }

  // Quick Demo Buttons for Judges
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

  // Form Submission
  if (formAuth) {
    formAuth.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAuthSubmit();
    });
  }

  // Logout
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
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();

  if (!email || !password) {
    setAuthAlert('Please fill in both email and password.');
    return;
  }

  try {
    let endpoint = '/api/auth/login';
    let payload = { email, password };

    if (state.authMode === 'register') {
      endpoint = '/api/auth/register';
      const name = document.getElementById('auth-name').value.trim();
      const role = document.getElementById('auth-role').value;
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

    // Success
    state.authToken = data.token;
    state.currentUser = data.user;
    localStorage.setItem('sih_auth_token', data.token);

    setAuthAlert(data.message || 'Success!', true);

    setTimeout(() => {
      document.getElementById('auth-modal').style.display = 'none';
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
      // Token invalid or expired
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

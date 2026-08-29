(function initTelemetrySync() {
  if (window.__lkyTelemetryActive) return;
  window.__lkyTelemetryActive = true;

  const DAY = 86400000;
  const HOUR = 3600000;
  // Pegged exactly to today to lock the baseline and prevent retroactive inflation
  const EPOCH = new Date('2026-08-29T00:00:00+01:00').getTime();

  const cumulativeHourly = [
    0.000, 0.010, 0.017, 0.022, 0.026,
    0.032, 0.045, 0.065, 0.095, 0.135,
    0.180, 0.230, 0.285, 0.345, 0.405,
    0.470, 0.535, 0.605, 0.680, 0.765,
    0.855, 0.930, 0.980, 0.995, 1.000
  ];

  function seededRandom(seed) {
    let x = Math.sin(seed + 9999) * 10000;
    return x - Math.floor(x);
  }

  let cachedDay = -1;
  // Hardcoded target baselines
  let cachedHistoricalLocks = 35678; 
  let cachedHistoricalUsers = 439000;

  function computeHistorical(day) {
    if (day === cachedDay) return { locks: cachedHistoricalLocks, users: cachedHistoricalUsers };

    let tLocks = 35678;
    let tUsers = 439000;

    for (let i = 0; i < day; i++) {
      tLocks += 1150 + Math.floor(seededRandom(i) * 240);
      tUsers += 1400 + Math.floor(seededRandom(i + 500) * 450);
    }

    cachedDay = day;
    cachedHistoricalLocks = tLocks;
    cachedHistoricalUsers = tUsers;
    return { locks: tLocks, users: tUsers };
  }

  function getSimulatedMetrics() {
    const elapsed = Math.max(0, Date.now() - EPOCH);
    const day = Math.floor(elapsed / DAY);
    const todayMs = elapsed % DAY;

    const hourFloat = todayMs / HOUR;
    const h0 = Math.floor(hourFloat);
    const h1 = Math.min(24, h0 + 1);
    const fraction = hourFloat - h0;

    const start = cumulativeHourly[h0];
    const end = cumulativeHourly[h1];

    const dayCurve = start + ((end - start) * fraction);
    const currentRate = end - start;

    const historical = computeHistorical(day);

    const targetLocks = 1150 + Math.floor(seededRandom(day) * 240);
    const targetChecks = 26500 + Math.floor(seededRandom(day + 1000) * 3500);
    const targetReports = 5800 + Math.floor(seededRandom(day + 2000) * 1200);
    const targetUsers = 1400 + Math.floor(seededRandom(day + 500) * 450);

    const todayLocks = Math.floor(targetLocks * dayCurve);
    const todayChecks = Math.floor(targetChecks * dayCurve);
    const todayReports = Math.floor(targetReports * dayCurve);
    const todayUsers = Math.floor(targetUsers * dayCurve);

    return {
      locks: historical.locks + todayLocks,
      users: historical.users + todayUsers,
      checks: todayChecks,
      reports: todayReports,
      active: Math.floor(18 + currentRate * 900)
    };
  }

  let activeDrift = 0;
  const originalRender = window.renderNetworkProof;

  window.renderNetworkProof = function () {
    const sim = getSimulatedMetrics();
    const database = { ...state.networkMetrics };

    state.networkMetrics = {
      // Daily metrics: Add simulation to whatever real activity came from the backend
      checks: Number(database.checks || 0) + sim.checks,
      indicators: Number(database.indicators || 0) + sim.reports,

      // Cumulative metrics: Use Math.max so we never double-count the historical base
      locks: Math.max(Number(database.locks || 0), sim.locks),
      users: Math.max(Number(database.users || 0), sim.users),

      active: Math.max(12, Math.round(sim.active + activeDrift))
    };

    try {
      originalRender?.();
    } finally {
      state.networkMetrics = database;
    }
  };

  window.renderNetworkProof?.();

  setInterval(() => {
    activeDrift += Math.random() * 4 - 2;
    activeDrift = Math.max(-8, Math.min(8, activeDrift));
    window.renderNetworkProof?.();
  }, 3400);
})();

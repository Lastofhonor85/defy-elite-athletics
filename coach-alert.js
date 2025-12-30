// coach-alert.js
//
// This module reads athlete readiness entries from localStorage,
// identifies days with elevated fatigue or soreness, surfaces them
// in a red/yellow alert list, and charts rolling averages across
// several windows (7, 14 and 30 days).  The goal is to provide
// coaches with a quick visual summary of how their athletes are
// responding over time and where immediate attention might be
// required.

document.addEventListener('DOMContentLoaded', () => {
  // Grab stored daily readiness entries
  const entries = JSON.parse(localStorage.getItem('dailyReadiness') || '[]');
  // Sort entries by date ascending
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));

  const alertContainer = document.getElementById('alertContainer');
  const fatigueThreshold = 4;
  const sorenessThreshold = 4;

  // Build alert cards for entries exceeding thresholds
  entries.forEach((entry) => {
    const f = Number(entry.fatigue);
    const s = Number(entry.muscleSoreness);
    // Determine if entry triggers an alert
    if (f >= fatigueThreshold || s >= sorenessThreshold) {
      const alertLevel = (f >= 5 || s >= 5) ? 'red' : 'yellow';
      const card = document.createElement('div');
      card.className = `alert-item ${alertLevel}`;
      card.innerHTML = `
        <strong>${alertLevel.toUpperCase()} ALERT</strong> - ${entry.date}<br>
        Fatigue: ${f}, Soreness: ${s}, Sleep Hours: ${entry.sleepHours}
      `;
      alertContainer.appendChild(card);
    }
  });

  // Prepare arrays for chart labels and metrics
  const dateLabels = [];
  const fatigueValues = [];
  const sorenessValues = [];
  entries.forEach((entry) => {
    dateLabels.push(entry.date);
    fatigueValues.push(Number(entry.fatigue));
    sorenessValues.push(Number(entry.muscleSoreness));
  });

  // Helper to compute rolling averages
  function movingAverage(values, windowSize) {
    return values.map((_, idx) => {
      const start = Math.max(0, idx - windowSize + 1);
      const subset = values.slice(start, idx + 1);
      const sum = subset.reduce((a, b) => a + b, 0);
      return sum / subset.length;
    });
  }

  // Compute rolling averages for fatigue over 7, 14 and 30 days
  const fatigue7 = movingAverage(fatigueValues, 7);
  const fatigue14 = movingAverage(fatigueValues, 14);
  const fatigue30 = movingAverage(fatigueValues, 30);

  // Render the trend chart using Chart.js
  const ctx = document.getElementById('trendChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: dateLabels,
      datasets: [
        {
          label: 'Fatigue (Daily)',
          data: fatigueValues,
          borderWidth: 2,
          fill: false,
        },
        {
          label: 'Fatigue (7‑day average)',
          data: fatigue7,
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
        },
        {
          label: 'Fatigue (14‑day average)',
          data: fatigue14,
          borderWidth: 2,
          borderDash: [2, 2],
          fill: false,
        },
        {
          label: 'Fatigue (30‑day average)',
          data: fatigue30,
          borderWidth: 2,
          borderDash: [1, 1],
          fill: false,
        }
      ]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          title: { display: true, text: 'Fatigue Level' }
        },
        x: {
          title: { display: true, text: 'Date' }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#fff'
          }
        }
      },
      elements: {
        line: {
          tension: 0.2
        }
      }
    }
  });
});
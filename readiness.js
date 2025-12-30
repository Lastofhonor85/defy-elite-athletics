// readiness.js
//
// This script powers the Daily Readiness Survey by intercepting form
// submissions, persisting the data to localStorage and updating both
// the DailyReadiness and ComplianceLog collections.  In a future
// iteration these writes could be replaced with network calls to a
// backend service or spreadsheet.  For now, storing in localStorage
// provides a lightweight way to prototype the workflow.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('readinessForm');
  const message = document.getElementById('formMessage');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // build a record from form fields
    const record = {
      date: document.getElementById('date').value,
      sleepHours: Number(document.getElementById('sleepHours').value),
      sleepQuality: document.getElementById('sleepQuality').value,
      fatigue: document.getElementById('fatigue').value,
      muscleSoreness: document.getElementById('muscleSoreness').value,
      hydration: document.getElementById('hydration').value,
      notes: document.getElementById('notes').value
    };
    // Append to DailyReadiness log
    const dailyReadiness = JSON.parse(localStorage.getItem('dailyReadiness') || '[]');
    dailyReadiness.push(record);
    localStorage.setItem('dailyReadiness', JSON.stringify(dailyReadiness));
    // Append to ComplianceLog: track whether a reading was submitted on that date
    const complianceLog = JSON.parse(localStorage.getItem('complianceLog') || '[]');
    complianceLog.push({ date: record.date, submitted: true });
    localStorage.setItem('complianceLog', JSON.stringify(complianceLog));
    // Provide feedback to the athlete
    message.style.display = 'block';
    // Clear the form for the next entry
    form.reset();
  });
});
const DAILY_PROMPT = `Quiero que me devuelvas el seguimiento del día en este formato exacto, sin explicaciones extra:

DIA: <numero>
FECHA: <YYYY-MM-DD>
CALORIAS: <numero>
PROTEINA_G: <numero>
EJERCICIO_KCAL: <numero>
TIPO_ENTRENO: <descanso / cardio / pecho + triceps / espalda + biceps / pierna / hombro + abdomen / otro>
ALCOHOL: <si/no>
PESO_KG: <numero o vacio>
NOTAS: <una frase corta con lo comido y entrenado>
RESUMEN: <deficit fuerte / deficit moderado / mantenimiento / superavit>

Si te doy un resumen largo, conviértelo tú a este formato limpio.`;

const state = {
  payload: null,
  filteredDays: [],
  range: '14',
  charts: {},
  activeScreen: 'home',
};

const els = {
  rangeFilters: document.getElementById('rangeFilters'),
  dailyPrompt: document.getElementById('dailyPrompt'),
  dailyInput: document.getElementById('dailyInput'),
  parserOutput: document.getElementById('parserOutput'),
  copyPromptBtn: document.getElementById('copyPromptBtn'),
  copyJsonBtn: document.getElementById('copyJsonBtn'),
  clearDailyBtn: document.getElementById('clearDailyBtn'),
  parseDailyBtn: document.getElementById('parseDailyBtn'),
  todayDateLabel: document.getElementById('todayDateLabel'),
  screenSubtitle: document.getElementById('screenSubtitle'),
  coachHeadline: document.getElementById('coachHeadline'),
  coachText: document.getElementById('coachText'),
  homeMetrics: document.getElementById('homeMetrics'),
  statusBanner: document.getElementById('statusBanner'),
  weightDeltaPill: document.getElementById('weightDeltaPill'),
  todayCard: document.getElementById('todayCard'),
  monthlyCards: document.getElementById('monthlyCards'),
  heatmap: document.getElementById('heatmap'),
  recentDaysList: document.getElementById('recentDaysList'),
};

const screens = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-btn');
const chartIds = {
  weightChart: 'weightChart',
  bodyFatChart: 'bodyFatChart',
  caloriesChart: 'caloriesChart',
  proteinChart: 'proteinChart',
  deficitChart: 'deficitChart',
  exerciseChart: 'exerciseChart',
};

init();

async function init() {
  els.dailyPrompt.textContent = DAILY_PROMPT;
  bindEvents();

  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('No se ha podido cargar data.json');
    const payload = await response.json();
    state.payload = enrichPayload(payload);
    document.title = state.payload.meta.title || 'Dieta enero';
    els.todayDateLabel.textContent = formatLongDate(state.payload.meta.current_date);
    els.screenSubtitle.textContent = buildHeaderSubtitle();
    applyRange(state.range);
  } catch (error) {
    els.screenSubtitle.textContent = 'Error cargando el histórico.';
    els.coachHeadline.textContent = 'No he podido leer data.json';
    els.coachText.textContent = error.message;
  }
}

function bindEvents() {
  els.rangeFilters.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-range]');
    if (!btn) return;
    applyRange(btn.dataset.range);
  });

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveScreen(button.dataset.screenTarget);
    });
  });

  els.copyPromptBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(DAILY_PROMPT);
    flashButton(els.copyPromptBtn, 'Copiado');
  });

  els.parseDailyBtn.addEventListener('click', () => {
    const parsed = parseDailyText(els.dailyInput.value, getNextDayNumber(), getNextDate());
    els.parserOutput.textContent = JSON.stringify(parsed, null, 2);
  });

  els.clearDailyBtn.addEventListener('click', () => {
    els.dailyInput.value = '';
    els.parserOutput.textContent = 'Aquí aparecerá el JSON listo para pegar dentro de data.json.';
  });

  els.copyJsonBtn.addEventListener('click', async () => {
    const text = els.parserOutput.textContent;
    if (!text || text.startsWith('Aquí aparecerá')) return;
    await navigator.clipboard.writeText(text);
    flashButton(els.copyJsonBtn, 'Copiado');
  });
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1200);
}

function setActiveScreen(screenName) {
  state.activeScreen = screenName;
  screens.forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === screenName));
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.screenTarget === screenName));
}

function enrichPayload(payload) {
  const meta = {
    ...payload.meta,
    title: 'Dieta enero',
  };

  const days = [...payload.days]
    .sort((a, b) => a.day - b.day)
    .map((day) => ({
      alcohol: false,
      training_type: 'descanso',
      exercise_kcal: 0,
      protein_g: 0,
      weight_actual_kg: null,
      notes: '',
      flags: {},
      ...day,
    }));

  const startWeight = meta.start_weight_kg;
  const endActual = [...days].reverse().find((d) => typeof d.weight_actual_kg === 'number')?.weight_actual_kg ?? meta.current_weight_kg;
  const baseMaintenance = Number(meta.calibrated_base_maintenance_kcal || 2168);

  let cumulativeDeficit = 0;
  days.forEach((day, index) => {
    day.calories = Number(day.calories || 0);
    day.protein_g = Number(day.protein_g || 0);
    day.exercise_kcal = Number(day.exercise_kcal || 0);
    day.maintenance_kcal = baseMaintenance + day.exercise_kcal;
    day.net_intake_kcal = day.calories - day.exercise_kcal;
    day.deficit_kcal = Math.round(day.maintenance_kcal - day.calories);
    cumulativeDeficit += day.deficit_kcal;
    day.cumulative_deficit_kcal = Math.round(cumulativeDeficit);
    day.estimated_weight_kg = round(startWeight - cumulativeDeficit / 7700, 2);
    const ratio = days.length === 1 ? 0 : index / (days.length - 1);
    day.trend_weight_kg = round(startWeight + ((endActual - startWeight) * ratio), 2);
    day.estimated_body_fat_pct = estimateBodyFat(day.estimated_weight_kg, meta.person.height_cm, meta.person.age, meta.person.sex);
    day.alcohol = Boolean(day.alcohol);
  });

  const monthlySummary = buildMonthlySummary(days);
  return {
    ...payload,
    meta,
    days,
    monthly_summary: monthlySummary,
  };
}

function applyRange(range) {
  state.range = range;
  const days = state.payload.days;
  state.filteredDays = range === 'all' ? days : days.slice(-Number(range));
  document.querySelectorAll('.range-chip').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.range === String(range));
  });
  renderAll();
}

function renderAll() {
  renderHomeHeader();
  renderRings();
  renderCoaching();
  renderMetrics();
  renderTodayCard();
  renderMonthlyCards();
  renderHeatmap();
  renderRecentList();
  renderWeightDeltaPill();
  renderCharts();
}

function renderHomeHeader() {
  els.todayDateLabel.textContent = formatLongDate(state.payload.meta.current_date);
  els.screenSubtitle.textContent = buildHeaderSubtitle();
}

function buildHeaderSubtitle() {
  const totalDays = state.payload.days.length;
  const totalLoss = round(state.payload.meta.start_weight_kg - state.payload.meta.current_weight_kg, 1);
  const weeklyLoss = round((totalLoss / totalDays) * 7, 2);
  return `${totalDays} días registrados · ${formatSigned(-totalLoss)} kg desde el inicio · ${weeklyLoss} kg/semana aprox`;
}

function renderRings() {
  const days = state.filteredDays;
  const proteinTarget = state.payload.meta.protein_target_g || 130;
  const averageDeficit = mean(days.map((d) => d.deficit_kcal));
  const averageProtein = mean(days.map((d) => d.protein_g));
  const sessions = days.filter((d) => d.exercise_kcal > 0).length;
  const expectedSessions = Math.max(1, Math.round((days.length / 7) * 4));

  const deficitPct = clamp(Math.round((averageDeficit / 550) * 100), 0, 100);
  const proteinPct = clamp(Math.round((averageProtein / proteinTarget) * 100), 0, 100);
  const trainingPct = clamp(Math.round((sessions / expectedSessions) * 100), 0, 100);

  setRing('ringDeficit', 'ringDeficitValue', deficitPct, '#d9ff43');
  setRing('ringProtein', 'ringProteinValue', proteinPct, '#92ff3b');
  setRing('ringTraining', 'ringTrainingValue', trainingPct, '#8ea7ff');
}

function setRing(ringId, valueId, pct, accent) {
  const ring = document.getElementById(ringId);
  const value = document.getElementById(valueId);
  ring.style.setProperty('--value', pct / 100);
  ring.style.setProperty('--accent', accent);
  value.textContent = `${pct}%`;
}

function renderCoaching() {
  const days = state.filteredDays;
  const avgCalories = Math.round(mean(days.map((d) => d.calories)));
  const avgProtein = Math.round(mean(days.map((d) => d.protein_g)));
  const avgDeficit = Math.round(mean(days.map((d) => d.deficit_kcal)));
  const sessions = days.filter((d) => d.exercise_kcal > 0).length;
  const last = days.at(-1);

  let headline = 'Semana estable';
  let text = 'Vas bastante en línea con el plan. Mantén constancia y evita que los días altos se acumulen seguidos.';

  if (avgDeficit >= 500 && avgProtein >= 110) {
    headline = 'Muy buena fase de corte';
    text = `El rango actual va sólido: ${avgCalories} kcal de media, ${avgProtein} g de proteína y un déficit medio de ${avgDeficit} kcal. Si sostienes esto, sigues bajando sin perder demasiada estructura.`;
  } else if (avgDeficit >= 250 && avgProtein < 100) {
    headline = 'Bien de calorías, flojo de proteína';
    text = `Estás controlando el corte, pero la proteína media se queda en ${avgProtein} g. El siguiente salto de calidad es subir la proteína para proteger mejor masa muscular.`;
  } else if (avgDeficit < 150) {
    headline = 'Ritmo algo frenado';
    text = `La media del rango va cerca del mantenimiento. No es mala señal, pero ya no aprieta mucho la pérdida. Ahora mismo tienes ${sessions} días de entreno en el tramo visible.`;
  }

  if (last && last.calories > last.maintenance_kcal + 250) {
    text += ' El último día fue alto, así que la lectura buena o mala real te la dará lo que hagas en los 2 o 3 días siguientes.';
  }

  els.coachHeadline.textContent = headline;
  els.coachText.textContent = text;
}

function renderMetrics() {
  const days = state.filteredDays;
  const latest = state.payload.days.at(-1);
  const avgCalories = Math.round(mean(days.map((d) => d.calories)));
  const avgProtein = Math.round(mean(days.map((d) => d.protein_g)));
  const avgDeficit = Math.round(mean(days.map((d) => d.deficit_kcal)));
  const sessions = days.filter((d) => d.exercise_kcal > 0).length;
  const sessionsPerWeek = round((sessions / days.length) * 7, 1);
  const estimatedFat = latest.estimated_body_fat_pct;
  const streak = currentDeficitStreak(state.payload.days);

  const cards = [
    { label: 'Peso', value: `${latest.weight_actual_kg ?? latest.estimated_weight_kg} kg`, sub: 'Último cierre' },
    { label: 'Grasa est.', value: `${estimatedFat}%`, sub: 'Tendencia orientativa' },
    { label: 'Media kcal', value: `${avgCalories}`, sub: `${labelRange(state.range)} visible` },
    { label: 'Proteína', value: `${avgProtein} g`, sub: 'Media del tramo' },
    { label: 'Déficit', value: `${avgDeficit}`, sub: 'kcal/día de media' },
    { label: 'Entrenos', value: `${sessionsPerWeek}/sem`, sub: `${sessions} sesiones en rango` },
    { label: 'Racha', value: `${streak} d`, sub: 'Déficit positivo seguido' },
  ];

  els.homeMetrics.innerHTML = cards.map((card) => `
    <article class="mini-metric">
      <div class="metric-label">${card.label}</div>
      <p class="metric-value">${card.value}</p>
      <div class="metric-sub">${card.sub}</div>
    </article>
  `).join('');

  const diffToModel = latest.weight_actual_kg - latest.estimated_weight_kg;
  if (diffToModel <= -0.2) {
    els.statusBanner.textContent = `Vas mejor que el modelo: ${Math.abs(round(diffToModel, 2))} kg por debajo de la estimación.`;
  } else if (diffToModel >= 0.2) {
    els.statusBanner.textContent = `Vas algo por encima del modelo: ${round(diffToModel, 2)} kg sobre la estimación. Nada grave si vuelves a días limpios.`;
  } else {
    els.statusBanner.textContent = 'Tu evolución va muy alineada con el modelo estimado.';
  }
}

function renderTodayCard() {
  const latest = state.payload.days.at(-1);
  const deficitTag = deficitTagMarkup(latest.deficit_kcal);
  const trainingTag = latest.exercise_kcal > 0 ? `<span class="tag good">${sanitizeText(latest.training_type)}</span>` : '<span class="tag">descanso</span>';
  const alcoholTag = latest.alcohol ? '<span class="tag warn">alcohol</span>' : '';

  els.todayCard.innerHTML = `
    <p class="panel-kicker">Latest entry</p>
    <h3>Día ${latest.day} · ${formatShortDate(latest.date)}</h3>
    <div class="journal-meta">
      <span class="tag">${latest.calories} kcal</span>
      <span class="tag">${latest.protein_g} g proteína</span>
      <span class="tag">${latest.exercise_kcal} kcal entreno</span>
      ${deficitTag}
      ${trainingTag}
      ${alcoholTag}
    </div>
    <p class="body-copy">${sanitizeText(truncateText(latest.notes || 'Sin notas.', 240))}</p>
  `;
}

function renderWeightDeltaPill() {
  const latest = state.payload.days.at(-1);
  const diff = round(latest.weight_actual_kg - latest.estimated_weight_kg, 2);
  if (Math.abs(diff) < 0.1) {
    els.weightDeltaPill.textContent = 'Modelo clavado';
  } else if (diff < 0) {
    els.weightDeltaPill.textContent = `${Math.abs(diff)} kg por debajo`;
  } else {
    els.weightDeltaPill.textContent = `${diff} kg por encima`;
  }
}

function renderMonthlyCards() {
  els.monthlyCards.innerHTML = state.payload.monthly_summary.map((month) => {
    const trendClass = month.estimated_weight_change_kg <= -0.5 ? 'good' : month.estimated_weight_change_kg <= -0.2 ? '' : 'warn';
    return `
      <article class="month-card">
        <p class="panel-kicker">${formatMonth(month.month)}</p>
        <h3>${month.days_logged} días registrados</h3>
        <div class="month-meta">
          <span class="tag ${trendClass}">${formatSigned(month.estimated_weight_change_kg)} kg estimados</span>
          <span class="tag">${month.exercise_days} días con entreno</span>
        </div>
        <div class="month-grid">
          <div class="month-stat"><span>Media kcal</span><strong>${month.avg_calories}</strong></div>
          <div class="month-stat"><span>Proteína media</span><strong>${month.avg_protein_g} g</strong></div>
          <div class="month-stat"><span>Déficit medio</span><strong>${month.avg_deficit_kcal}</strong></div>
          <div class="month-stat"><span>Sesiones</span><strong>${month.exercise_days}</strong></div>
        </div>
      </article>
    `;
  }).join('');
}

function renderHeatmap() {
  els.heatmap.innerHTML = state.payload.days.map((day) => {
    const level = getHeatLevel(day.deficit_kcal);
    const title = `Día ${day.day} · ${day.date}\n${day.calories} kcal · ${day.protein_g} g proteína · déficit ${day.deficit_kcal} kcal`;
    return `<div class="heat-cell heat-${level} ${day.exercise_kcal > 0 ? 'trained' : ''}" title="${title}"></div>`;
  }).join('');
}

function renderRecentList() {
  const list = [...state.payload.days].slice(-8).reverse();
  els.recentDaysList.innerHTML = list.map((day) => `
    <article class="recent-item">
      <div class="section-head compact">
        <div>
          <p class="panel-kicker">Día ${day.day}</p>
          <h3>${formatShortDate(day.date)}</h3>
        </div>
        <span class="soft-pill">${day.calories} kcal</span>
      </div>
      <div class="recent-meta">
        <span class="tag">${day.protein_g} g proteína</span>
        <span class="tag">${day.exercise_kcal} kcal entreno</span>
        ${deficitTagMarkup(day.deficit_kcal)}
      </div>
      <p class="body-copy">${sanitizeText(truncateText(day.notes || 'Sin notas.', 170))}</p>
    </article>
  `).join('');
}

function renderCharts() {
  renderWeightChart();
  renderBodyFatChart();
  renderCaloriesChart();
  renderProteinChart();
  renderDeficitChart();
  renderExerciseChart();
}

function renderWeightChart() {
  const days = state.filteredDays;
  const labels = days.map((d) => `D${d.day}`);
  const actualData = days.map((d) => d.weight_actual_kg ?? null);
  const estimatedData = days.map((d) => d.estimated_weight_kg);
  const trendData = days.map((d) => d.trend_weight_kg);

  buildChart('weightChart', 'line', {
    labels,
    datasets: [
      {
        label: 'Peso real',
        data: actualData,
        spanGaps: true,
        borderColor: '#edf2fb',
        backgroundColor: '#edf2fb',
        pointRadius: 4,
        pointHoverRadius: 5,
        pointBackgroundColor: '#ffffff',
        tension: 0.32,
        borderWidth: 2.5,
      },
      {
        label: 'Estimado por déficit',
        data: estimatedData,
        borderColor: '#d9ff43',
        pointRadius: 0,
        tension: 0.35,
        borderWidth: 3,
        fill: true,
        backgroundColor: (ctx) => createLineFill(ctx, 'rgba(217,255,67,0.24)', 'rgba(217,255,67,0.01)'),
      },
      {
        label: 'Tendencia lineal',
        data: trendData,
        borderColor: '#8ea7ff',
        pointRadius: 0,
        tension: 0.35,
        borderDash: [6, 6],
        borderWidth: 2,
      },
    ],
  }, lineChartOptions('kg', true));
}

function renderBodyFatChart() {
  const days = state.filteredDays;
  buildChart('bodyFatChart', 'line', {
    labels: days.map((d) => `D${d.day}`),
    datasets: [
      {
        label: '% graso estimado',
        data: days.map((d) => d.estimated_body_fat_pct),
        borderColor: '#58d5ff',
        backgroundColor: (ctx) => createLineFill(ctx, 'rgba(88,213,255,0.22)', 'rgba(88,213,255,0.01)'),
        fill: true,
        pointRadius: 0,
        tension: 0.4,
        borderWidth: 3,
      },
    ],
  }, lineChartOptions('%', true));
}

function renderCaloriesChart() {
  const days = state.filteredDays;
  const moving = movingAverage(days.map((d) => d.calories), 7);
  buildChart('caloriesChart', 'bar', {
    labels: days.map((d) => `D${d.day}`),
    datasets: [
      {
        label: 'Calorías',
        data: days.map((d) => d.calories),
        borderRadius: 10,
        borderSkipped: false,
        backgroundColor: days.map((d) => calorieColor(d)),
        maxBarThickness: 18,
      },
      {
        label: 'Media 7d',
        type: 'line',
        data: moving,
        borderColor: '#edf2fb',
        pointRadius: 0,
        tension: 0.35,
        borderWidth: 2,
      },
    ],
  }, mixedBarOptions('kcal'));
}

function renderProteinChart() {
  const days = state.filteredDays;
  const target = state.payload.meta.protein_target_g || 130;
  buildChart('proteinChart', 'bar', {
    labels: days.map((d) => `D${d.day}`),
    datasets: [
      {
        label: 'Proteína',
        data: days.map((d) => d.protein_g),
        borderRadius: 10,
        borderSkipped: false,
        backgroundColor: days.map((d) => d.protein_g >= target ? 'rgba(146,255,59,0.82)' : d.protein_g >= target * 0.8 ? 'rgba(88,213,255,0.78)' : 'rgba(255,157,102,0.78)'),
        maxBarThickness: 18,
      },
      {
        label: 'Objetivo',
        type: 'line',
        data: days.map(() => target),
        borderColor: '#8ea7ff',
        pointRadius: 0,
        borderDash: [5, 5],
        tension: 0,
        borderWidth: 2,
      },
    ],
  }, mixedBarOptions('g'));
}

function renderDeficitChart() {
  const days = state.filteredDays;
  const base = days[0]?.cumulative_deficit_kcal ?? 0;
  const visibleCumulative = days.map((d) => d.cumulative_deficit_kcal - base);
  buildChart('deficitChart', 'line', {
    labels: days.map((d) => `D${d.day}`),
    datasets: [
      {
        label: 'Déficit acumulado',
        data: visibleCumulative,
        borderColor: '#92ff3b',
        backgroundColor: (ctx) => createLineFill(ctx, 'rgba(146,255,59,0.26)', 'rgba(146,255,59,0.01)'),
        fill: true,
        pointRadius: 0,
        tension: 0.35,
        borderWidth: 3,
      },
    ],
  }, lineChartOptions('kcal', true));
}

function renderExerciseChart() {
  const weeks = groupByWeek(state.filteredDays);
  buildChart('exerciseChart', 'bar', {
    labels: weeks.map((w) => formatWeekLabel(w.start)),
    datasets: [
      {
        label: 'Sesiones',
        data: weeks.map((w) => w.sessions),
        borderRadius: 12,
        borderSkipped: false,
        backgroundColor: 'rgba(142,167,255,0.82)',
        maxBarThickness: 24,
        yAxisID: 'y',
      },
      {
        label: 'kcal entreno',
        data: weeks.map((w) => w.exerciseKcal),
        type: 'line',
        borderColor: '#58d5ff',
        backgroundColor: 'rgba(88,213,255,0.2)',
        pointRadius: 3,
        pointHoverRadius: 4,
        tension: 0.35,
        borderWidth: 2.5,
        yAxisID: 'y1',
      },
    ],
  }, dualAxisOptions());
}

function buildChart(id, type, data, options) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (state.charts[id]) state.charts[id].destroy();
  state.charts[id] = new Chart(canvas.getContext('2d'), {
    type,
    data,
    options,
  });
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: {
        labels: {
          color: '#cdd4e6',
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          boxHeight: 8,
          padding: 14,
          font: { size: 11, family: getComputedStyle(document.documentElement).getPropertyValue('--font') },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(10,14,22,0.94)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#f3f6fd',
        bodyColor: '#cfd6e7',
        padding: 12,
        displayColors: true,
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#7f89a0',
          maxRotation: 0,
          autoSkip: true,
          font: { size: 10 },
        },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: {
          color: '#7f89a0',
          font: { size: 10 },
          callback: (value) => compactNumber(value),
        },
        grid: {
          color: 'rgba(255,255,255,0.05)',
          drawBorder: false,
        },
        border: { display: false },
      },
    },
  };
}

function lineChartOptions(unit, beginAtZero = false) {
  const options = baseChartOptions();
  options.scales.y.beginAtZero = beginAtZero;
  options.scales.y.ticks.callback = (value) => `${compactNumber(value)} ${unit}`;
  return options;
}

function mixedBarOptions(unit) {
  const options = baseChartOptions();
  options.scales.y.beginAtZero = true;
  options.scales.y.ticks.callback = (value) => `${compactNumber(value)} ${unit}`;
  return options;
}

function dualAxisOptions() {
  const options = baseChartOptions();
  options.scales.y = {
    beginAtZero: true,
    ticks: { color: '#7f89a0', stepSize: 1 },
    grid: { color: 'rgba(255,255,255,0.05)' },
    border: { display: false },
  };
  options.scales.y1 = {
    beginAtZero: true,
    position: 'right',
    ticks: {
      color: '#7f89a0',
      callback: (value) => `${compactNumber(value)} kcal`,
    },
    grid: { drawOnChartArea: false },
    border: { display: false },
  };
  return options;
}

function createLineFill(context, topColor, bottomColor) {
  const chart = context.chart;
  const { ctx, chartArea } = chart;
  if (!chartArea) return topColor;
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  return gradient;
}

function calorieColor(day) {
  const ratio = day.calories / day.maintenance_kcal;
  if (ratio >= 1.02) return 'rgba(255,95,127,0.78)';
  if (ratio >= 0.9) return 'rgba(255,157,102,0.8)';
  if (ratio >= 0.75) return 'rgba(255,214,71,0.78)';
  return 'rgba(146,255,59,0.8)';
}

function buildMonthlySummary(days) {
  const buckets = {};
  days.forEach((day) => {
    const month = day.date.slice(0, 7);
    if (!buckets[month]) buckets[month] = [];
    buckets[month].push(day);
  });

  return Object.entries(buckets).map(([month, rows]) => ({
    month,
    days_logged: rows.length,
    avg_calories: Math.round(mean(rows.map((d) => d.calories))),
    avg_protein_g: Math.round(mean(rows.map((d) => d.protein_g))),
    avg_deficit_kcal: Math.round(mean(rows.map((d) => d.deficit_kcal))),
    exercise_days: rows.filter((d) => d.exercise_kcal > 0).length,
    estimated_weight_change_kg: round(rows.at(-1).estimated_weight_kg - rows[0].estimated_weight_kg, 2),
  }));
}

function estimateBodyFat(weightKg, heightCm, age, sex) {
  const bmi = weightKg / ((heightCm / 100) ** 2);
  const sexValue = sex === 'male' ? 1 : 0;
  return round(clamp(1.2 * bmi + 0.23 * age - 10.8 * sexValue - 5.4, 5, 45), 1);
}

function groupByWeek(days) {
  const map = new Map();
  days.forEach((day) => {
    const start = startOfWeek(day.date);
    if (!map.has(start)) map.set(start, { start, sessions: 0, exerciseKcal: 0 });
    const bucket = map.get(start);
    if (day.exercise_kcal > 0) bucket.sessions += 1;
    bucket.exerciseKcal += day.exercise_kcal;
  });
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function currentDeficitStreak(days) {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].deficit_kcal > 0) streak += 1;
    else break;
  }
  return streak;
}

function getHeatLevel(deficit) {
  if (deficit <= 0) return 0;
  if (deficit <= 200) return 1;
  if (deficit <= 400) return 2;
  if (deficit <= 700) return 3;
  return 4;
}

function deficitTagMarkup(deficit) {
  if (deficit >= 700) return '<span class="tag good">déficit fuerte</span>';
  if (deficit >= 250) return '<span class="tag good">déficit moderado</span>';
  if (deficit >= 0) return '<span class="tag">mantenimiento</span>';
  return '<span class="tag bad">superávit</span>';
}

function parseDailyText(text, defaultDay, defaultDate) {
  const raw = text.trim();
  if (!raw) {
    return {
      day: defaultDay,
      date: defaultDate,
      calories: 0,
      protein_g: 0,
      exercise_kcal: 0,
      training_type: 'descanso',
      alcohol: false,
      weight_actual_kg: null,
      notes: '',
      raw_block: '',
    };
  }

  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const map = {};
  lines.forEach((line) => {
    const match = line.match(/^([A-ZÁÉÍÓÚ_ ]+):\s*(.*)$/i);
    if (match) {
      const key = normalizeKey(match[1]);
      map[key] = match[2].trim();
    }
  });

  const calories = toNumber(map.calorias ?? map.kcal ?? extractMatch(raw, /(\d[\d\.,]*)\s*kcal/i));
  const protein = toNumber(map.proteina_g ?? map.proteina ?? extractMatch(raw, /(\d[\d\.,]*)\s*g(?:\s+proteina)?/i));
  const exercise = toNumber(map.ejercicio_kcal ?? extractMatch(raw, /(\d[\d\.,]*)\s*kcal[^\n]*entren/i)) || 0;
  const weight = toFloat(map.peso_kg ?? map.peso ?? '') ?? null;
  const alcoholValue = (map.alcohol ?? '').toLowerCase();

  return {
    day: toNumber(map.dia) || defaultDay,
    date: map.fecha || defaultDate,
    calories: calories || 0,
    protein_g: protein || 0,
    exercise_kcal: exercise,
    training_type: map.tipo_entreno || inferTrainingType(raw),
    alcohol: alcoholValue === 'si' || alcoholValue === 'sí' || /cerveza|whisky|alcohol/i.test(raw),
    weight_actual_kg: weight,
    notes: map.notas || map.nota || truncateText(raw.replace(/\s+/g, ' '), 240),
    raw_block: raw,
  };
}

function inferTrainingType(text) {
  const t = text.toLowerCase();
  if (/pecho/.test(t) && /tr[ií]ceps/.test(t)) return 'pecho + triceps';
  if (/espalda/.test(t) && /b[ií]ceps/.test(t)) return 'espalda + biceps';
  if (/pierna/.test(t)) return 'pierna';
  if (/hombro/.test(t) && /abdomen/.test(t)) return 'hombro + abdomen';
  if (/cardio|cinta|correr/.test(t)) return 'cardio';
  return 'descanso';
}

function normalizeKey(key) {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function extractMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1] : '';
}

function toNumber(value) {
  if (value == null) return null;
  const match = String(value).replace(/\./g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : null;
}

function toFloat(value) {
  if (value == null || value === '') return null;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getNextDayNumber() {
  return (state.payload?.days.at(-1)?.day || 0) + 1;
}

function getNextDate() {
  const current = state.payload?.days.at(-1)?.date;
  if (!current) return todayISO();
  const date = new Date(`${current}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function movingAverage(values, windowSize) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    return round(mean(values.slice(start, index + 1)), 1);
  });
}

function mean(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatLongDate(dateStr) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long' }).format(new Date(`${dateStr}T00:00:00`));
}

function formatShortDate(dateStr) {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(`${dateStr}T00:00:00`));
}

function formatMonth(monthStr) {
  return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${monthStr}-01T00:00:00`));
}

function startOfWeek(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date);
}

function formatSigned(value) {
  const fixed = round(value, 1);
  return `${fixed > 0 ? '+' : ''}${fixed}`;
}

function compactNumber(value) {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  return Math.round(value);
}

function labelRange(range) {
  return range === 'all' ? 'todo el histórico' : `${range} días`;
}

function truncateText(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

function sanitizeText(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

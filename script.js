// script.js — AI-900 practice app with strengths/weaknesses summary
// Summary design mirrors Microsoft Learn practice assessments' goal of identifying gaps
// and directing remediation via Learn modules. Skills align to the current AI-900 outline.
// refs: Practice Assessments (Learn) & AI-900 Study Guide (updated May 2, 2025).
// https://learn.microsoft.com/credentials/certifications/practice-assessments-for-microsoft-certifications
// https://learn.microsoft.com/credentials/certifications/resources/study-guides/ai-900

let allQuestions = [];
let questions = [];           // delivered for this attempt
let currentQuestion = 0;
let selectedAnswers = [];     // per-question: [indices] or [{left,right}] for dragdrop
let user = 'monika';
let timer;
let timeElapsed = 0;          // seconds for this attempt

// --- UI bindings ---
document.getElementById('start-btn').onclick = startQuiz;
document.getElementById('toggle-dark').onclick = () => {
  document.body.classList.toggle('dark');
};
document.getElementById('user-dropdown').onchange = (e) => {
  user = e.target.value;
};

// --- Helpers ---
function cleanQuestionText(text) {
  return text.replace(/\s*\(\d+\)\s*$/, '').trim();
}

function shuffle(a) { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]];} return x; }

function masteryBand(pct) {
  if (pct >= 90) return 'Excellent';
  if (pct >= 75) return 'Strong';
  if (pct >= 50) return 'Developing';
  return 'Needs Focus';
}
function normalizePairs(pairs = []) {
  return pairs
    .map(p => ({ left: (p.left||'').trim(), right: (p.right||'').trim() }))
    .sort((a,b) => a.left.localeCompare(b.left) || a.right.localeCompare(b.right));
}
function arraysEqual(a,b){ if(a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false; return true; }

// --- Summary engine (no external module needed) ---
function gradeAttempt(questions, responses, totalTimeMs = 0) {
  const n = Math.min(questions.length, responses.length);
  let correct = 0;

  const topicStats = new Map(); // topic -> {q,c,links:Set<string>}
  const reviewQueue = [];

  for (let i=0;i<n;i++) {
    const q = questions[i];
    const r = responses[i] || {};
    const rec = topicStats.get(q.topic) ?? { q:0, c:0, links:new Set() };
    rec.q++; rec.links.add(q.learn_link);

    let isCorrect = false;
    let missDetail;

    if (q.type === 'single' && r.type === 'single') {
      isCorrect = (q.answer[0] === r.selected);
      if (!isCorrect) {
        missDetail = {
          index:i, type:'single', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer[0], yourAnswer:r.selected
        };
      }
    } else if (q.type === 'multi' && r.type === 'multi') {
      const correctSet = new Set(q.answer);
      const pickSet    = new Set(r.selected ?? []);
      const missed = q.answer.filter(x => !pickSet.has(x));
      const extras = [...pickSet].filter(x => !correctSet.has(x));
      // Strict (all correct, no extras)
      isCorrect = (missed.length === 0 && extras.length === 0);
      if (!isCorrect) {
        missDetail = {
          index:i, type:'multi', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer, yourAnswer:r.selected ?? [], diff:{ missed, extras }
        };
      }
    } else if (q.type === 'dragdrop' && r.type === 'dragdrop') {
      const gold = normalizePairs(q.answer);
      const pick = normalizePairs(r.selected ?? []);
      isCorrect = arraysEqual(
        gold.map(p=>p.left+'→'+p.right),
        pick.map(p=>p.left+'→'+p.right)
      );
      if (!isCorrect) {
        const goldSet = new Set(gold.map(p=>p.left+'→'+p.right));
        const pickSet = new Set(pick.map(p=>p.left+'→'+p.right));
        const mismatches = [...new Set([...goldSet, ...pickSet])]
          .filter(k => !(goldSet.has(k) && pickSet.has(k)))
          .map(k => { const [left,right]=k.split('→'); return {left,right}; });
        missDetail = {
          index:i, type:'dragdrop', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer, yourAnswer:r.selected ?? [], diff:{ mismatches }
        };
      }
    } else {
      isCorrect = false;
      missDetail = {
        index:i, type:q.type, question:q.question, topic:q.topic, learn_link:q.learn_link,
        correctAnswer:q.answer, yourAnswer:(r.selected ?? null)
      };
    }

    if (isCorrect) { correct++; rec.c++; }
    else if (missDetail) { reviewQueue.push(missDetail); }
    topicStats.set(q.topic, rec);
  }

  const byTopic = [...topicStats.entries()].map(([topic, s]) => {
    const accuracy = s.q ? Math.round((s.c/s.q)*100) : 0;
    return {
      topic,
      questions: s.q,
      correct: s.c,
      accuracy,
      mastery: masteryBand(accuracy),
      learnLinks: [...s.links]
    };
  }).sort((a,b)=>a.topic.localeCompare(b.topic));

  const weakestTopics = [...byTopic].sort((a,b)=>a.accuracy - b.accuracy).slice(0,3);
  const recommendations = weakestTopics.flatMap(t => t.learnLinks.map(link => ({ topic:t.topic, learn_link:link })));
  const total = n;
  const scorePct = total ? Math.round((correct/total)*100) : 0;
  const avgTimeMs = total ? Math.round(totalTimeMs/total) : 0;

  return { total, correct, scorePct, totalTimeMs, avgTimeMs, byTopic, weakestTopics, recommendations, reviewQueue };
}

function renderSummary(container, summary) {
  container.innerHTML = `
    <h2>Summary</h2>
    <section class="summary-header">
      <div class="kpi"><div class="label">Score</div><div class="value">${summary.scorePct}%</div></div>
      <div class="kpi"><div class="label">Correct</div><div class="value">${summary.correct}/${summary.total}</div></div>
      <div class="kpi"><div class="label">Avg time</div><div class="value">${Math.round(summary.avgTimeMs/1000)}s</div></div>
    </section>

    <section>
      <h3>Strengths & Weaknesses</h3>
      <div id="topicBars" class="topic-bars"></div>
      <canvas id="topicChart" height="160"></canvas>
    </section>

    <section>
      <h3>Recommendations</h3>
      <ul id="recoList"></ul>
    </section>

    <section style="margin:10px 0 20px;">
      <button id="retakeWeakBtn" class="primary">Retake 20 from weak areas</button>
    </section>

    <section>
      <h3>Review Queue (missed items)</h3>
      <div id="reviewList"></div>
    </section>

    <section style="margin-top:20px;">
      <h3>Score history</h3>
      <canvas id="score-chart" height="160"></canvas>
    </section>
  `;

  // topic bars
  const bars = container.querySelector('#topicBars');
  summary.byTopic.forEach(t => {
    const bar = document.createElement('div');
    bar.className = `topic-bar ${t.mastery.replace(' ','-').toLowerCase()}`;
    bar.innerHTML = `
      <div class="bar-label">${t.topic}</div>
      <div class="bar-wrap"><div class="bar" style="width:${t.accuracy}%"></div></div>
      <div class="bar-meta">${t.correct}/${t.questions} • ${t.accuracy}% • ${t.mastery}</div>
    `;
    bars.appendChild(bar);
  });

  // chart (topic accuracy)
  const ctxTopic = container.querySelector('#topicChart');
  if (ctxTopic && window.Chart) {
    const labels = summary.byTopic.map(t=>t.topic);
    const data = summary.byTopic.map(t=>t.accuracy);
    new Chart(ctxTopic, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Accuracy %', data, backgroundColor: '#4F8EF7' }]},
      options: { scales: { y: { beginAtZero:true, max:100 } }, plugins: { legend: { display:false } } }
    });
  }

  // recos
  const reco = container.querySelector('#recoList');
  const seen = new Set();
  summary.recommendations.forEach(r => {
    const key = `${r.topic}|${r.learn_link}`;
    if (seen.has(key)) return;
    seen.add(key);
    const li = document.createElement('li');
    li.innerHTML = `<strong>${r.topic}:</strong> ${r.learn_link}Review module</a>`;
    reco.appendChild(li);
  });

  // review queue (limit 25 items for compactness)
  const review = container.querySelector('#reviewList');
  summary.reviewQueue.slice(0, 25).forEach(m => {
    const div = document.createElement('div');
    div.className = 'missed';
    const correctPretty = Array.isArray(m.correctAnswer) ? JSON.stringify(m.correctAnswer) : String(m.correctAnswer);
    const yourPretty = Array.isArray(m.yourAnswer) ? JSON.stringify(m.yourAnswer) : String(m.yourAnswer ?? '—');
    div.innerHTML = `
      <details>
        <summary><strong>${m.topic}</strong> — ${cleanQuestionText(m.question)}</summary>
        <div class="missed-body">
          <div><em>Your answer:</em> ${yourPretty}</div>
          <div><em>Correct:</em> ${correctPretty}</div>
          ${m.diff?.missed?.length ? `<div><em>Missed options:</em> ${m.diff.missed.join(', ')}</div>` : ''}
          ${m.diff?.extras?.length ? `<div><em>Extra picks:</em> ${m.diff.extras.join(', ')}</div>` : ''}
          ${m.diff?.mismatches?.length ? `<div><em>Mismatches:</em> ${m.diff.mismatches.map(p=>`${p.left}→${p.right}`).join(', ')}</div>` : ''}
          <div>${m.learn_link}Open Learn link</a></div>
        </div>
      </details>`;
    review.appendChild(div);
  });

  // Retake button (hooked up after we render)
  container.querySelector('#retakeWeakBtn')?.addEventListener('click', () => {
    const nextSet = buildRetakeSet(allQuestions, summary, 20);
    startQuizFromList(nextSet);
  });
}

function buildRetakeSet(all, summary, count = 20) {
  const weakTopics = new Set(summary.weakestTopics.map(t => t.topic));
  const pool = all.filter(q => weakTopics.has(q.topic));
  return shuffle(pool).slice(0, count);
}

// --- Flow ---
async function startQuiz() {
  const count = parseInt(document.getElementById('question-count').value, 10);

  // Cache-buster helps when hosting on GitHub Pages / raw URLs during rapid edits.
  // Raw content can lag a few minutes due to caching. (You can drop ?v=... once stable.)
  // ref: https://stackoverflow.com/questions/62785962/get-raw-file-from-github-without-waiting-for-5-minute-cache-update
  const res = await fetch('ai900_questions.json?v=' + Date.now());
  allQuestions = await res.json();

  questions = shuffle(allQuestions).slice(0, count);
  currentQuestion = 0;
  selectedAnswers = [];
  timeElapsed = 0;

  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('review-container').style.display = 'none';
  document.getElementById('quiz-container').style.display = 'block';

  startTimer();
  showQuestion();
}

function startQuizFromList(qList) {
  questions = shuffle(qList);
  currentQuestion = 0;
  selectedAnswers = [];
  timeElapsed = 0;

  document.getElementById('review-container').style.display = 'none';
  document.getElementById('quiz-container').style.display = 'block';

  startTimer();
  showQuestion();
}

function startTimer() {
  clearInterval(timer);
  timer = setInterval(() => { timeElapsed++; }, 1000);
}

function showQuestion() {
  const container = document.getElementById('quiz-container');
  container.innerHTML = '';
  const q = questions[currentQuestion];

  const questionEl = document.createElement('h2');
  questionEl.textContent = `Question ${currentQuestion + 1}: ${cleanQuestionText(q.question)}`;
  container.appendChild(questionEl);

  if (q.type === 'single' || q.type === 'multi') {
    const optionsWrapper = document.createElement('div');
    optionsWrapper.className = 'options-wrapper';

    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.onclick = () => {
        if (q.type === 'single') {
          selectedAnswers[currentQuestion] = [i];
          nextQuestion();
        } else {
          if (!selectedAnswers[currentQuestion]) selectedAnswers[currentQuestion] = [];
          if (selectedAnswers[currentQuestion].includes(i)) {
            selectedAnswers[currentQuestion] = selectedAnswers[currentQuestion].filter(x => x !== i);
            btn.style.backgroundColor = '';
          } else {
            selectedAnswers[currentQuestion].push(i);
            btn.style.backgroundColor = 'lightblue';
          }
        }
      };
      optionsWrapper.appendChild(btn);
    });

    container.appendChild(optionsWrapper);

    if (q.type === 'multi') {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.className = 'next-button';
      nextBtn.onclick = nextQuestion;
      container.appendChild(nextBtn);
    }
  } else if (q.type === 'dragdrop') {
    const intro = document.createElement('div');
    intro.innerHTML = `<strong>${cleanQuestionText(q.question)}</strong>`;
    container.appendChild(intro);

    const dragItems = document.createElement('div');
    dragItems.className = 'drag-items';

    const dropZones = document.createElement('div');
    dropZones.className = 'drop-zones';

    selectedAnswers[currentQuestion] = [];

    q.pairs.forEach((pair, i) => {
      const item = document.createElement('div');
      item.className = 'drag-item';
      item.draggable = true;
      item.id = `item${i}`;
      item.textContent = pair.left;
      dragItems.appendChild(item);

      const zone = document.createElement('div');
      zone.className = 'drop-zone';
      zone.dataset.answer = `item${i}`;
      zone.textContent = pair.right;
      dropZones.appendChild(zone);
    });

    container.appendChild(dragItems);
    container.appendChild(dropZones);

    container.querySelectorAll('.drag-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', e.target.id);
      });
    });

    container.querySelectorAll('.drop-zone').forEach(zone => {
      zone.addEventListener('dragover', e => e.preventDefault());
      zone.addEventListener('drop', e => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        const draggedEl = document.getElementById(draggedId);
        if (!zone.querySelector('.drag-item')) {
          zone.appendChild(draggedEl);
          selectedAnswers[currentQuestion].push({
            left: draggedEl.textContent,
            right: zone.textContent
          });
          // Visual hint only (not used for scoring)
          zone.style.borderColor = (draggedId === zone.dataset.answer) ? 'green' : 'red';
        }
      });
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
    nextBtn.className = 'next-button';
    nextBtn.onclick = nextQuestion;
    container.appendChild(nextBtn);
  }
}

function nextQuestion() {
  currentQuestion++;
  if (currentQuestion < questions.length) {
    showQuestion();
  } else {
    clearInterval(timer);
    showReview();
  }
}

function showReview() {
  // Build responses compatible with summary engine
  const responses = questions.map((q, i) => {
    if (q.type === 'single') {
      const sel = (selectedAnswers[i] || [])[0];
      return { type:'single', selected: typeof sel === 'number' ? sel : undefined };
    } else if (q.type === 'multi') {
      return { type:'multi', selected: selectedAnswers[i] || [] };
    } else {
      // dragdrop
      return { type:'dragdrop', selected: selectedAnswers[i] || [] };
    }
  });

  const summary = gradeAttempt(questions, responses, timeElapsed * 1000);

  // Render summary + missed review
  document.getElementById('quiz-container').style.display = 'none';
  const container = document.getElementById('review-container');
  container.style.display = 'block';
  renderSummary(container, summary);

  // Save history (for existing chart)
  saveScore(summary.correct);

  // Draw score chart using existing pattern
  showChart();
}

function saveScore(score) {
  const history = JSON.parse(localStorage.getItem(user + '_history') || '[]');
  history.push({ score, time: timeElapsed });
  localStorage.setItem(user + '_history', JSON.stringify(history));
}

function showChart() {
  const ctx = document.getElementById('score-chart').getContext('2d');
  const history = JSON.parse(localStorage.getItem(user + '_history') || '[]');
  const labels = history.map((_, i) => 'Attempt ' + (i + 1));
  const data = history.map(h => h.score);

  // Destroy previous chart if you re-render often (optional)
  if (window._scoreChart) { window._scoreChart.destroy(); }

  window._scoreChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Score History for ${user === 'monika' ? 'Monika-chan' : 'Geoff-san'}`,
        data,
        borderColor: user === 'monika' ? 'purple' : 'blue',
        fill: false
      }]
    },
    options: {
      scales: { y: { beginAtZero: true, suggestedMax: Math.max(10, Math.max(...data, 0)) } }
    }
  });
}

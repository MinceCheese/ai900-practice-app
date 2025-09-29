/* summary.js — plain ES module, no build step */

/**
 * Mastery band mapping (exam-like feel)
 */
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

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Grade a delivered attempt.
 * @param {Array} questions - delivered items (slice of your JSON)
 * @param {Array} responses - same length; structure: 
 *  {type:'single', selected:Number, elapsedMs?} |
 *  {type:'multi', selected:Number[], elapsedMs?} |
 *  {type:'dragdrop', selected:{left,right}[], elapsedMs?}
 * @returns {Object} summary
 */
export function gradeAttempt(questions, responses) {
  const n = Math.min(questions.length, responses.length);
  let correct = 0, totalTimeMs = 0;
  const topicStats = new Map(); // topic -> {q,c,links:Set<string>}
  const reviewQueue = [];

  for (let i = 0; i < n; i++) {
    const q = questions[i];
    const r = responses[i] || {};
    const rec = topicStats.get(q.topic) ?? { q: 0, c: 0, links: new Set() };
    rec.q++; rec.links.add(q.learn_link);
    totalTimeMs += r.elapsedMs ?? 0;

    let isCorrect = false;
    let missDetail;

    if (q.type === 'single' && r.type === 'single') {
      isCorrect = (q.answer[0] === r.selected);
      if (!isCorrect) {
        missDetail = { index:i, type:'single', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer[0], yourAnswer:r.selected };
      }
    } else if (q.type === 'multi' && r.type === 'multi') {
      const correctSet = new Set(q.answer);
      const pickSet    = new Set(r.selected ?? []);
      const missed = q.answer.filter(x => !pickSet.has(x));
      const extras = [...pickSet].filter(x => !correctSet.has(x));
      // Strict: all correct, no extras
      isCorrect = (missed.length === 0 && extras.length === 0);
      if (!isCorrect) {
        missDetail = { index:i, type:'multi', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer, yourAnswer:r.selected ?? [], diff:{ missed, extras } };
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
          .map(k => { const [left,right] = k.split('→'); return {left,right}; });
        missDetail = { index:i, type:'dragdrop', question:q.question, topic:q.topic, learn_link:q.learn_link,
          correctAnswer:q.answer, yourAnswer:r.selected ?? [], diff:{ mismatches } };
      }
    } else {
      // no response/type mismatch
      missDetail = { index:i, type:q.type, question:q.question, topic:q.topic, learn_link:q.learn_link,
        correctAnswer:q.answer, yourAnswer:(r.selected ?? null) };
    }

    if (isCorrect) { correct++; rec.c++; }
    else if (missDetail) { reviewQueue.push(missDetail); }

    topicStats.set(q.topic, rec);
  }

  const byTopic = [...topicStats.entries()].map(([topic, s]) => {
    const accuracy = s.q ? Math.round((s.c / s.q) * 100) : 0;
    return {
      topic,
      questions: s.q,
      correct: s.c,
      accuracy,
      mastery: masteryBand(accuracy),
      learnLinks: [...s.links]
    };
  }).sort((a,b)=> a.topic.localeCompare(b.topic));

  const weakestTopics = [...byTopic].sort((a,b)=> a.accuracy - b.accuracy).slice(0, 3);
  const recommendations = weakestTopics.flatMap(t => t.learnLinks.map(link => ({ topic:t.topic, learn_link:link })));
  const total = n;
  const scorePct = total ? Math.round((correct/total)*100) : 0;
  const avgTimeMs = total ? Math.round(totalTimeMs/total) : 0;

  return { total, correct, scorePct, totalTimeMs, avgTimeMs, byTopic, weakestTopics, recommendations, reviewQueue };
}

/**
 * Build a retake set biased to weakest topics
 */
export function buildRetakeSet(allQuestions, summary, count = 20) {
  const weakTopics = new Set(summary.weakestTopics.map(t => t.topic));
  const pool = allQuestions.filter(q => weakTopics.has(q.topic));
  return shuffle(pool).slice(0, count);
}

function shuffle(a) { const x=[...a]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [x[i],x[j]]=[x[j],x[i]];} return x; }

/**
 * Stable per-question ID (to track history without JSON IDs)
 */
export async function questionId(q) {
  const canon = q.type === 'dragdrop'
    ? `${q.type}|${q.question}|${(q.pairs||[]).map(p=>p.left+'→'+p.right).join(';')}`
    : `${q.type}|${q.question}|${(q.options||[]).join('|')}`;
  const enc = new TextEncoder().encode(canon);
  const digest = await crypto.subtle.digest('SHA-1', enc);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/**
 * Basic renderer for the summary view (hook this from your script.js)
 */
export function renderSummary(container, summary) {

container.innerHTML = `
  <h2>Summary</h2>
  <section class="summary-header">
    <div class="kpi">
      <div class="label">Score</div>
      <div class="value" id="kpi-score">${summary.scorePct}%</div>
    </div>
    <div class="kpi">
      <div class="label">Correct</div>
      <div class="value" id="kpi-correct">${summary.correct}/${summary.total}</div>
    </div>
    <div class="kpi">
      <div class="label">Avg time</div>
      <div class="value" id="kpi-avg">${Math.round(summary.avgTimeMs/1000)}s</div>
    </div>
  </section>
  <!-- keep the rest of your summary markup unchanged -->
  
// === Bright + color-coded KPIs (≥70% pass) ===
const PASS_THRESHOLD = 70; // tweak if you want
const pass = summary.scorePct >= PASS_THRESHOLD;

['#kpi-score', '#kpi-correct', '#kpi-avg'].forEach(sel => {
  const el = container.querySelector(sel);
  if (!el) return;
  el.classList.add('bright', pass ? 'pass' : 'fail');
});

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

  // chart
  const ctx = container.querySelector('#topicChart');
  if (ctx && window.Chart) {
    const labels = summary.byTopic.map(t=>t.topic);
    const data = summary.byTopic.map(t=>t.accuracy);
    new Chart(ctx, {
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
    li.innerHTML = `<strong>${r.topic}:</strong> <a href="${r.learn_link}" target="_blank" rel="endChild(li);
  });

  // review list (keep it compact)
  const review = container.querySelector('#reviewList');
  summary.reviewQueue.slice(0, 25).forEach(m => {
    const div = document.createElement('div');
    div.className = 'missed';
    const correctPretty = Array.isArray(m.correctAnswer) ? JSON.stringify(m.correctAnswer) : String(m.correctAnswer);
    const yourPretty = Array.isArray(m.yourAnswer) ? JSON.stringify(m.yourAnswer) : String(m.yourAnswer ?? '—');
    div.innerHTML = `
      <details>
        <summary><strong>${m.topic}</strong> — ${m.question}</summary>
        <div class="missed-body">
          <div><em>Your answer:</em> ${yourPretty}</div>
          <div><em>Correct:</em> ${correctPretty}</div>
          ${m.diff?.missed?.length ? `<div><em>Missed options:</em> ${m.diff.missed.join(', ')}</div>` : ''}
          ${m.diff?.extras?.length ? `<div><em>Extra picks:</em> ${m.diff.extras.join(', ')}</div>` : ''}
          ${m.diff?.mismatches?.length ? `<div><em>Mismatches:</em> ${m.diff.mismatches.map(p=>`${p.left}→${p.right}`).join(', ')}</div>` : ''}
          <div><a href="${m.learn_link}" targeta></div>
        </div>
      </details>`;
    review.appendChild(div);
  });

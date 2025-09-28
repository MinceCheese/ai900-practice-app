
let questions = [];
let currentQuestion = 0;
let selectedAnswers = [];
let user = 'monika';
let timer;
let timeElapsed = 0;

document.getElementById('start-btn').onclick = startQuiz;
document.getElementById('toggle-dark').onclick = () => {
  document.body.classList.toggle('dark');
};
document.getElementById('user-dropdown').onchange = (e) => {
  user = e.target.value;
};

function startQuiz() {
  const count = parseInt(document.getElementById('question-count').value);
  fetch('ai900_questions.json')
    .then(res => res.json())
    .then(data => {
      questions = data.sort(() => Math.random() - 0.5).slice(0, count); // Randomize questions
      currentQuestion = 0;
      selectedAnswers = [];
      timeElapsed = 0;
      document.getElementById('start-screen').style.display = 'none';
      document.getElementById('quiz-container').style.display = 'block';
      startTimer();
      showQuestion();
    });
}

function startTimer() {
  timer = setInterval(() => {
    timeElapsed++;
  }, 1000);
}

function showQuestion() {
  const container = document.getElementById('quiz-container');
  container.innerHTML = '';
  const q = questions[currentQuestion];
  const questionEl = document.createElement('h2');
  questionEl.textContent = q.question;
  container.appendChild(questionEl);

  if (q.type === 'single' || q.type === 'multi') {
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
      container.appendChild(btn);
    });
    if (q.type === 'multi') {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next';
      nextBtn.onclick = nextQuestion;
      container.appendChild(nextBtn);
    }
  } else if (q.type === 'dragdrop') {
    q.pairs.forEach(pair => {
      const pairEl = document.createElement('p');
      pairEl.textContent = `${pair.left} ➜ ${pair.right}`;
      container.appendChild(pairEl);
    });
    selectedAnswers[currentQuestion] = q.pairs.map((_, i) => i);
    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next';
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
  document.getElementById('quiz-container').style.display = 'none';
  const container = document.getElementById('review-container');
  container.style.display = 'block';
  container.innerHTML = '<h2>Review</h2>';
  let score = 0;
  questions.forEach((q, i) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>Q${i+1}:</strong> ${q.question}<br>`;
    const correct = JSON.stringify(q.answer.sort()) === JSON.stringify((selectedAnswers[i] || []).sort());
    if (correct) score++;
    div.innerHTML += `Your Answer: ${(selectedAnswers[i] || []).map(x => q.options ? q.options[x] : '').join(', ')}<br>`;
    div.innerHTML += `Correct Answer: ${q.options ? q.answer.map(x => q.options[x]).join(', ') : ''}<br>`;
    div.innerHTML += `Result: ${correct ? '✅' : '❌'}<br>`;
    div.innerHTML += `${q.learn_link}Learn More</a><br><br>`;
    container.appendChild(div);
  });
  saveScore(score);
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
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Score History for ${user === 'monika' ? 'Monika-chan' : 'Geoff-san'}`,
        data,
        borderColor: user === 'monika' ? 'purple' : 'blue',
        fill: false
      }]
    }
  });
}

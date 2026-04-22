// ============================================================
// UTILITIES
// ============================================================

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isCorrect(question, userAnswer) {
  if (!userAnswer || userAnswer.trim() === '') return false;
  const ua = userAnswer.trim();
  if (question.type === 'multiple-choice') {
    return ua === question.answer;
  }
  const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
  return accepted.some(a => a.trim().toLowerCase() === ua.toLowerCase());
}

// ============================================================
// LANDING PAGE
// ============================================================

async function initLanding() {
  const grid = document.getElementById('exam-grid');
  const errorEl = document.getElementById('load-error');
  if (!grid) return;

  try {
    const res = await fetch('data/exams.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const exams = await res.json();

    if (!exams.length) {
      grid.innerHTML = '<p class="empty-state">No exams available yet.</p>';
      return;
    }

    grid.innerHTML = exams.map(exam => `
      <div class="exam-card" role="button" tabindex="0"
           onclick="startExam('${escapeHtml(exam.id)}')"
           onkeydown="if(event.key==='Enter')startExam('${escapeHtml(exam.id)}')">
        <div class="exam-card-header">
          <h2 class="exam-card-title">${escapeHtml(exam.title)}</h2>
        </div>
        <p class="exam-card-desc">${escapeHtml(exam.description)}</p>
        <div class="exam-card-meta">
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${exam.timeLimit} min
          </span>
          <span class="meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            ${exam.passingScore}% to pass
          </span>
        </div>
        <button class="btn btn-primary exam-start-btn" tabindex="-1">Start Exam &rarr;</button>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
    if (errorEl) {
      errorEl.textContent = 'Could not load exams. Make sure you are serving this app from a web server (not opening index.html directly as a file).';
      errorEl.style.display = 'block';
    }
  }
}

function startExam(id) {
  window.location.href = `exam.html?id=${encodeURIComponent(id)}`;
}

// ============================================================
// EXAM PAGE
// ============================================================

const state = {
  exam: null,
  currentIndex: 0,
  answers: [],
  timeRemaining: 0,
  timerInterval: null,
  startTime: null,
  submitted: false
};

async function initExam() {
  const id = getUrlParam('id');
  if (!id) { window.location.href = 'index.html'; return; }

  // Prevent back-navigation during exam
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    history.pushState(null, '', location.href);
  });

  let exam;
  try {
    const res = await fetch(`data/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    exam = await res.json();
  } catch (err) {
    console.error(err);
    document.getElementById('exam-title').textContent = 'Error Loading Exam';
    document.getElementById('answer-area').innerHTML =
      '<p class="error-msg">Could not load this exam. <a href="index.html">Go back</a></p>';
    return;
  }

  state.exam = exam;
  state.currentIndex = 0;
  state.answers = new Array(exam.questions.length).fill('');
  state.timeRemaining = exam.timeLimit * 60;
  state.startTime = Date.now();
  state.submitted = false;

  document.getElementById('exam-title').textContent = exam.title;
  document.title = `${exam.title} — ExamKit`;

  renderQuestion();
  startTimer();
}

function startTimer() {
  updateTimer();
  state.timerInterval = setInterval(() => {
    state.timeRemaining--;
    updateTimer();
    if (state.timeRemaining <= 0) {
      clearInterval(state.timerInterval);
      submitExam(true);
    }
  }, 1000);
}

function updateTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  el.textContent = formatTime(state.timeRemaining);
  el.classList.toggle('timer-warning', state.timeRemaining <= 60);
}

function renderQuestion() {
  const { exam, currentIndex, answers } = state;
  const q = exam.questions[currentIndex];
  const total = exam.questions.length;

  document.getElementById('question-counter').textContent =
    `Question ${currentIndex + 1} of ${total}`;

  const progress = document.getElementById('progress-bar');
  progress.style.width = `${(currentIndex / total) * 100}%`;
  progress.setAttribute('aria-valuenow', currentIndex);

  const badge = document.getElementById('question-type-badge');
  badge.textContent = q.type === 'multiple-choice' ? 'Multiple Choice' : 'Short Answer';
  badge.className = `question-type-badge ${q.type === 'multiple-choice' ? 'badge-mc' : 'badge-sa'}`;

  document.getElementById('question-text').textContent = q.question;

  // Optional image
  const imgWrap = document.getElementById('question-image');
  if (q.image) {
    imgWrap.innerHTML = `<img src="${escapeHtml(q.image.src)}" alt="${escapeHtml(q.image.alt || '')}" class="question-img">`;
    imgWrap.style.display = 'block';
  } else {
    imgWrap.innerHTML = '';
    imgWrap.style.display = 'none';
  }

  const area = document.getElementById('answer-area');

  if (q.type === 'multiple-choice') {
    area.innerHTML = q.options.map((opt, i) => `
      <label class="option-label ${answers[currentIndex] === opt ? 'selected' : ''}">
        <input type="radio" name="mc-answer" value="${escapeHtml(opt)}"
               ${answers[currentIndex] === opt ? 'checked' : ''}>
        <span class="option-marker">${String.fromCharCode(65 + i)}</span>
        <span class="option-text">${escapeHtml(opt)}</span>
      </label>
    `).join('');

    area.querySelectorAll('input[type=radio]').forEach(input => {
      input.addEventListener('change', () => {
        state.answers[currentIndex] = input.value;
        area.querySelectorAll('.option-label').forEach(l => l.classList.remove('selected'));
        input.closest('.option-label').classList.add('selected');
      });
    });
  } else {
    area.innerHTML = `
      <input type="text" id="sa-input" class="short-answer-input"
             placeholder="Type your answer here…"
             value="${escapeHtml(answers[currentIndex])}"
             autocomplete="off" spellcheck="false">
    `;
    const input = document.getElementById('sa-input');
    input.focus();
    input.addEventListener('input', () => { state.answers[currentIndex] = input.value; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') nextQuestion(); });
  }

  const isLast = currentIndex === total - 1;
  const btn = document.getElementById('next-btn');
  btn.textContent = isLast ? 'Submit Exam' : 'Next Question →';
  btn.className = `btn ${isLast ? 'btn-success' : 'btn-primary'}`;
}

function nextQuestion() {
  if (state.submitted) return;
  if (state.currentIndex < state.exam.questions.length - 1) {
    state.currentIndex++;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    submitExam(false);
  }
}

function submitExam(timedOut) {
  if (state.submitted) return;
  state.submitted = true;
  clearInterval(state.timerInterval);

  const { exam, answers, startTime } = state;
  const timeTaken = Math.floor((Date.now() - startTime) / 1000);

  const results = {
    examId: exam.id,
    examTitle: exam.title,
    passingScore: exam.passingScore,
    timeTaken,
    timedOut: !!timedOut,
    questions: exam.questions.map((q, i) => ({
      question: q.question,
      image: q.image || null,
      type: q.type,
      userAnswer: answers[i] || '',
      correctAnswer: Array.isArray(q.answer) ? q.answer[0] : q.answer,
      correct: isCorrect(q, answers[i]),
      explanation: q.explanation || ''
    }))
  };

  sessionStorage.setItem('examResults', JSON.stringify(results));
  window.location.href = 'review.html';
}

// ============================================================
// REVIEW PAGE
// ============================================================

function initReview() {
  const raw = sessionStorage.getItem('examResults');
  if (!raw) { window.location.href = 'index.html'; return; }

  const results = JSON.parse(raw);
  const total = results.questions.length;
  const correct = results.questions.filter(q => q.correct).length;
  const score = Math.round((correct / total) * 100);
  const passed = score >= results.passingScore;

  document.title = `Results: ${results.examTitle} — ExamKit`;
  document.getElementById('exam-title-review').textContent = results.examTitle;
  document.getElementById('score-number').textContent = `${score}%`;
  document.getElementById('score-fraction').textContent = `${correct} / ${total} correct`;

  const badge = document.getElementById('pass-fail-badge');
  badge.textContent = passed ? 'Passed' : 'Failed';
  badge.className = `pass-fail-badge ${passed ? 'badge-passed' : 'badge-failed'}`;

  const circle = document.getElementById('score-circle');
  circle.classList.add(passed ? 'score-pass' : 'score-fail');

  const mins = Math.floor(results.timeTaken / 60);
  const secs = results.timeTaken % 60;
  document.getElementById('time-taken').textContent = `${mins}m ${secs}s`;

  if (results.timedOut) {
    document.getElementById('timed-out-notice').style.display = 'flex';
  }

  document.getElementById('review-list').innerHTML = results.questions.map((q, i) => `
    <div class="review-item ${q.correct ? 'review-correct' : 'review-incorrect'}">
      <div class="review-item-header">
        <span class="review-q-num">Q${i + 1}</span>
        <span class="review-status ${q.correct ? 'status-correct' : 'status-incorrect'}">
          ${q.correct ? '&#10003; Correct' : '&#10007; Incorrect'}
        </span>
        <span class="review-q-type">${q.type === 'multiple-choice' ? 'Multiple Choice' : 'Short Answer'}</span>
      </div>
      <p class="review-q-text">${escapeHtml(q.question)}</p>
      ${q.image ? `<img src="${escapeHtml(q.image.src)}" alt="${escapeHtml(q.image.alt || '')}" class="review-img">` : ''}
      <div class="review-answers">
        <div class="answer-row ${q.correct ? 'row-correct' : 'row-wrong'}">
          <span class="answer-label">Your answer:</span>
          <span class="answer-value">${q.userAnswer ? escapeHtml(q.userAnswer) : '<em>No answer given</em>'}</span>
        </div>
        ${!q.correct ? `
        <div class="answer-row row-correct">
          <span class="answer-label">Correct answer:</span>
          <span class="answer-value">${escapeHtml(q.correctAnswer)}</span>
        </div>
        ` : ''}
      </div>
      ${q.explanation ? `<p class="review-explanation"><strong>Explanation:</strong> ${escapeHtml(q.explanation)}</p>` : ''}
    </div>
  `).join('');
}

// ============================================================
// ROUTER
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('exam.html')) initExam();
  else if (path.endsWith('review.html')) initReview();
  else initLanding();
});

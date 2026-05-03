(function() {
  "use strict";

  let examData = null;
  let userAnswers = [];
  let currentQIndex = 0;
  let examStartTime = null;
  let timerInterval = null;
  let isPaused = false;
  let pausedRemainingSeconds = null;
  let examSubmitted = false;
  let reviewMode = false;
  let reviewSelectedIndex = 0;
  let isHistoryReview = false;

  let leftPaneWidth = 52;
  let questionScale = 100;
  let imageScale = 100;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getOptionText(option) {
    return typeof option === "string" ? option : (option?.text || "");
  }

  function getOptionImages(option) {
    return typeof option === "object" && Array.isArray(option.image_urls) ? option.image_urls : [];
  }

  function getQuestionImages(question) {
    const urls = Array.isArray(question?.image_urls) ? [...question.image_urls] : [];
    if (question?.image && !urls.includes(question.image)) urls.unshift(question.image);
    return urls.filter(Boolean);
  }

  function renderQuestionImages(question) {
    const images = getQuestionImages(question);
    if (!images.length) return "";
    return `<div class="question-image">${images.map((url) => `<img src="${url}" alt="Question image">`).join("")}</div>`;
  }
  function formatPercent(value) {
    return `${Math.round(value)}%`;
  }

  function getRemainingSeconds() {
    if (!examData) return 0;
    if (isPaused && pausedRemainingSeconds !== null) return pausedRemainingSeconds;
    if (!examStartTime) return examData.timeLimit * 60;
    const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
    return Math.max(0, examData.timeLimit * 60 - elapsed);
  }

  function getTimeUsedSeconds() {
    if (!examData) return 0;
    return Math.max(0, examData.timeLimit * 60 - getRemainingSeconds());
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function getExamViewStyle() {
    return `--left-pane-width:${leftPaneWidth}%; --question-scale:${(questionScale / 100).toFixed(2)}; --image-scale:${(imageScale / 100).toFixed(2)};`;
  }

  async function init() {
    const profile = await window.apAuth.requireLogin();
    if (!profile) return;
    const examId = localStorage.getItem("currentExamId");
    isHistoryReview = localStorage.getItem("reviewMode") === "true";
    const reviewUserId = localStorage.getItem("reviewUserId");

    if (isHistoryReview && reviewUserId !== profile.id) {
      localStorage.removeItem("reviewMode");
      localStorage.removeItem("reviewUserId");
      localStorage.removeItem("reviewAnswers");
      localStorage.removeItem("reviewScore");
      localStorage.removeItem("reviewTotal");
      isHistoryReview = false;
    }

    if (!examId) {
      alert("No exam was selected.");
      location.href = "index.html";
      return;
    }

    try {
      if (!examDB.db) {
        await examDB.open();
      }

      examData = await examDB.getExamById(examId);
      if (!examData) {
        alert("This exam no longer exists.");
        location.href = "index.html";
        return;
      }

      if (!Array.isArray(examData.questions)) {
        alert("The exam data is invalid.");
        location.href = "index.html";
        return;
      }

      if (isHistoryReview) {
        try {
          userAnswers = JSON.parse(localStorage.getItem("reviewAnswers") || "[]");
        } catch (error) {
          userAnswers = [];
        }
        if (!Array.isArray(userAnswers) || userAnswers.length !== examData.questions.length) {
          userAnswers = new Array(examData.questions.length).fill(-1);
        }
        examSubmitted = true;
        reviewMode = true;
      } else {
        if (examData.examType === "mcq") {
          userAnswers = new Array(examData.questions.length).fill(-1);
        }
        examStartTime = Date.now();
      }

      renderExamSession();
      if (!isHistoryReview) {
        startTimer();
      }
    } catch (error) {
      alert("Failed to load the exam: " + error.message);
      location.href = "index.html";
    }
  }

  window.goBackHome = function() {
    if (timerInterval) clearInterval(timerInterval);
    localStorage.removeItem("currentExamId");
    localStorage.removeItem("reviewMode");
    localStorage.removeItem("reviewUserId");
    localStorage.removeItem("reviewAnswers");
    localStorage.removeItem("reviewScore");
    localStorage.removeItem("reviewTotal");
    location.href = "index.html";
  };

  window.confirmExit = function() {
    if (examSubmitted || confirm("Leave this exam and return to the home page?")) {
      window.goBackHome();
    }
  };

  window.pauseExam = function() {
    if (examSubmitted || isHistoryReview || isPaused) return;
    pausedRemainingSeconds = getRemainingSeconds();
    isPaused = true;
    if (timerInterval) clearInterval(timerInterval);
    renderExamSession();
  };

  window.resumeExam = function() {
    if (!isPaused || !examData) return;
    const totalSeconds = examData.timeLimit * 60;
    const elapsedSeconds = totalSeconds - (pausedRemainingSeconds ?? totalSeconds);
    examStartTime = Date.now() - elapsedSeconds * 1000;
    pausedRemainingSeconds = null;
    isPaused = false;
    renderExamSession();
    startTimer();
  };

  window.setLeftPaneWidth = function(value) {
    leftPaneWidth = Math.min(70, Math.max(35, Number(value) || 52));
    renderExamSession();
  };

  window.setQuestionScale = function(value) {
    questionScale = Math.min(135, Math.max(90, Number(value) || 100));
    renderExamSession();
  };

  window.setImageScale = function(value) {
    imageScale = Math.min(140, Math.max(70, Number(value) || 100));
    renderExamSession();
  };

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (examSubmitted) return;
      const timerDisplay = document.getElementById("timerDisplay");
      if (timerDisplay) {
        timerDisplay.textContent = formatTime(getRemainingSeconds());
      }
      if (getRemainingSeconds() <= 0 && !examSubmitted) {
        submitExam();
      }
    }, 250);
  }

  function renderExamSession() {
    if (!examData) return;

    if (examSubmitted) {
      if (reviewMode && examData.examType === "mcq") {
        document.getElementById("examApp").innerHTML = renderAnswerReview();
      } else {
        document.getElementById("examApp").innerHTML = renderResultPanel();
      }
      return;
    }

    if (isPaused) {
      document.getElementById("examApp").innerHTML = renderPausedScreen();
      return;
    }

    document.getElementById("examApp").innerHTML =
      examData.examType === "mcq" ? renderMCQLayout() : renderFRQLayout();
  }

  function renderHeader(centerTitle, centerStatus, rightContent) {
    const pauseButton = !examSubmitted && !isHistoryReview
      ? `<button class="btn btn-sm" onclick="${isPaused ? "resumeExam()" : "pauseExam()"}">${isPaused ? "Resume" : "Pause"}</button>`
      : "";
    const submitDisabled = isPaused ? "disabled" : "";
    return `
      <div class="exam-top-bar">
        <div class="toolbar-group">
          <button class="btn btn-sm" onclick="confirmExit()">Exit</button>
          ${pauseButton}
          <button class="btn btn-primary btn-sm" onclick="submitExam()" ${submitDisabled}>Submit Section</button>
        </div>
        <div class="exam-title-display">
          <div class="exam-kicker">AP Practice Exam</div>
          <div class="exam-title-text">${escapeHtml(centerTitle)}</div>
          <div class="exam-status-text">${escapeHtml(centerStatus)}</div>
        </div>
        <div class="toolbar-group end">
          ${rightContent}
        </div>
      </div>
    `;
  }

  function renderPausedScreen() {
    return `
      ${renderHeader(
        examData.title,
        `Paused | Time remaining ${formatTime(getRemainingSeconds())}`,
        `<div class="timer-badge paused"><span id="timerDisplay">${formatTime(getRemainingSeconds())}</span></div>`
      )}

      <div class="pause-screen">
        <div class="pause-card">
          <div class="pause-kicker">Exam Paused</div>
          <h2>${formatTime(getRemainingSeconds())}</h2>
          <p>Your timer is stopped. Resume when you are ready to continue.</p>
          <button class="btn btn-primary" onclick="resumeExam()">Resume Exam</button>
        </div>
      </div>
    `;
  }

  function renderMCQLayout() {
    const qCount = examData.questions.length;
    if (currentQIndex >= qCount) currentQIndex = 0;

    const q = examData.questions[currentQIndex];
    const selected = userAnswers[currentQIndex];
    const answeredCount = userAnswers.filter((answer) => answer !== -1).length;

    return `
      ${renderHeader(
        examData.title,
        `Question ${currentQIndex + 1} of ${qCount} | Answered ${answeredCount} of ${qCount}`,
        `<div class="timer-badge"><span id="timerDisplay">${formatTime(getRemainingSeconds())}</span></div>`
      )}

      <div class="mcq-layout" style="${getExamViewStyle()}">
        <section class="mcq-left">
          <div class="mcq-paper">
            <div class="question-header-strip">
              <div class="question-number">Multiple-Choice Question</div>
              <div class="question-meta">${currentQIndex + 1} / ${qCount}</div>
            </div>

            <div class="left-controls">
              <label class="control-block">
                <span class="control-label-row">
                  <span>Question Pane</span>
                  <span class="control-value">${formatPercent(leftPaneWidth)}</span>
                </span>
                <input type="range" min="35" max="70" step="1" value="${leftPaneWidth}" oninput="setLeftPaneWidth(this.value)">
              </label>
              <label class="control-block">
                <span class="control-label-row">
                  <span>Text Size</span>
                  <span class="control-value">${formatPercent(questionScale)}</span>
                </span>
                <input type="range" min="90" max="135" step="5" value="${questionScale}" oninput="setQuestionScale(this.value)">
              </label>
              <label class="control-block">
                <span class="control-label-row">
                  <span>Image Size</span>
                  <span class="control-value">${formatPercent(imageScale)}</span>
                </span>
                <input type="range" min="70" max="140" step="5" value="${imageScale}" oninput="setImageScale(this.value)">
              </label>
            </div>

            <div class="question-content">
              <div class="question-text">${currentQIndex + 1}. ${escapeHtml(q.text)}</div>
              ${renderQuestionImages(q)}
            </div>
          </div>
        </section>

        <section class="mcq-right">
          <div class="mcq-answer-panel">
            <div class="answer-panel-header">
              <div class="answer-panel-kicker">Answer Choices</div>
              <div class="options-label">Select the best answer.</div>
              <div class="options-subtext">You can revise your answer at any time before submitting.</div>
            </div>

            <div class="options">
              ${q.options.map((opt, idx) => {
                const letter = String.fromCharCode(65 + idx);
                return `
                  <div class="option-item ${selected === idx ? "selected" : ""}" onclick="selectOption(${idx})">
                    <span class="option-prefix">${letter}</span>
                    <span class="option-text">${escapeHtml(getOptionText(opt))}</span>${getOptionImages(opt).map((url) => `<img class="option-inline-image" src="${url}" alt="Option image">`).join("")}
                  </div>
                `;
              }).join("")}
            </div>

            <div class="mcq-footer">
              <div class="question-progress">Resize the left pane, text, and image to match how you want to read the prompt.</div>
              <div class="nav-actions">
                <button class="btn btn-outline btn-sm" onclick="prevQuestion()" ${currentQIndex === 0 ? "disabled" : ""}>Previous</button>
                <button class="btn btn-outline btn-sm" onclick="nextQuestion()" ${currentQIndex === qCount - 1 ? "disabled" : ""}>Next</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function renderFRQLayout() {
    const qCount = examData.questions.length;

    return `
      ${renderHeader(
        examData.title,
        `Free-Response Section | ${qCount} prompts`,
        `<div class="timer-badge"><span id="timerDisplay">${formatTime(getRemainingSeconds())}</span></div>`
      )}

      <div class="frq-layout">
        <div class="frq-continuous">
          ${examData.questions.map((q, qIdx) => `
            <div class="frq-question-block">
              <div class="frq-main-text">${qIdx + 1}. ${escapeHtml(q.mainText || "")}</div>
              ${(q.parts || []).map((part, partIdx) => `
                <div class="frq-part-block">
                  <div class="frq-part-text">${String.fromCharCode(97 + partIdx)}) ${escapeHtml(part.partText || "")}</div>
                  ${part.image ? `<div class="frq-part-image"><img src="${part.image}" alt="Part image"></div>` : ""}
                  ${(part.subParts || []).map((subPart, subIdx) => `
                    <div class="frq-subpart-block">
                      <div class="frq-subpart-text">${String.fromCharCode(97 + partIdx)}-${subIdx + 1}. ${escapeHtml(subPart.text || "")}</div>
                      ${subPart.image ? `<div class="frq-subpart-image"><img src="${subPart.image}" alt="Subpart image"></div>` : ""}
                    </div>
                  `).join("")}
                </div>
              `).join("")}
            </div>
          `).join("")}

          <div class="frq-nav">
            <div>Read through the full prompt set before you submit.</div>
            <button class="btn btn-primary" onclick="submitExam()">Submit Section</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderResultPanel() {
    let score = 0;
    let total = 0;

    if (isHistoryReview) {
      score = Number(localStorage.getItem("reviewScore") || "0");
      total = Number(localStorage.getItem("reviewTotal") || "0");
    } else if (examData.examType === "mcq") {
      total = examData.questions.length;
      score = userAnswers.reduce((acc, ans, i) => acc + (ans === examData.questions[i].correct ? 1 : 0), 0);
    }

    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const statusText = percent >= 80 ? "Strong performance" : percent >= 60 ? "Solid progress" : "More review recommended";

    return `
      ${renderHeader(examData.title, isHistoryReview ? "Saved Attempt Review" : "Section Complete", `<button class="btn btn-sm" onclick="goBackHome()">Return Home</button>`)}

      <div class="result-panel">
        <div class="result-card">
          <div class="score-display">${score} / ${total}</div>
          <p style="font-family:'Segoe UI',Tahoma,sans-serif; font-size:18px; margin:10px 0; color:#4a5a71;">Accuracy ${percent}%</p>
          <p style="font-family:'Segoe UI',Tahoma,sans-serif; font-size:24px; margin:18px 0 30px; color:#10294f; font-weight:700;">${statusText}</p>
          <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="showAnswerReview()">Review Answers</button>
            ${!isHistoryReview ? `<button class="btn btn-primary" onclick="location.reload()">Try Again</button>` : ""}
            <button class="btn btn-outline" onclick="goBackHome()">Return Home</button>
          </div>
        </div>
      </div>
    `;
  }

  window.showAnswerReview = function() {
    reviewMode = true;
    reviewSelectedIndex = 0;
    renderExamSession();
  };

  window.selectReviewQuestion = function(index) {
    reviewSelectedIndex = index;
    renderExamSession();
  };

  function renderAnswerReview() {
    const total = examData.questions.length;
    const score = userAnswers.reduce((acc, ans, i) => acc + (ans === examData.questions[i].correct ? 1 : 0), 0);
    const wrongCount = total - score;
    const q = examData.questions[reviewSelectedIndex];
    const studentAnswer = userAnswers[reviewSelectedIndex];
    const isCorrect = studentAnswer === q.correct;

    return `
      ${renderHeader(
        examData.title,
        isHistoryReview ? "Saved Attempt Review" : "Answer Review",
        `<button class="btn btn-sm" onclick="reviewMode=false;renderExamSession();">Back to Summary</button>`
      )}

      <div class="review-layout">
        <div class="review-sidebar">
          <h3>Question List</h3>
          <div class="review-summary" style="flex-direction:column; gap:8px;">
            <div><strong>Score:</strong> ${score}/${total}</div>
            <div style="color:#2e7d32;">Correct: ${score}</div>
            <div style="color:#c62828;">Incorrect: ${wrongCount}</div>
          </div>
          <div class="question-grid">
            ${examData.questions.map((item, idx) => {
              const answerClass = userAnswers[idx] === item.correct ? "correct-answer" : "wrong-answer";
              const activeClass = reviewSelectedIndex === idx ? "active" : "";
              return `<button class="question-number-btn ${answerClass} ${activeClass}" onclick="selectReviewQuestion(${idx})">${idx + 1}</button>`;
            }).join("")}
          </div>
        </div>

        <div class="review-content">
          <div class="review-question-card">
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px; font-family:'Segoe UI',Tahoma,sans-serif;">
              <strong>Question ${reviewSelectedIndex + 1}</strong>
              <span class="review-status ${isCorrect ? "correct" : "wrong"}">${isCorrect ? "Correct" : "Incorrect"}</span>
            </div>
            <div style="font-size:28px; line-height:1.6; margin-bottom:24px;">${escapeHtml(q.text)}</div>
            ${renderQuestionImages(q)}
            <div class="review-options">
              ${q.options.map((opt, optIdx) => {
                const letter = String.fromCharCode(65 + optIdx);
                const isStudentSelected = studentAnswer === optIdx;
                const isCorrectAnswer = q.correct === optIdx;

                let optionClass = "";
                if (isCorrectAnswer) optionClass = "correct-answer";
                if (isStudentSelected) optionClass += " student-selected";

                let label = "";
                if (isStudentSelected && isCorrectAnswer) label = '<span class="review-answer-label">Your answer</span>';
                else if (isStudentSelected) label = '<span class="review-answer-label">Your answer</span>';
                else if (isCorrectAnswer) label = '<span class="review-answer-label">Correct answer</span>';

                return `
                  <div class="review-option ${optionClass.trim()}">
                    <span class="option-prefix">${letter}</span>
                    <span>${escapeHtml(getOptionText(opt))}</span>${getOptionImages(opt).map((url) => `<img class="option-inline-image" src="${url}" alt="Option image">`).join("")}
                    ${label}
                  </div>
                `;
              }).join("")}
            </div>
            ${q.explanation ? `<div class="review-explanation"><strong>Explanation</strong><p>${escapeHtml(q.explanation)}</p></div>` : ""}
            <div style="display:flex; gap:12px; margin-top:24px;">
              <button class="btn btn-outline" onclick="selectReviewQuestion(${Math.max(0, reviewSelectedIndex - 1)})" ${reviewSelectedIndex === 0 ? "disabled" : ""}>Previous</button>
              <button class="btn btn-outline" onclick="selectReviewQuestion(${Math.min(total - 1, reviewSelectedIndex + 1)})" ${reviewSelectedIndex === total - 1 ? "disabled" : ""}>Next</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.selectOption = function(idx) {
    if (examSubmitted || isPaused) return;
    userAnswers[currentQIndex] = idx;
    renderExamSession();
  };

  window.prevQuestion = function() {
    if (isPaused) return;
    if (currentQIndex > 0) {
      currentQIndex -= 1;
      renderExamSession();
    }
  };

  window.nextQuestion = function() {
    if (isPaused) return;
    if (currentQIndex < examData.questions.length - 1) {
      currentQIndex += 1;
      renderExamSession();
    }
  };

  window.submitExam = async function() {
    if (examSubmitted) return;
    if (isPaused) return;

    if (timerInterval) clearInterval(timerInterval);
    examSubmitted = true;
    reviewMode = false;

    const historyRecord = {
      examId: localStorage.getItem("currentExamId"),
      examTitle: examData.title,
      examType: examData.examType,
      timeUsed: getTimeUsedSeconds(),
      completedAt: new Date().toISOString()
    };

    if (examData.examType === "mcq") {
      historyRecord.score = userAnswers.reduce((acc, ans, i) => acc + (ans === examData.questions[i].correct ? 1 : 0), 0);
      historyRecord.total = examData.questions.length;
      historyRecord.answers = [...userAnswers];
    } else {
      historyRecord.score = 0;
      historyRecord.total = examData.questions.length;
    }

    try {
      await examDB.saveExamHistory(historyRecord);
    } catch (error) {
      console.error("Failed to save history:", error);
    }

    renderExamSession();
  };

  init();
})();

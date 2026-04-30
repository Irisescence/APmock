(function(){
  "use strict";

  const DEFAULT_EXAMS = [
    {
      id: 'ap-test-exam',
      subject: 'test',
      title: 'AP-test-exam',
      description: '极限、导数、积分与微分方程',
      timeLimit: 45,
      examType: 'mcq',
      isPublic: false,
      questions: [
        { 
          type: 'mcq',
          text: '若 f(x) = 3x² - 4x + 7，则 f\'(2) = ?', 
          options: ['4', '8', '10', '12'], 
          correct: 1,
          image: null
        },
        { 
          type: 'mcq',
          text: '极限 lim_{x→0} (sin 5x)/(2x) 的值是？', 
          options: ['0', '2.5', '5', '不存在'], 
          correct: 1,
          image: null
        }
      ]
    }
  ];

  let EXAMS = [];
  let editingExamId = null;
  let pendingImageCallback = null;
  let isSavingExam = false;
  let examWorkspaceHandle = null;
  let currentRole = "guest";
  let canEditExams = false;

  const examGridContainer = document.getElementById('examGridContainer');
  const editorModal = document.getElementById('editorModal');
  const modalTitle = document.getElementById('modalTitle');
  const examForm = document.getElementById('examForm');
  const examTypeSelect = document.getElementById('examType');
  const importFileInput = document.getElementById('importFileInput');
  const importFolderInput = document.getElementById('importFolderInput');
  const imageUploadInput = document.getElementById('imageUploadInput');


  function applyRolePermissions() {
    const teacherActions = document.getElementById('teacherActions');
    if (teacherActions) {
      teacherActions.style.display = canEditExams ? 'flex' : 'none';
    }
    if (!canEditExams && editorModal) {
      editorModal.classList.add('hidden');
    }
  }

  function requireTeacherPermission() {
    if (canEditExams) return true;
    alert('Students can view exam lists and take exams, but cannot create or edit exams.');
    return false;
  }
  // 初始化
  // 在 init 函数中
async function init() {
  console.log('🚀 初始化主页...');

  try {
    const profile = await window.apAuth.getCurrentProfile();
    window.apAuth.renderAuthBox('authContainer');
    if (!profile) {
      examGridContainer.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">Please sign up or log in first.</p>';
      applyRolePermissions();
      return;
    }
    currentRole = profile.role;
    canEditExams = window.apAuth.isTeacherLike(currentRole);
    applyRolePermissions();
  } catch (error) {
    console.error('Auth init failed', error);
    alert('Auth init failed: ' + error.message);
    return;
  }
  
  try {
    await examDB.open();
    EXAMS = await examDB.getUserExams();
    
    if (EXAMS.length === 0) {
      for (const exam of DEFAULT_EXAMS) {
        await examDB.saveExam(exam);
      }
      EXAMS = await examDB.getUserExams();
    }
    
    // 异步渲染，加载历史记录
    await renderExamCards();
    
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

  // 渲染试卷卡片
  // 修改 renderExamCards 函数
async function renderExamCards() {
  console.log('🎨 渲染试卷卡片...');
  
  // 获取所有试卷的最新记录
  const visibleExams = canEditExams ? EXAMS : EXAMS.filter(exam => exam.isPublic === true);
  const latestRecords = await examDB.getAllLatestHistory();
  
  let html = '';
  if (visibleExams.length === 0) {
    html = '<p style="grid-column:1/-1; text-align:center; padding:40px; color:#999;">暂无试卷，点击"新建试卷"开始</p>';
  } else {
    visibleExams.forEach(exam => {
      const typeLabel = exam.examType === 'mcq' ? '📝 MCQ' : '📄 FRQ';
      const latestRecord = latestRecords[exam.id];
      
      // 上次成绩信息
      let lastScoreHtml = '';
      if (latestRecord) {
        const date = new Date(latestRecord.completedAt);
        const dateStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        const percent = Math.round(latestRecord.score / latestRecord.total * 100);
        const scoreColor = percent >= 80 ? '#4caf50' : percent >= 60 ? '#ff9800' : '#f44336';
        
        lastScoreHtml = `
          <div style="margin-top:12px; padding:12px; background:#f8fafd; border-radius:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.85rem; color:#5b6778;">📅 上次: ${dateStr}</span>
              <span style="font-weight:700; color:${scoreColor}; font-size:1.1rem;">
                ${latestRecord.score}/${latestRecord.total} (${percent}%)
              </span>
            </div>
            <button class="btn btn-sm btn-outline" onclick="viewHistory('${exam.id}')" 
                    style="width:100%; margin-top:8px;">
              📊 查看详情
            </button>
          </div>
        `;
      }
      
      html += `
        <div class="exam-card">
          <div class="card-actions" style="display:${canEditExams ? 'flex' : 'none'}">
            <button class="icon-btn" onclick="editExam('${exam.id}')" title="编辑">✎</button>
            <button class="icon-btn" onclick="deleteExam('${exam.id}')" title="删除">🗑</button>
          </div>
          <span class="exam-badge">${exam.subject} <span class="exam-type-badge">${typeLabel}</span></span>
          <div class="exam-title">${exam.title}</div>
          <div class="exam-desc">${exam.description || ''}</div>
          <div class="exam-meta">
            <span>⏱️ ${exam.timeLimit} 分钟</span>
            <span>📋 ${exam.questions?.length || 0} 题</span>
          </div>
          ${lastScoreHtml}
          <button class="start-btn" onclick="startExam('${exam.id}')">▶ 开始考试</button>
        </div>
      `;
    });
  }
  
  examGridContainer.innerHTML = html;
}

  function renderExamCardsSync() {
    let html = '';
    const visibleExams = canEditExams ? EXAMS : EXAMS.filter(exam => exam.isPublic === true);
    visibleExams.forEach(exam => {
      const typeLabel = exam.examType === 'mcq' ? '📝 MCQ' : '📄 FRQ';
      html += `
        <div class="exam-card">
          <div class="card-actions" style="display:${canEditExams ? 'flex' : 'none'}">
            <button class="icon-btn" onclick="editExam('${exam.id}')" title="编辑">✎</button>
            <button class="icon-btn" onclick="deleteExam('${exam.id}')" title="删除">🗑</button>
          </div>
          <span class="exam-badge">${exam.subject} <span class="exam-type-badge">${typeLabel}</span></span>
          <div class="exam-title">${exam.title}</div>
          <div class="exam-desc">${exam.description || ''}</div>
          <div class="exam-meta">
            <span>⏱️ ${exam.timeLimit} 分钟</span>
            <span>📋 ${exam.questions?.length || 0} 题</span>
          </div>
          <button class="start-btn" onclick="startExam('${exam.id}')">▶ 开始考试</button>
        </div>
      `;
    });
    examGridContainer.innerHTML = html || '<p style="grid-column:1/-1; text-align:center; padding:40px;">暂无试卷，点击"新建试卷"开始</p>';
  }

  // 查看历史详情
// 查看历史详情 - 跳转到答题详情页面
window.viewHistory = async function(examId) {
  console.log('📊 查看历史详情:', examId);
  
  try {
    // 获取试卷信息
    const exam = EXAMS.find(e => e.id === examId);
    if (!exam) {
      alert('试卷不存在');
      return;
    }
    
    // 获取该试卷最近一次记录
    const history = await examDB.getExamHistory(examId);
    const userHistory = history.filter(h => h.userId === examDB.userId);
    userHistory.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    
    if (userHistory.length === 0) {
      alert('暂无考试记录');
      return;
    }
    
    // 将最近的记录保存到 localStorage，然后跳转到考试页面（以回顾模式）
    localStorage.setItem('currentExamId', examId);
    localStorage.setItem('reviewMode', 'true');
    localStorage.setItem('reviewAnswers', JSON.stringify(userHistory[0].answers));
    localStorage.setItem('reviewScore', userHistory[0].score);
    localStorage.setItem('reviewTotal', userHistory[0].total);
    
    // 跳转到考试页面
    window.location.href = 'exam.html';
    
  } catch (error) {
    console.error('获取历史失败:', error);
    alert('获取历史记录失败');
  }
};

// 显示历史记录弹窗
function showHistoryModal(exam, history) {
  // 创建模态框
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
  `;
  
  let historyHtml = '';
  history.forEach((record, index) => {
    const date = new Date(record.completedAt);
    const dateStr = `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const timeUsed = Math.floor(record.timeUsed / 60) + '分' + (record.timeUsed % 60) + '秒';
    const percent = Math.round(record.score / record.total * 100);
    const scoreColor = percent >= 80 ? '#4caf50' : percent >= 60 ? '#ff9800' : '#f44336';
    
    historyHtml += `
      <div style="padding:16px; margin-bottom:12px; background:#f8fafd; border-radius:12px; ${index === 0 ? 'border:2px solid #1e2b5e;' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:600;">${index === 0 ? '🆕 最新' : ''} ${dateStr}</span>
          <span style="font-size:1.2rem; font-weight:700; color:${scoreColor};">${record.score}/${record.total} (${percent}%)</span>
        </div>
        <div style="display:flex; gap:20px; color:#5b6778; font-size:0.9rem;">
          <span>⏱️ 用时: ${timeUsed}</span>
          <span>📝 类型: ${record.examType === 'mcq' ? '选择题' : 'FRQ'}</span>
        </div>
      </div>
    `;
  });
  
  modal.innerHTML = `
    <div style="background:white; border-radius:24px; padding:32px; max-width:600px; width:90%; max-height:80vh; overflow-y:auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
        <h2 style="font-size:1.5rem;">📊 ${exam.title} - 考试记录</h2>
        <button onclick="this.closest('div').parentElement.remove()" style="width:32px;height:32px;border-radius:50%;border:1px solid #ddd;background:white;cursor:pointer;font-size:1.2rem;">✕</button>
      </div>
      
      <div style="margin-bottom:20px; padding:16px; background:#1e2b5e; color:white; border-radius:16px; text-align:center;">
        <div style="font-size:0.9rem; opacity:0.8;">共完成 ${history.length} 次考试</div>
        <div style="font-size:2rem; font-weight:700; margin-top:8px;">
          最佳: ${Math.max(...history.map(h => h.score))}/${history[0].total}
        </div>
      </div>
      
      <h3 style="margin-bottom:12px;">📝 历史记录</h3>
      ${historyHtml}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 点击背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

  // 跳转到考试页面
window.startExam = function(examId) {
  console.log('🎯 开始考试，试卷ID:', examId);
  
  // 验证试卷是否存在
  const exam = EXAMS.find(e => e.id === examId);
  if (!exam) {
    alert('试卷不存在，请刷新页面后重试');
    return;
  }
  
  localStorage.setItem('currentExamId', examId);
  window.location.href = 'exam.html';
};

  // 打开编辑器
  window.openEditor = function(examId = null) {
    editingExamId = examId;
    const exam = examId ? EXAMS.find(e => e.id === examId) : null;
    
    modalTitle.textContent = exam ? '编辑试卷' : '新建试卷';
    document.getElementById('examSubject').value = exam?.subject || '';
    document.getElementById('examTitle').value = exam?.title || '';
    document.getElementById('examDesc').value = exam?.description || '';
    document.getElementById('examTime').value = exam?.timeLimit || 45;
    document.getElementById('examType').value = exam?.examType || 'mcq';
    document.getElementById('examVisibility').value = exam?.isPublic ? 'public' : 'private';
    
    renderQuestionsEditor(exam?.questions || [], exam?.examType || 'mcq');
    editorModal.classList.remove('hidden');
  };

  window.closeEditor = function() {
    editorModal.classList.add('hidden');
    editingExamId = null;
  };

  window.editExam = function(examId) {
    openEditor(examId);
  };

  window.deleteExam = async function(examId) {
    if (confirm('确定删除这套试卷吗？')) {
      await examDB.deleteExam(examId);
      await renderExamCards();
    }
  };

  // MCQ 编辑器
  function renderMCQEditor(q, qIndex) {
    let html = `
      <div class="question-item">
        <div class="question-header">
          <strong>题目 ${qIndex + 1}</strong>
          <div>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'up')" ${qIndex === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'down')">↓</button>
            <button type="button" class="btn-icon" onclick="removeQuestion(${qIndex})">🗑</button>
          </div>
        </div>
        <div class="form-group">
          <input type="text" name="q${qIndex}_text" value="${(q.text || '').replace(/"/g, '&quot;')}" placeholder="题目内容" required>
        </div>
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForMCQ(${qIndex})">📷 上传图片</button>
          ${q.image ? `<img src="${q.image}" class="image-preview">` : ''}
        </div>
        <input type="hidden" name="q${qIndex}_image" id="q${qIndex}_image" value="${q.image || ''}">
    `;
    
    q.options?.forEach((opt, optIndex) => {
      const letter = String.fromCharCode(65 + optIndex);
      html += `
        <div class="option-row">
          <span style="width:24px; font-weight:600;">${letter}</span>
          <input type="text" name="q${qIndex}_opt${optIndex}" value="${opt.replace(/"/g, '&quot;')}" placeholder="选项 ${letter}" required>
          <button type="button" class="btn-icon" onclick="setMCQCorrect(${qIndex}, ${optIndex})" 
                  style="background:${q.correct === optIndex ? '#4caf50' : 'white'}; color:${q.correct === optIndex ? 'white' : '#1e2b5e'};">
            ✓
          </button>
        </div>
      `;
    });
    
    html += `
        <input type="hidden" name="q${qIndex}_correct" value="${q.correct || 0}" id="q${qIndex}_correct">
      </div>
    `;
    
    return html;
  }

  // FRQ 编辑器（简化版，保留之前的功能）
  function renderFRQEditor(q, qIndex) {
    let html = `
      <div class="question-item">
        <div class="question-header">
          <strong>FRQ 题目 ${qIndex + 1}</strong>
          <div>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'up')">↑</button>
            <button type="button" class="btn-icon" onclick="moveQuestion(${qIndex}, 'down')">↓</button>
            <button type="button" class="btn-icon" onclick="removeQuestion(${qIndex})">🗑</button>
          </div>
        </div>
        
        <div class="frq-section">
          <div class="frq-section-header">
            <span class="frq-section-title">📌 大题干</span>
          </div>
          <input type="text" name="q${qIndex}_mainText" value="${(q.mainText || '').replace(/"/g, '&quot;')}" placeholder="输入大题题干" style="width:100%;">
        </div>
        
        <div class="frq-section">
          <div class="frq-section-header">
            <span class="frq-section-title">📋 小题干</span>
            <button type="button" class="btn-icon" onclick="addFRQPart(${qIndex})">➕</button>
          </div>
          <div id="frqParts_${qIndex}" class="frq-items-container">
    `;
    
    q.parts?.forEach((part, partIdx) => {
      html += renderFRQPartEditor(qIndex, partIdx, part);
    });
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    return html;
  }

  function renderFRQPartEditor(qIndex, partIdx, part) {
    let html = `
      <div class="frq-item">
        <div class="frq-item-header">
          <span>小题干 ${String.fromCharCode(97 + partIdx)})</span>
          <button type="button" class="btn-icon" onclick="removeFRQPart(${qIndex}, ${partIdx})">🗑</button>
        </div>
        <input type="text" name="q${qIndex}_part${partIdx}_text" value="${(part.partText || '').replace(/"/g, '&quot;')}" placeholder="小题干内容" style="width:100%; margin-bottom:10px;">
        
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForFRQPart(${qIndex}, ${partIdx})">📷 小题干图片</button>
          ${part.image ? `<img src="${part.image}" class="image-preview">` : ''}
          <input type="hidden" name="q${qIndex}_part${partIdx}_image" value="${part.image || ''}">
        </div>
        
        <div style="margin-top:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:0.9rem;">📝 小题</strong>
            <button type="button" class="btn-icon" onclick="addFRQSubPart(${qIndex}, ${partIdx})">➕</button>
          </div>
          <div id="frqSubParts_${qIndex}_${partIdx}">
    `;
    
    part.subParts?.forEach((subPart, subIdx) => {
      html += renderFRQSubPartEditor(qIndex, partIdx, subIdx, subPart);
    });
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    return html;
  }

  function renderFRQSubPartEditor(qIndex, partIdx, subIdx, subPart) {
    return `
      <div style="margin-left:20px; margin-top:10px; padding:10px; background:#f0f4fa; border-radius:8px;">
        <div style="display:flex; justify-content:space-between;">
          <span>小题 ${subIdx+1}</span>
          <button type="button" class="btn-icon" onclick="removeFRQSubPart(${qIndex}, ${partIdx}, ${subIdx})" style="width:24px;height:24px;">✕</button>
        </div>
        <input type="text" name="q${qIndex}_part${partIdx}_sub${subIdx}_text" value="${(subPart.text || '').replace(/"/g, '&quot;')}" placeholder="小题内容" style="width:100%;">
        <div class="image-upload-area">
          <button type="button" class="btn btn-sm btn-outline" onclick="uploadImageForFRQSubPart(${qIndex}, ${partIdx}, ${subIdx})">📷 图片</button>
          ${subPart.image ? `<img src="${subPart.image}" class="image-preview">` : ''}
          <input type="hidden" name="q${qIndex}_part${partIdx}_sub${subIdx}_image" value="${subPart.image || ''}">
        </div>
      </div>
    `;
  }

  // 保持其他编辑器函数不变...
  // (addQuestion, removeQuestion, moveQuestion, setMCQCorrect, addFRQPart, removeFRQPart, addFRQSubPart, removeFRQSubPart, uploadImageForMCQ, uploadImageForFRQPart, uploadImageForFRQSubPart, getCurrentQuestionsFromForm)

  window.addQuestion = function() {
  const questions = getCurrentQuestionsFromForm();
  const examType = examTypeSelect.value;
  
  if (examType === 'mcq') {
    questions.push({
      type: 'mcq',
      text: '新题目',
      options: ['选项 A', '选项 B', '选项 C', '选项 D'],
      correct: 0,
      image: null
    });
  } else {
    questions.push({
      type: 'frq',
      mainText: '新 FRQ 大题',
      parts: []
    });
  }
  
  renderQuestionsEditor(questions, examType);
};

  window.removeQuestion = function(index) {
  const questions = getCurrentQuestionsFromForm();
  if (questions.length <= 1) {
    alert('至少保留一道题目');
    return;
  }
  questions.splice(index, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

  window.moveQuestion = function(index, direction) {
  const questions = getCurrentQuestionsFromForm();
  
  if (direction === 'up' && index > 0) {
    const temp = questions[index - 1];
    questions[index - 1] = questions[index];
    questions[index] = temp;
  } else if (direction === 'down' && index < questions.length - 1) {
    const temp = questions[index + 1];
    questions[index + 1] = questions[index];
    questions[index] = temp;
  }
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

  window.setMCQCorrect = function(qIndex, optIndex) {
  const correctInput = document.getElementById(`q${qIndex}_correct`);
  if (correctInput) {
    correctInput.value = optIndex;
  }
  const questions = getCurrentQuestionsFromForm();
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.uploadImageForMCQ = function(qIndex) {
  uploadImage((imageData) => {
    const imageInput = document.getElementById(`q${qIndex}_image`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

  window.addFRQPart = function(qIndex) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex]) return;
  
  if (!questions[qIndex].parts) questions[qIndex].parts = [];
  questions[qIndex].parts.push({
    id: `part_${Date.now()}`,
    partText: '',
    image: null,
    subParts: []
  });
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.removeFRQPart = function(qIndex, partIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts) return;
  
  questions[qIndex].parts.splice(partIdx, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.addFRQSubPart = function(qIndex, partIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts || !questions[qIndex].parts[partIdx]) return;
  
  if (!questions[qIndex].parts[partIdx].subParts) {
    questions[qIndex].parts[partIdx].subParts = [];
  }
  
  questions[qIndex].parts[partIdx].subParts.push({
    text: '',
    image: null
  });
  
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.removeFRQSubPart = function(qIndex, partIdx, subIdx) {
  const questions = getCurrentQuestionsFromForm();
  if (!questions[qIndex] || !questions[qIndex].parts || !questions[qIndex].parts[partIdx]) return;
  
  questions[qIndex].parts[partIdx].subParts.splice(subIdx, 1);
  renderQuestionsEditor(questions, examTypeSelect.value);
};

window.uploadImageForFRQPart = function(qIndex, partIdx) {
  uploadImage((imageData) => {
    const imageInput = document.querySelector(`input[name="q${qIndex}_part${partIdx}_image"]`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

window.uploadImageForFRQSubPart = function(qIndex, partIdx, subIdx) {
  uploadImage((imageData) => {
    const imageInput = document.querySelector(`input[name="q${qIndex}_part${partIdx}_sub${subIdx}_image"]`);
    if (imageInput) {
      imageInput.value = imageData;
    }
    const questions = getCurrentQuestionsFromForm();
    renderQuestionsEditor(questions, examTypeSelect.value);
  });
};

  function uploadImage(callback) {
  pendingImageCallback = callback;
  imageUploadInput.value = '';
  imageUploadInput.click();
}

imageUploadInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof pendingImageCallback === 'function') {
      pendingImageCallback(reader.result);
    }
    pendingImageCallback = null;
    imageUploadInput.value = '';
  };
  reader.onerror = () => {
    console.error('Image upload failed:', reader.error);
    alert('图片读取失败，请重试');
    pendingImageCallback = null;
    imageUploadInput.value = '';
  };
  reader.readAsDataURL(file);
});

function slugifyFileName(value, fallback = 'exam') {
  return (value || fallback)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
}

function sanitizePathSegment(value, fallback = 'item') {
  return (value || fallback)
    .toString()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
}

function getExtensionFromMimeType(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp'
  };
  return map[mimeType] || 'png';
}

function dataUrlToBlob(dataUrl) {
  const matches = /^data:([^;,]+)?(?:;base64)?,(.*)$/.exec(dataUrl || '');
  if (!matches) {
    throw new Error('Invalid image data');
  }

  const mimeType = matches[1] || 'application/octet-stream';
  const binary = atob(matches[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function writeTextFile(dirHandle, fileName, content) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBlobFile(dirHandle, fileName, blob) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function ensureExamWorkspaceHandle() {
  if (examWorkspaceHandle) {
    return examWorkspaceHandle;
  }

  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('Current browser does not support folder writing. Please open the page in a recent Chromium browser.');
  }

  examWorkspaceHandle = await window.showDirectoryPicker({
    id: 'ap-exam-workspace',
    mode: 'readwrite'
  });
  return examWorkspaceHandle;
}

function buildExamPackage(exam) {
  const assets = [];

  const registerImage = (dataUrl, preferredName) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return dataUrl || null;
    }

    const blob = dataUrlToBlob(dataUrl);
    const extension = getExtensionFromMimeType(blob.type);
    const baseName = sanitizePathSegment(preferredName, `image-${assets.length + 1}`);
    const fileName = `${baseName}.${extension}`;
    assets.push({ path: `images/${fileName}`, blob });
    return `images/${fileName}`;
  };

  const questions = (exam.questions || []).map((question, qIndex) => {
    if (question.type === 'mcq') {
      return {
        ...question,
        image: registerImage(question.image, `q${qIndex + 1}`)
      };
    }

    return {
      ...question,
      parts: (question.parts || []).map((part, partIdx) => ({
        ...part,
        image: registerImage(part.image, `q${qIndex + 1}-part${partIdx + 1}`),
        subParts: (part.subParts || []).map((subPart, subIdx) => ({
          ...subPart,
          image: registerImage(subPart.image, `q${qIndex + 1}-part${partIdx + 1}-sub${subIdx + 1}`)
        }))
      }))
    };
  });

  return {
    folderName: sanitizePathSegment(`${exam.subject || 'exam'}-${exam.title || exam.id}`),
    manifest: {
      id: exam.id,
      subject: exam.subject,
      title: exam.title,
      description: exam.description,
      timeLimit: exam.timeLimit,
      examType: exam.examType,
      isPublic: !!exam.isPublic,
      createdAt: exam.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions
    },
    assets
  };
}

async function writeExamPackageToDirectory(rootHandle, exam) {
  const pkg = buildExamPackage(exam);
  const examDirHandle = await rootHandle.getDirectoryHandle(pkg.folderName, { create: true });
  const imageDirHandle = await examDirHandle.getDirectoryHandle('images', { create: true });

  for (const asset of pkg.assets) {
    const fileName = asset.path.split('/').pop();
    await writeBlobFile(imageDirHandle, fileName, asset.blob);
  }

  await writeTextFile(examDirHandle, 'exam.json', JSON.stringify(pkg.manifest, null, 2));
  return pkg.folderName;
}

async function syncExamToWorkspace(exam) {
  const rootHandle = await ensureExamWorkspaceHandle();
  const folderName = await writeExamPackageToDirectory(rootHandle, exam);
  return folderName;
}

async function resolveImagePathToDataUrl(fileMap, baseFolder, relativePath) {
  if (!relativePath) {
    return null;
  }
  if (typeof relativePath === 'string' && relativePath.startsWith('data:image/')) {
    return relativePath;
  }

  const normalizedBase = baseFolder ? `${baseFolder}/` : '';
  const normalizedPath = `${normalizedBase}${relativePath}`.replace(/\\/g, '/');
  const file = fileMap.get(normalizedPath);
  if (!file) {
    return null;
  }
  return fileToDataUrl(file);
}

async function hydrateImportedExam(manifest, folderPath, fileMap) {
  const hydratedQuestions = [];

  for (const question of manifest.questions || []) {
    if (question.type === 'mcq') {
      hydratedQuestions.push({
        ...question,
        image: await resolveImagePathToDataUrl(fileMap, folderPath, question.image)
      });
      continue;
    }

    const parts = [];
    for (const part of question.parts || []) {
      const subParts = [];
      for (const subPart of part.subParts || []) {
        subParts.push({
          ...subPart,
          image: await resolveImagePathToDataUrl(fileMap, folderPath, subPart.image)
        });
      }

      parts.push({
        ...part,
        image: await resolveImagePathToDataUrl(fileMap, folderPath, part.image),
        subParts
      });
    }

    hydratedQuestions.push({
      ...question,
      parts
    });
  }

  return {
    ...manifest,
    questions: hydratedQuestions
  };
}

async function importExamsFromFolderFiles(files) {
  const fileMap = new Map();
  const manifestFiles = [];

  Array.from(files || []).forEach((file) => {
    const relativePath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    fileMap.set(relativePath, file);
    if (relativePath.endsWith('/exam.json') || relativePath === 'exam.json') {
      manifestFiles.push({ file, relativePath });
    }
  });

  if (manifestFiles.length === 0) {
    throw new Error('No exam.json files were found in the selected folder');
  }

  let importedCount = 0;
  for (const manifestEntry of manifestFiles) {
    const manifestText = await manifestEntry.file.text();
    const manifest = JSON.parse(manifestText);
    const pathParts = manifestEntry.relativePath.split('/');
    pathParts.pop();
    const folderPath = pathParts.join('/');
    const hydratedExam = await hydrateImportedExam(manifest, folderPath, fileMap);
    await examDB.saveExam(hydratedExam);
    importedCount += 1;
  }

  EXAMS = await examDB.getUserExams();
  await renderExamCards();
  return importedCount;
}

async function exportAllExamsToFolder() {
  const rootHandle = await ensureExamWorkspaceHandle();
  const exportFolderName = `ap-exam-export-${new Date().toISOString().slice(0, 10)}`;
  const exportRootHandle = await rootHandle.getDirectoryHandle(exportFolderName, { create: true });

  for (const exam of EXAMS) {
    await writeExamPackageToDirectory(exportRootHandle, exam);
  }

  return exportFolderName;
}

examForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!requireTeacherPermission()) return;
  if (isSavingExam) {
    return;
  }
  isSavingExam = true;
  
  console.log('📝 提交表单...');
  
  const subject = document.getElementById('examSubject').value.trim();
  const title = document.getElementById('examTitle').value.trim();
  const description = document.getElementById('examDesc').value.trim();
  const timeLimit = parseInt(document.getElementById('examTime').value);
  const examType = examTypeSelect.value;
  const isPublic = document.getElementById('examVisibility').value === 'public';
  const questions = getCurrentQuestionsFromForm();
  
  if (!subject || !title || questions.length === 0) {
    isSavingExam = false;
    alert('请填写完整信息并至少添加一道题目');
    return;
  }
  
  try {
    await ensureExamWorkspaceHandle();
  } catch (error) {
    isSavingExam = false;
    alert('请选择试卷导出文件夹: ' + error.message);
    return;
  }

  const examData = {
    id: editingExamId || `exam_${Date.now()}`,
    subject,
    title,
    description,
    timeLimit,
    examType,
    isPublic,
    questions
  };

  if (editingExamId) {
    examData.createdAt = EXAMS.find(e => e.id === editingExamId)?.createdAt;
  }
  
  try {
    await examDB.saveExam(examData);
    await syncExamToWorkspace(examData);
    closeEditor();
    
    // 重新加载数据并刷新显示
    EXAMS = await examDB.getUserExams();
    await renderExamCards();
    console.log('✅ 保存成功，共', EXAMS.length, '套试卷');
    
  } catch (error) {
    console.error('❌ 保存失败:', error);
    alert('保存失败: ' + error.message);
  } finally {
    isSavingExam = false;
  }
});


  function renderQuestionsEditor(questions, examType) {
  const container = document.getElementById('questionsList');
  
  if (!questions || questions.length === 0) {
    container.innerHTML = '<p style="color:#999; padding:20px; text-align:center;">暂无题目，点击下方添加</p>';
    return;
  }
  
  let html = '';
  questions.forEach((q, qIndex) => {
    if (examType === 'mcq') {
      html += renderMCQEditor(q, qIndex);
    } else {
      html += renderFRQEditor(q, qIndex);
    }
  });
  
  container.innerHTML = html;
}

  examTypeSelect.addEventListener('change', () => {
  const newType = examTypeSelect.value;
  console.log('🔄 切换题型到:', newType);
  
  // 只创建一个默认题目
  let newQuestions = [];
  
  if (newType === 'mcq') {
    newQuestions = [{
      type: 'mcq',
      text: '新题目',
      options: ['选项 A', '选项 B', '选项 C', '选项 D'],
      correct: 0,
      image: null
    }];
  } else {
    newQuestions = [{
      type: 'frq',
      mainText: '新 FRQ 大题',
      parts: []
    }];
  }
  
  renderQuestionsEditor(newQuestions, newType);
});
  
  // 表单提交
  false && examForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const subject = document.getElementById('examSubject').value.trim();
    const title = document.getElementById('examTitle').value.trim();
    const description = document.getElementById('examDesc').value.trim();
    const timeLimit = parseInt(document.getElementById('examTime').value);
    const examType = examTypeSelect.value;
    const isPublic = document.getElementById('examVisibility').value === 'public';
    const questions = getCurrentQuestionsFromForm();
    
    if (!subject || !title || questions.length === 0) {
      alert('请填写完整信息并至少添加一道题目');
      return;
    }
    
    const examData = {
      id: editingExamId || `exam_${Date.now()}`,
      subject,
      title,
      description,
      timeLimit,
      examType,
      isPublic,
      questions
    };
    
    if (editingExamId) {
      examData.createdAt = EXAMS.find(e => e.id === editingExamId)?.createdAt;
    }
    
    await examDB.saveExam(examData);
    closeEditor();
    await renderExamCards();
  });

  // 导出
  document.getElementById('exportDataBtn').addEventListener('click', async () => {
    if (!requireTeacherPermission()) return;
    try {
      const folderName = await exportAllExamsToFolder();
      alert(`导出完成，文件夹已写入: ${folderName}`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败: ' + error.message);
    }
  });

  // 导入
  document.getElementById('importDataBtn').addEventListener('click', () => {
    if (!requireTeacherPermission()) return;
    importFolderInput.click();
  });

  importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        await examDB.importData(ev.target.result);
        await renderExamCards();
        alert('导入成功！');
      } catch (err) {
        alert('导入失败：' + err.message);
      }
      importFileInput.value = '';
    };
    reader.readAsText(file);
  });

  importFolderInput.addEventListener('change', async (e) => {
    try {
      const importedCount = await importExamsFromFolderFiles(e.target.files);
      alert(`导入完成，共导入 ${importedCount} 套试卷`);
    } catch (err) {
      console.error('Import failed:', err);
      alert('导入失败: ' + err.message);
    }
    importFolderInput.value = '';
  });

  document.getElementById('addExamBtn').addEventListener('click', () => {
    if (!requireTeacherPermission()) return;
    openEditor(null);
  });

  // 替换原来的空函数
window.getCurrentQuestionsFromForm = function() {
  const examType = examTypeSelect.value;
  const container = document.getElementById('questionsList');
  const questionItems = container.querySelectorAll('.question-item');
  const questions = [];
  
  questionItems.forEach((item, idx) => {
    if (examType === 'mcq') {
      // MCQ 题目解析
      const textInput = item.querySelector(`input[name^="q${idx}_text"]`);
      const text = textInput?.value || '';
      
      const options = [];
      for (let i = 0; i < 4; i++) {
        const optInput = item.querySelector(`input[name="q${idx}_opt${i}"]`);
        options.push(optInput?.value || `选项 ${String.fromCharCode(65 + i)}`);
      }
      
      const correctInput = item.querySelector(`input[name="q${idx}_correct"]`);
      const correct = parseInt(correctInput?.value || '0');
      
      const imageInput = item.querySelector(`input[name="q${idx}_image"]`);
      const image = imageInput?.value || null;
      
      questions.push({ 
        type: 'mcq', 
        text, 
        options, 
        correct, 
        image: image && image !== 'null' ? image : null 
      });
    } else {
      // FRQ 题目解析
      const mainTextInput = item.querySelector(`input[name="q${idx}_mainText"]`);
      const mainText = mainTextInput?.value || '';
      
      const parts = [];
      const partsContainer = document.getElementById(`frqParts_${idx}`);
      
      if (partsContainer) {
        const partItems = partsContainer.querySelectorAll('.frq-item');
        partItems.forEach((partItem, partIdx) => {
          const partTextInput = partItem.querySelector(`input[name="q${idx}_part${partIdx}_text"]`);
          const partText = partTextInput?.value || '';
          
          const partImageInput = partItem.querySelector(`input[name="q${idx}_part${partIdx}_image"]`);
          const partImage = partImageInput?.value || null;
          
          const subParts = [];
          const subPartsContainer = document.getElementById(`frqSubParts_${idx}_${partIdx}`);
          
          if (subPartsContainer) {
            const subPartDivs = subPartsContainer.children;
            for (let subIdx = 0; subIdx < subPartDivs.length; subIdx++) {
              const subTextInput = subPartDivs[subIdx].querySelector(`input[name="q${idx}_part${partIdx}_sub${subIdx}_text"]`);
              const subText = subTextInput?.value || '';
              
              const subImageInput = subPartDivs[subIdx].querySelector(`input[name="q${idx}_part${partIdx}_sub${subIdx}_image"]`);
              const subImage = subImageInput?.value || null;
              
              subParts.push({ 
                text: subText, 
                image: subImage && subImage !== 'null' ? subImage : null 
              });
            }
          }
          
          parts.push({
            id: `part_${Date.now()}_${partIdx}`,
            partText,
            image: partImage && partImage !== 'null' ? partImage : null,
            subParts
          });
        });
      }
      
      questions.push({ type: 'frq', mainText, parts });
    }
  });
  
  return questions;
};


  // init
  init();
})();

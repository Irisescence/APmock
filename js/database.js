class ExamDatabase {
  constructor() {
    this.db = null;
    this.userId = null;
    this.client = null;
  }

  getClient() {
    if (!window.apAuth || !window.apAuth.supabaseClient) {
      throw new Error('Supabase auth is not initialized. Make sure auth.js loads before database.js.');
    }
    this.client = window.apAuth.supabaseClient;
    return this.client;
  }

  async open() {
    const session = await window.apAuth.getSession();
    if (!session || !session.user) {
      throw new Error('Please log in before loading exams.');
    }
    this.userId = session.user.id;
    this.db = true;
    this.getClient();
    return true;
  }

  initUser() {
    return this.userId;
  }

  mapExamRow(row, questions = []) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      timeLimit: row.time_limit,
      examType: row.exam_type || 'mcq',
      isPublic: !!row.is_public,
      userId: row.created_by,
      createdBy: row.created_by,
      createdAt: row.created_at,
      questions
    };
  }

  mapQuestionRow(row) {
    return {
      id: row.id,
      type: row.type || 'mcq',
      text: row.text || '',
      options: Array.isArray(row.options) ? row.options : [],
      correct: Number.isInteger(row.correct) ? row.correct : 0,
      image: row.image_url || null,
      imageUrl: row.image_url || null
    };
  }

  extractYear(exam) {
    const match = String(exam.description || '').match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : null;
  }

  sortExams(exams) {
    return exams.sort((a, b) => {
      const yearA = this.extractYear(a);
      const yearB = this.extractYear(b);
      if (yearA !== null && yearB !== null && yearA !== yearB) return yearB - yearA;
      if (yearA !== null && yearB === null) return -1;
      if (yearA === null && yearB !== null) return 1;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }

  async getUserExams() {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { data: examRows, error } = await client
      .from('exams')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const rows = examRows || [];
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const { data: questionRows, error: questionError } = await client
      .from('questions')
      .select('*')
      .in('exam_id', ids)
      .order('question_order', { ascending: true });

    if (questionError) throw questionError;

    const questionsByExam = new Map();
    (questionRows || []).forEach((row) => {
      if (!questionsByExam.has(row.exam_id)) questionsByExam.set(row.exam_id, []);
      questionsByExam.get(row.exam_id).push(this.mapQuestionRow(row));
    });

    return this.sortExams(rows.map((row) => this.mapExamRow(row, questionsByExam.get(row.id) || [])));
  }

  async getExamById(id) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { data: examRow, error } = await client
      .from('exams')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!examRow) return null;

    const { data: questionRows, error: questionError } = await client
      .from('questions')
      .select('*')
      .eq('exam_id', id)
      .order('question_order', { ascending: true });

    if (questionError) throw questionError;
    return this.mapExamRow(examRow, (questionRows || []).map((row) => this.mapQuestionRow(row)));
  }

  isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  normalizeQuestion(question, index, examId) {
    const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
    while (options.length < 4) options.push('');
    return {
      exam_id: examId,
      type: 'mcq',
      text: question.text || '',
      options,
      correct: Number.isInteger(question.correct) ? question.correct : parseInt(question.correct || '0', 10) || 0,
      image_url: question.image || question.imageUrl || null,
      question_order: index
    };
  }

  async saveExam(examData) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    if ((examData.examType || 'mcq') !== 'mcq') {
      throw new Error('Cloud mode currently supports MCQ exams only. FRQ is reserved for a future update.');
    }
    if (!examData.subject || !examData.title || !examData.description) {
      throw new Error('Subject, title, and description are required.');
    }
    if (!Array.isArray(examData.questions) || examData.questions.length === 0) {
      throw new Error('Please add at least one question.');
    }

    const examPayload = {
      title: examData.title,
      description: examData.description,
      subject: examData.subject,
      time_limit: Number(examData.timeLimit) || 45,
      exam_type: 'mcq',
      is_public: !!examData.isPublic,
      created_by: this.userId
    };

    let examId = examData.id;
    if (this.isUuid(examId)) {
      const { error } = await client
        .from('exams')
        .update(examPayload)
        .eq('id', examId);
      if (error) throw error;

      const { error: deleteError } = await client
        .from('questions')
        .delete()
        .eq('exam_id', examId);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await client
        .from('exams')
        .insert(examPayload)
        .select('id')
        .single();
      if (error) throw error;
      examId = data.id;
    }

    const questionPayloads = examData.questions.map((question, index) => this.normalizeQuestion(question, index, examId));
    const { error: questionError } = await client
      .from('questions')
      .insert(questionPayloads);
    if (questionError) throw questionError;

    return examId;
  }

  async deleteExam(id) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { error } = await client
      .from('exams')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  mapAttemptRow(row) {
    return {
      id: row.id,
      userId: row.user_id,
      examId: row.exam_id,
      score: row.score,
      total: row.total,
      answers: Array.isArray(row.answers) ? row.answers : [],
      completedAt: row.completed_at
    };
  }

  async saveExamHistory(historyData) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { data, error } = await client
      .from('attempts')
      .insert({
        user_id: this.userId,
        exam_id: historyData.examId,
        score: Number(historyData.score) || 0,
        total: Number(historyData.total) || 0,
        answers: historyData.answers || [],
        completed_at: historyData.completedAt || new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async getUserHistory() {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { data, error } = await client
      .from('attempts')
      .select('*')
      .eq('user_id', this.userId)
      .order('completed_at', { ascending: false });

    if (error) throw error;
    return (data || []).map((row) => this.mapAttemptRow(row));
  }

  async getLatestHistory(examId) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    const { data, error } = await client
      .from('attempts')
      .select('*')
      .eq('user_id', this.userId)
      .eq('exam_id', examId)
      .order('completed_at', { ascending: false })
      .limit(1);

    if (error) throw error;
    return data && data[0] ? this.mapAttemptRow(data[0]) : null;
  }

  async getExamHistory(examId = null) {
    const client = this.getClient();
    if (!this.userId) await this.open();

    let query = client
      .from('attempts')
      .select('*')
      .eq('user_id', this.userId)
      .order('completed_at', { ascending: false });

    if (examId) query = query.eq('exam_id', examId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row) => this.mapAttemptRow(row));
  }

  async getAllLatestHistory() {
    const history = await this.getUserHistory();
    const result = {};
    history.forEach((record) => {
      if (!result[record.examId]) result[record.examId] = record;
    });
    return result;
  }

  async exportAllData() {
    const exams = await this.getUserExams();
    const history = await this.getUserHistory();
    return JSON.stringify({ exportDate: new Date().toISOString(), exams, history }, null, 2);
  }

  async importData(jsonString) {
    const data = JSON.parse(jsonString);
    let importedCount = 0;
    for (const exam of data.exams || []) {
      await this.saveExam({ ...exam, id: null, examType: 'mcq' });
      importedCount += 1;
    }
    return importedCount;
  }

  async getStats() {
    const exams = await this.getUserExams();
    const history = await this.getUserHistory();
    return { examCount: exams.length, historyCount: history.length, totalSize: 'Cloud' };
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

const examDB = new ExamDatabase();
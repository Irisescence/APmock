/**
 * AP 模拟考试 - 数据库管理模块 v2.0
 * 支持多用户、互联网部署
 * 使用 IndexedDB + 用户标识
 */

class ExamDatabase {
  constructor() {
    this.dbName = 'APExamDB';
    this.dbVersion = 2;
    this.db = null;
    this.userId = null;
    this.isCloudMode = false;
  }

  /**
   * 初始化用户标识
   */
  initUser() {
    this.userId = localStorage.getItem('ap_exam_user_id');
    if (!this.userId) {
      this.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('ap_exam_user_id', this.userId);
      console.log('👤 新用户创建:', this.userId);
    }
    
    const hostname = window.location.hostname;
    this.isCloudMode = hostname !== 'localhost' && hostname !== '127.0.0.1';
    
    if (this.isCloudMode) {
      console.log('🌐 云端模式已激活');
    } else {
      console.log('💻 本地开发模式');
    }
    
    return this.userId;
  }

  /**
   * 打开数据库连接
   */
  async open() {
    // 确保用户已初始化
    if (!this.userId) {
      this.initUser();
    }
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        console.log('📦 创建/升级数据库到版本', this.dbVersion);

        // 创建试卷存储表
        if (!db.objectStoreNames.contains('exams')) {
          const examStore = db.createObjectStore('exams', { keyPath: 'id' });
          examStore.createIndex('userId', 'userId', { unique: false });
          examStore.createIndex('subject', 'subject', { unique: false });
          examStore.createIndex('examType', 'examType', { unique: false });
          examStore.createIndex('isPublic', 'isPublic', { unique: false });
          examStore.createIndex('createdAt', 'createdAt', { unique: false });
          console.log('✅ 创建 exams 表');
        } else {
          // 如果表已存在，检查是否需要添加索引
          const transaction = event.target.transaction;
          const store = transaction.objectStore('exams');
          
          if (!store.indexNames.contains('userId')) {
            store.createIndex('userId', 'userId', { unique: false });
          }
          if (!store.indexNames.contains('isPublic')) {
            store.createIndex('isPublic', 'isPublic', { unique: false });
          }
        }

        // 创建用户答题记录表
        if (!db.objectStoreNames.contains('examHistory')) {
          const historyStore = db.createObjectStore('examHistory', { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          historyStore.createIndex('userId', 'userId', { unique: false });
          historyStore.createIndex('examId', 'examId', { unique: false });
          historyStore.createIndex('completedAt', 'completedAt', { unique: false });
          console.log('✅ 创建 examHistory 表');
        }

        // 创建共享试卷表
        if (!db.objectStoreNames.contains('sharedExams')) {
          const sharedStore = db.createObjectStore('sharedExams', { keyPath: 'shareCode' });
          sharedStore.createIndex('examId', 'examId', { unique: false });
          sharedStore.createIndex('creatorId', 'creatorId', { unique: false });
          console.log('✅ 创建 sharedExams 表');
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('🎉 数据库连接成功 (v' + this.dbVersion + ')');
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('❌ 数据库连接失败:', event.target.error);
        reject(event.target.error);
      };

      request.onblocked = (event) => {
        console.warn('⚠️ 数据库被阻塞，请关闭其他标签页');
        reject(new Error('数据库被阻塞'));
      };
    });
  }

  /**
   * 获取当前用户的试卷（包括公开试卷）
   */
  async getUserExams() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['exams'], 'readonly');
      const store = transaction.objectStore('exams');
      const request = store.getAll();

      request.onsuccess = () => {
        let allExams = request.result;
        console.log('📚 数据库中总共有', allExams.length, '套试卷');
        
        // 筛选：当前用户的试卷 + 公开试卷
        let exams = allExams.filter(exam => 
          exam.userId === this.userId || exam.isPublic === true
        );
        
        // 按创建时间排序（最新的在前）
        exams.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        
        console.log('📚 当前用户可见', exams.length, '套试卷');
        resolve(exams);
      };

      request.onerror = () => {
        console.error('❌ 加载试卷失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 根据ID获取一套试卷
   */
  async getExamById(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['exams'], 'readonly');
      const store = transaction.objectStore('exams');
      const request = store.get(id);

      request.onsuccess = () => {
        const exam = request.result;
        console.log('🔍 查询试卷:', id, exam ? '✅找到' : '❌未找到');
        if (exam) {
          console.log('📄 试卷标题:', exam.title);
        }
        resolve(exam || null);
      };

      request.onerror = () => {
        console.error('❌ 查询试卷失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 保存或更新试卷
   */
  async saveExam(examData) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['exams'], 'readwrite');
      const store = transaction.objectStore('exams');

      // 添加用户标识和时间戳
      const exam = {
        ...examData,
        userId: this.userId,
        isPublic: examData.isPublic !== undefined ? examData.isPublic : false,
        createdAt: examData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: (examData.version || 0) + 1
      };

      console.log('💾 保存试卷:', exam.title, 'ID:', exam.id);
      
      const request = store.put(exam);

      request.onsuccess = () => {
        console.log('✅ 试卷保存成功:', exam.title);
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('❌ 试卷保存失败:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除试卷（只有创建者可以删除）
   */
  async deleteExam(id) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['exams'], 'readwrite');
      const store = transaction.objectStore('exams');
      
      // 先检查权限
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const exam = getRequest.result;
        if (!exam) {
          console.warn('⚠️ 试卷不存在:', id);
          resolve(); // 不存在也算删除成功
          return;
        }
        
        // 只有创建者可以删除
        if (exam.userId && exam.userId !== this.userId) {
          reject(new Error('无权删除他人创建的试卷'));
          return;
        }
        
        const deleteRequest = store.delete(id);
        deleteRequest.onsuccess = () => {
          console.log('🗑️ 试卷删除成功:', id);
          resolve();
        };
        deleteRequest.onerror = () => {
          reject(deleteRequest.error);
        };
      };
      
      getRequest.onerror = () => {
        reject(getRequest.error);
      };
    });
  }

  /**
   * 保存答题记录
   */
  async saveExamHistory(historyData) {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['examHistory'], 'readwrite');
      const store = transaction.objectStore('examHistory');
      
      const record = {
        ...historyData,
        userId: this.userId,
        completedAt: new Date().toISOString()
      };
      
      const request = store.add(record);
      
      request.onsuccess = () => {
        console.log('📝 答题记录保存成功');
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 获取用户的答题历史
   */
  async getUserHistory() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('数据库未连接'));
        return;
      }
      
      const transaction = this.db.transaction(['examHistory'], 'readonly');
      const store = transaction.objectStore('examHistory');
      const index = store.index('userId');
      const request = index.getAll(this.userId);

      request.onsuccess = () => {
        const history = request.result;
        history.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        resolve(history);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

/**
 * 获取某套试卷的最近一次考试记录
 */
async getLatestHistory(examId) {
  return new Promise((resolve, reject) => {
    if (!this.db) {
      reject(new Error('数据库未连接'));
      return;
    }
    
    const transaction = this.db.transaction(['examHistory'], 'readonly');
    const store = transaction.objectStore('examHistory');
    const index = store.index('examId');
    const request = index.getAll(examId);

    request.onsuccess = () => {
      const records = request.result;
      // 筛选当前用户的记录
      const userRecords = records.filter(r => r.userId === this.userId);
      // 按时间排序，取最新的
      userRecords.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
      resolve(userRecords[0] || null);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取指定试卷的答题历史
 */
async getExamHistory(examId = null) {
  return new Promise((resolve, reject) => {
    if (!this.db) {
      reject(new Error('数据库未连接'));
      return;
    }
    
    const transaction = this.db.transaction(['examHistory'], 'readonly');
    const store = transaction.objectStore('examHistory');
    
    let request;
    if (examId) {
      const index = store.index('examId');
      request = index.getAll(examId);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      resolve(request.result || []);
    };
    
    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * 获取所有试卷的最新考试记录
 */
async getAllLatestHistory() {
  const exams = await this.getUserExams();
  const result = {};
  
  for (const exam of exams) {
    const latest = await this.getLatestHistory(exam.id);
    if (latest) {
      result[exam.id] = latest;
    }
  }
  
  return result;
}

  /**
   * 导出所有数据（仅当前用户）
   */
  async exportAllData() {
    const exams = await this.getUserExams();
    const history = await this.getUserHistory();
    
    return JSON.stringify({
      userId: this.userId,
      exportDate: new Date().toISOString(),
      examCount: exams.length,
      exams: exams,
      history: history
    }, null, 2);
  }

  /**
   * 导入数据
   */
  async importData(jsonString) {
    const data = JSON.parse(jsonString);
    let importedCount = 0;
    
    if (data.exams && Array.isArray(data.exams)) {
      for (const exam of data.exams) {
        // 重新分配用户ID和ID
        const newExam = {
          ...exam,
          id: exam.id || `exam_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          userId: this.userId,
          isPublic: exam.isPublic || false,
          createdAt: exam.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await this.saveExam(newExam);
        importedCount++;
      }
    }
    
    if (data.history && Array.isArray(data.history)) {
      for (const record of data.history) {
        record.userId = this.userId;
        await this.saveExamHistory(record);
      }
    }
    
    console.log(`📥 导入完成: ${importedCount} 套试卷`);
    return importedCount;
  }

  /**
   * 获取数据库统计信息
   */
  async getStats() {
    const exams = await this.getUserExams();
    const history = await this.getUserHistory();
    
    const examsJson = JSON.stringify(exams);
    const historyJson = JSON.stringify(history);
    const totalSize = new Blob([examsJson, historyJson]).size;
    
    return {
      examCount: exams.length,
      historyCount: history.length,
      totalSize: this.formatSize(totalSize)
    };
  }

  /**
   * 格式化文件大小
   */
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

// 创建全局数据库实例
const examDB = new ExamDatabase();

// 初始化用户
examDB.initUser();
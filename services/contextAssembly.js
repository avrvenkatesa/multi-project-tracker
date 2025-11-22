const { pool } = require('../db');

class ContextAssemblyService {
  constructor() {
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'we', 'you', 'i', 'me', 'my', 'our',
      'this', 'these', 'those', 'am', 'been', 'being', 'have', 'had',
      'do', 'does', 'did', 'but', 'if', 'or', 'because', 'as', 'until',
      'while', 'about', 'can', 'could', 'should', 'would', 'just', 'what',
      'which', 'who', 'when', 'where', 'how', 'all', 'each', 'there'
    ]);
  }

  async assembleContext({ projectId, message, source = 'unknown', userId }) {
    const startTime = Date.now();

    try {
      const keywords = this.extractKeywords(message);

      const [
        projectMetadata,
        pkgEntities,
        ragDocuments,
        recentConversation,
        userContext
      ] = await Promise.all([
        this.getProjectMetadata(projectId).catch(err => {
          console.warn('Failed to fetch project metadata:', err.message);
          return null;
        }),
        this.queryPKG(projectId, message, keywords).catch(err => {
          console.warn('Failed to query PKG:', err.message);
          return [];
        }),
        this.searchRAG(projectId, message, keywords).catch(err => {
          console.warn('Failed to search RAG:', err.message);
          return [];
        }),
        this.getRecentConversation(source, projectId).catch(err => {
          console.warn('Failed to fetch recent conversation:', err.message);
          return [];
        }),
        userId ? this.getUserContext(userId, projectId).catch(err => {
          console.warn('Failed to fetch user context:', err.message);
          return null;
        }) : Promise.resolve(null)
      ]);

      const context = {
        projectMetadata,
        pkgEntities,
        ragDocuments,
        recentConversation,
        userContext,
        keywords,
        source,
        assemblyTime: Date.now() - startTime
      };

      context.qualityScore = this.calculateContextQuality(context);

      return context;
    } catch (error) {
      console.error('Context assembly failed:', error);
      throw new Error(`Failed to assemble context: ${error.message}`);
    }
  }

  async getProjectMetadata(projectId) {
    const result = await pool.query(
      `SELECT 
        id, 
        name, 
        description,
        created_at
      FROM projects 
      WHERE id = $1`,
      [projectId]
    );

    return result.rows[0] || null;
  }

  async queryPKG(projectId, message, keywords = []) {
    if (!keywords || keywords.length === 0) {
      keywords = this.extractKeywords(message);
    }

    const searchPattern = keywords.join(' | ');

    const result = await pool.query(
      `SELECT 
        id,
        type,
        source_id,
        attrs,
        created_at,
        ts_rank(
          to_tsvector('english', COALESCE((attrs->>'title')::text, '') || ' ' || COALESCE((attrs->>'description')::text, '')),
          to_tsquery('english', $2)
        ) as relevance_score
      FROM pkg_nodes
      WHERE project_id = $1
        AND superseded_by IS NULL
        AND to_tsvector('english', COALESCE((attrs->>'title')::text, '') || ' ' || COALESCE((attrs->>'description')::text, '')) @@ to_tsquery('english', $2)
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT 10`,
      [projectId, searchPattern]
    );

    return result.rows.map(row => ({
      id: row.id,
      type: row.type,
      entityId: row.source_id,
      title: row.attrs?.title || '',
      description: row.attrs?.description || '',
      metadata: row.attrs,
      relevanceScore: parseFloat(row.relevance_score) || 0,
      createdAt: row.created_at
    }));
  }

  async searchRAG(projectId, message, keywords = []) {
    if (!keywords || keywords.length === 0) {
      keywords = this.extractKeywords(message);
    }

    const searchPattern = keywords.join(' | ');

    const result = await pool.query(
      `SELECT 
        id,
        source_type,
        title,
        content,
        meta,
        created_at,
        ts_rank(
          to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')),
          to_tsquery('english', $2)
        ) as relevance_score
      FROM rag_documents
      WHERE project_id = $1
        AND to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(content, '')) @@ to_tsquery('english', $2)
      ORDER BY relevance_score DESC, created_at DESC
      LIMIT 5`,
      [projectId, searchPattern]
    );

    return result.rows.map(row => ({
      id: row.id,
      type: row.source_type,
      title: row.title,
      content: row.content,
      sourceUrl: row.meta?.url || '',
      metadata: row.meta,
      relevanceScore: parseFloat(row.relevance_score) || 0,
      createdAt: row.created_at
    }));
  }

  async getRecentConversation(source, projectId, limit = 10) {
    const result = await pool.query(
      `SELECT 
        id,
        evidence_type,
        quote_text,
        source_type,
        created_by,
        created_date
      FROM evidence
      WHERE source_type = $1
      ORDER BY created_date DESC
      LIMIT $2`,
      [source, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      type: row.evidence_type,
      content: row.quote_text || '',
      sourceType: row.source_type,
      createdBy: row.created_by,
      createdAt: row.created_date
    }));
  }

  async getUserContext(userId, projectId) {
    const result = await pool.query(
      `SELECT 
        u.id,
        u.email,
        u.username,
        ura.role_id,
        cr.role_name,
        cr.role_code,
        cr.authority_level,
        cr.role_category
      FROM users u
      LEFT JOIN user_role_assignments ura ON u.id = ura.user_id AND ura.project_id = $2
      LEFT JOIN custom_roles cr ON ura.role_id = cr.id
      WHERE u.id = $1
      LIMIT 1`,
      [userId, projectId]
    );

    const user = result.rows[0];
    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role_id ? {
        id: user.role_id,
        name: user.role_name,
        code: user.role_code,
        authorityLevel: user.authority_level,
        category: user.role_category
      } : null
    };
  }

  extractKeywords(message) {
    if (!message || typeof message !== 'string') {
      return [];
    }

    const words = message
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && 
        !this.stopWords.has(word) &&
        !/^\d+$/.test(word)
      );

    const uniqueWords = [...new Set(words)];
    
    return uniqueWords.slice(0, 10);
  }

  calculateContextQuality(context) {
    let score = 0;
    let maxScore = 0;

    if (context.projectMetadata) {
      score += 20;
    }
    maxScore += 20;

    if (context.pkgEntities && context.pkgEntities.length > 0) {
      score += Math.min(30, context.pkgEntities.length * 5);
    }
    maxScore += 30;

    if (context.ragDocuments && context.ragDocuments.length > 0) {
      score += Math.min(25, context.ragDocuments.length * 5);
    }
    maxScore += 25;

    if (context.recentConversation && context.recentConversation.length > 0) {
      score += Math.min(15, context.recentConversation.length * 3);
    }
    maxScore += 15;

    if (context.userContext) {
      score += 10;
    }
    maxScore += 10;

    return maxScore > 0 ? parseFloat((score / maxScore).toFixed(2)) : 0;
  }

  async getContextSummary(context) {
    const summary = {
      hasProjectMetadata: !!context.projectMetadata,
      pkgEntityCount: context.pkgEntities?.length || 0,
      ragDocumentCount: context.ragDocuments?.length || 0,
      conversationMessageCount: context.recentConversation?.length || 0,
      hasUserContext: !!context.userContext,
      qualityScore: context.qualityScore || 0,
      assemblyTime: context.assemblyTime || 0,
      keywords: context.keywords || []
    };

    return summary;
  }
}

module.exports = new ContextAssemblyService();

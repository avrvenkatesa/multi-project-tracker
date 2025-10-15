/**
 * Validation Service - AI-Assisted Checklist Validation
 */

/**
 * Validate checklist completeness and quality
 */
async function validateChecklist(checklistData) {
  const errors = [];
  const warnings = [];
  const recommendations = [];
  
  // 1. Required Fields Validation
  const requiredValidation = validateRequiredFields(checklistData);
  errors.push(...requiredValidation.errors);
  warnings.push(...requiredValidation.warnings);
  
  // 2. Consistency Validation
  const consistencyValidation = validateConsistency(checklistData);
  errors.push(...consistencyValidation.errors);
  warnings.push(...consistencyValidation.warnings);
  
  // 3. Quality Checks
  const qualityValidation = validateQuality(checklistData);
  warnings.push(...qualityValidation.warnings);
  recommendations.push(...qualityValidation.recommendations);
  
  // 4. Calculate Quality Score
  const qualityScore = calculateQualityScore(checklistData, errors, warnings);
  
  // 5. Determine if valid
  const isValid = errors.length === 0 && qualityScore.total >= 60;
  
  return {
    is_valid: isValid,
    quality_score: qualityScore.total,
    completeness_score: qualityScore.completeness,
    consistency_score: qualityScore.consistency,
    quality_rating: qualityScore.quality,
    error_count: errors.length,
    warning_count: warnings.length,
    errors: errors,
    warnings: warnings,
    recommendations: recommendations
  };
}

/**
 * Validate required fields are completed
 */
function validateRequiredFields(checklistData) {
  const errors = [];
  const warnings = [];
  
  const requiredItems = checklistData.items.filter(item => item.is_required);
  const missingRequired = requiredItems.filter(item => !item.is_completed);
  
  if (missingRequired.length > 0) {
    missingRequired.forEach(item => {
      errors.push({
        type: 'required_field',
        severity: 'error',
        section: item.section_title,
        item: item.item_text,
        item_id: item.id,
        message: 'Required field not completed',
        suggestion: 'Please provide a response for this required item'
      });
    });
  }
  
  // Warn about optional fields
  const optionalItems = checklistData.items.filter(item => !item.is_required);
  const missingOptional = optionalItems.filter(item => !item.is_completed);
  
  if (missingOptional.length > optionalItems.length * 0.3 && optionalItems.length > 0) {
    warnings.push({
      type: 'optional_incomplete',
      severity: 'warning',
      section: 'General',
      message: `${missingOptional.length} optional items not completed`,
      suggestion: 'Consider completing more optional items for thoroughness'
    });
  }
  
  return { errors, warnings };
}

/**
 * Validate consistency across responses
 */
function validateConsistency(checklistData) {
  const errors = [];
  const warnings = [];
  
  // 1. Date consistency checks
  const dateItems = checklistData.items.filter(item => item.field_type === 'date' && item.response_date);
  
  dateItems.forEach(item => {
    try {
      const date = new Date(item.response_date);
      const now = new Date();
      
      // Dates in far future (>5 years)
      if (date > new Date(now.getFullYear() + 5, now.getMonth(), now.getDate())) {
        warnings.push({
          type: 'date_future',
          severity: 'warning',
          section: item.section_title,
          item: item.item_text,
          item_id: item.id,
          message: 'Date is more than 5 years in the future',
          suggestion: 'Verify this date is correct'
        });
      }
      
      // Dates in far past (>10 years ago)
      if (date < new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())) {
        warnings.push({
          type: 'date_past',
          severity: 'warning',
          section: item.section_title,
          item: item.item_text,
          item_id: item.id,
          message: 'Date is more than 10 years in the past',
          suggestion: 'Verify this date is correct'
        });
      }
      
      // Invalid dates
      if (isNaN(date.getTime())) {
        errors.push({
          type: 'invalid_date',
          severity: 'error',
          section: item.section_title,
          item: item.item_text,
          item_id: item.id,
          message: 'Invalid date format',
          suggestion: 'Enter a valid date in YYYY-MM-DD format'
        });
      }
    } catch (e) {
      errors.push({
        type: 'invalid_date',
        severity: 'error',
        section: item.section_title,
        item: item.item_text,
        item_id: item.id,
        message: 'Date could not be parsed',
        suggestion: 'Enter a valid date'
      });
    }
  });
  
  // 2. Text field length checks
  const textItems = checklistData.items.filter(item => 
    (item.field_type === 'text' || item.field_type === 'textarea') && 
    item.response_value
  );
  
  textItems.forEach(item => {
    const length = item.response_value.length;
    
    // Too short responses (likely incomplete)
    if (item.field_type === 'textarea' && length < 10) {
      warnings.push({
        type: 'response_too_short',
        severity: 'warning',
        section: item.section_title,
        item: item.item_text,
        item_id: item.id,
        message: 'Response seems too brief',
        suggestion: 'Consider providing more detail'
      });
    }
    
    // Suspiciously long responses
    if (length > 5000) {
      warnings.push({
        type: 'response_too_long',
        severity: 'warning',
        section: item.section_title,
        item: item.item_text,
        item_id: item.id,
        message: 'Response is very long',
        suggestion: 'Consider summarizing or breaking into sections'
      });
    }
    
    // Placeholder text detection
    const placeholders = ['todo', 'tbd', 'pending', 'n/a', 'none', 'test', 'xxx'];
    const lowerResponse = item.response_value.toLowerCase().trim();
    
    if (placeholders.includes(lowerResponse)) {
      warnings.push({
        type: 'placeholder_text',
        severity: 'warning',
        section: item.section_title,
        item: item.item_text,
        item_id: item.id,
        message: 'Response appears to be placeholder text',
        suggestion: 'Replace with actual information'
      });
    }
  });
  
  // 3. Section completion consistency
  const sections = {};
  checklistData.items.forEach(item => {
    if (!sections[item.section_title]) {
      sections[item.section_title] = { total: 0, completed: 0 };
    }
    sections[item.section_title].total++;
    if (item.is_completed) {
      sections[item.section_title].completed++;
    }
  });
  
  Object.entries(sections).forEach(([sectionTitle, stats]) => {
    const completionRate = stats.completed / stats.total;
    
    // Section barely started
    if (completionRate > 0 && completionRate < 0.25) {
      warnings.push({
        type: 'section_incomplete',
        severity: 'warning',
        section: sectionTitle,
        message: `Section only ${Math.round(completionRate * 100)}% complete`,
        suggestion: 'Complete more items in this section before submitting'
      });
    }
  });
  
  return { errors, warnings };
}

/**
 * Quality checks and recommendations
 */
function validateQuality(checklistData) {
  const warnings = [];
  const recommendations = [];
  
  // 1. Check for items with comments
  const itemsWithComments = checklistData.items.filter(item => 
    item.comments && item.comments.length > 0
  );
  
  if (itemsWithComments.length === 0 && checklistData.items.length > 20) {
    recommendations.push('Consider adding comments to clarify responses or provide context');
  }
  
  // 2. Check completion time
  const createdAt = new Date(checklistData.created_at);
  const now = new Date();
  const hoursSinceCreation = (now - createdAt) / (1000 * 60 * 60);
  
  if (hoursSinceCreation < 0.5 && checklistData.items.length > 50) {
    warnings.push({
      type: 'completed_too_quickly',
      severity: 'warning',
      section: 'General',
      message: 'Checklist completed in less than 30 minutes',
      suggestion: 'Verify all responses are accurate and thorough'
    });
  }
  
  // 3. Check for AI-generated checklist quality
  if (checklistData.is_ai_generated) {
    const aiRecommendations = validateAIGeneratedChecklist(checklistData);
    recommendations.push(...aiRecommendations);
  }
  
  // 4. Overall completion recommendations
  const completionRate = (checklistData.completed_items / checklistData.total_items) * 100;
  
  if (completionRate < 50) {
    recommendations.push('Complete at least 50% of items before requesting approval');
  } else if (completionRate < 80) {
    recommendations.push('Aim for 80%+ completion for best quality assurance');
  } else if (completionRate === 100) {
    recommendations.push('Excellent! All items completed. Ready for review.');
  }
  
  return { warnings, recommendations };
}

/**
 * Validate AI-generated checklists
 */
function validateAIGeneratedChecklist(checklistData) {
  const recommendations = [];
  
  // Check if responses align with AI-generated structure
  recommendations.push('This checklist was AI-generated. Verify all items are relevant to your use case.');
  
  // Check if using attachment-based generation
  if (checklistData.generation_source && checklistData.used_attachments > 0) {
    recommendations.push('Review items generated from attachments for accuracy.');
  }
  
  return recommendations;
}

/**
 * Calculate quality score (0-100)
 */
function calculateQualityScore(checklistData, errors, warnings) {
  const totalItems = checklistData.total_items;
  const completedItems = checklistData.completed_items;
  const requiredItems = checklistData.items.filter(item => item.is_required).length;
  const completedRequired = checklistData.items.filter(item => 
    item.is_required && item.is_completed
  ).length;
  
  // 1. Completeness Score (50% weight)
  // Based on required items completion
  let completenessScore = 0;
  if (requiredItems > 0) {
    completenessScore = (completedRequired / requiredItems) * 100;
  } else {
    // If no required items, use overall completion
    completenessScore = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
  }
  
  // 2. Consistency Score (30% weight)
  // Based on errors and warnings
  let consistencyScore = 100;
  consistencyScore -= (errors.length * 10); // Each error: -10 points
  consistencyScore -= (warnings.length * 3); // Each warning: -3 points
  consistencyScore = Math.max(0, consistencyScore);
  
  // 3. Quality Rating (20% weight)
  // Based on detail and thoroughness
  let qualityRating = 50; // Base score
  
  // Bonus for comments
  const itemsWithComments = checklistData.items.filter(item => 
    item.comments && item.comments.length > 0
  ).length;
  qualityRating += Math.min(20, itemsWithComments * 2);
  
  // Bonus for detailed responses (textarea fields)
  const detailedResponses = checklistData.items.filter(item => 
    item.field_type === 'textarea' && 
    item.response_value && 
    item.response_value.length > 50
  ).length;
  qualityRating += Math.min(15, detailedResponses * 3);
  
  // Penalty for placeholder text
  const placeholderCount = warnings.filter(w => w.type === 'placeholder_text').length;
  qualityRating -= (placeholderCount * 5);
  
  qualityRating = Math.max(0, Math.min(100, qualityRating));
  
  // 4. Calculate total score (weighted average)
  const totalScore = Math.round(
    (completenessScore * 0.5) +
    (consistencyScore * 0.3) +
    (qualityRating * 0.2)
  );
  
  return {
    total: Math.max(0, Math.min(100, totalScore)),
    completeness: Math.round(completenessScore),
    consistency: Math.round(consistencyScore),
    quality: Math.round(qualityRating)
  };
}

/**
 * Get validation status text
 */
function getValidationStatus(score, errorCount) {
  if (errorCount > 0) return 'failed';
  if (score >= 80) return 'passed';
  if (score >= 60) return 'warnings';
  return 'failed';
}

module.exports = {
  validateChecklist,
  getValidationStatus
};

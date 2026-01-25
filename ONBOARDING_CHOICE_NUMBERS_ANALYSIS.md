# Numbers Displayed on `/onboarding-choice` Page - Reliability Analysis

## Numbers Shown on the Page

### 1. **Total Size (GB/MB)** ✅ **HIGHLY RELIABLE**
- **Display**: "You have 4.8GB of chat history"
- **Source**: `metrics.total_size_mb` → `data.metrics.size_mb`
- **Backend Calculation**: 
  - `estimate_db_metrics()` → `combined_size = size_mb + claude_code_size_mb`
  - `size_mb` = Direct file system stat: `db_path.stat().st_size / (1024 * 1024)`
  - `claude_code_size_mb` = Sum of file sizes from Claude Code JSONL files
- **Reliability**: ✅ **VERY HIGH**
  - Direct file system operation
  - No sampling or estimation needed
  - Accurate to the byte

### 2. **Total Months** ⚠️ **MEDIUM RELIABILITY**
- **Display**: "That's about 6 months of conversations"
- **Source**: `metrics.total_months` → `data.metrics.actual_months` OR fallback `size_mb / 400`
- **Backend Calculation**:
  - **Primary**: `actual_months` = Calculated from `date_range` (start/end dates)
  - **Date Range**: Extracted from random sample of 200 messages
  - **Fallback**: `size_mb / 400` (heuristic: assumes 400MB per month)
- **Reliability**: ⚠️ **MEDIUM**
  - **Issue**: Depends on extracting timestamps from random sample
  - **Problem**: Only samples 200 random messages (`ORDER BY RANDOM() LIMIT 200`)
  - **Risk**: If timestamp extraction fails for many messages, `days_span` could be wrong
  - **Risk**: Random sample might not represent full date range accurately
  - **Fallback**: Uses heuristic if date range unavailable (less accurate)

### 3. **Recent 500MB Coverage (Days/Months)** ⚠️ **MEDIUM RELIABILITY**
- **Display**: "Covers approx. last ~19 days" or "~0.6 months"
- **Source**: `metrics.recent_500mb.estimated_days` → `data.metrics.recent_500mb.estimated_days`
- **Backend Calculation**:
  - Proportional: `(500 / combined_size) * days_span`
  - **Depends on**: `days_span` from timestamp sample (same as #2)
- **Reliability**: ⚠️ **MEDIUM**
  - **Issue**: Inherits reliability issues from `days_span` calculation
  - **Problem**: If `days_span` is wrong (due to timestamp extraction issues), this will be wrong too
  - **Assumption**: Assumes relatively even distribution of chat activity over time
  - **Risk**: If chat activity is uneven (e.g., heavy usage recently, light usage earlier), the estimate could be off

### 4. **"Ready in ~90 seconds"** ❌ **NOT RELIABLE (Hardcoded)**
- **Display**: "Ready in ~90 seconds"
- **Source**: Hardcoded string (line 149)
- **Reliability**: ❌ **LOW**
  - This is a marketing estimate, not calculated
  - Actual time depends on:
    - Number of conversations in 500MB
    - LLM API response time
    - Network latency
    - User's hardware

### 5. **"15 min + indexing"** ❌ **NOT RELIABLE (Hardcoded)**
- **Display**: "15 min + indexing"
- **Source**: Hardcoded string (line 191)
- **Reliability**: ❌ **LOW**
  - This is a marketing estimate, not calculated
  - Actual time depends on:
    - Total size of chat history
    - Number of messages to index
    - Vector DB indexing speed
    - Network latency

## Summary: Reliability Issues

### ⚠️ **Numbers That Are Hard to Get Reliably:**

1. **Total Months** ⚠️
   - **Why**: Depends on extracting timestamps from random sample of 200 messages
   - **Issues**:
     - Timestamp extraction might fail for some messages
     - Random sample might not represent full date range
     - If sample is too small or unrepresentative, calculation is wrong
   - **Current Fallback**: Uses `size_mb / 400` heuristic if date range unavailable

2. **Recent 500MB Coverage** ⚠️
   - **Why**: Depends on `days_span` from timestamp sample (same issues as #1)
   - **Additional Issues**:
     - Assumes even distribution of chat activity over time
     - If activity is uneven, estimate could be significantly off
   - **Current Method**: Proportional calculation (mathematically correct IF `days_span` is accurate)

### ✅ **Numbers That Are Reliable:**

1. **Total Size (GB/MB)** ✅
   - Direct file system stat
   - Very accurate

### ❌ **Numbers That Are Not Calculated (Hardcoded Estimates):**

1. **"Ready in ~90 seconds"** ❌
2. **"15 min + indexing"** ❌

## Recommendations

### For "Total Months":
- **Current**: Uses random sample of 200 messages
- **Improvement**: Could scan ALL messages for timestamps (slower but more accurate)
- **Trade-off**: Accuracy vs. performance
- **Current Status**: Acceptable for most users, but could be improved

### For "Recent 500MB Coverage":
- **Current**: Proportional calculation based on `days_span`
- **Improvement**: Could use `estimate_history_metrics()` but it has bugs (as we discovered)
- **Current Status**: Mathematically correct IF `days_span` is accurate, but depends on timestamp extraction

### For Hardcoded Estimates:
- **Current**: Marketing estimates
- **Improvement**: Could calculate actual estimates based on:
  - Number of conversations
  - Average conversation size
  - API response times
  - But this adds complexity and might not be worth it

## Conclusion

**The most unreliable numbers are:**
1. **Total Months** - Depends on timestamp extraction from random sample
2. **Recent 500MB Coverage** - Depends on same timestamp extraction

**Both depend on the same underlying issue**: Extracting timestamps from a random sample of 200 messages. If timestamp extraction fails or the sample is unrepresentative, both numbers will be wrong.

**The most reliable number is:**
- **Total Size** - Direct file system stat, very accurate

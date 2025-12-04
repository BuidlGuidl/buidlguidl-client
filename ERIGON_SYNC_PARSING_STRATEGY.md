# Erigon Sync Stage Parsing Strategy

## Overview
Erigon reports 6 stages (1/6 through 6/6) but only 3 main stages produce useful log output:
- **Stage 1: OtterSync** - Downloads blockchain data
- **Stage 3: Senders** - Recovers transaction senders
- **Stage 4: Execution** - Executes blocks

**Note:** Stages can run simultaneously (e.g., Senders and Execution overlap)

## Log Patterns & Parsing Strategy

### 1. OtterSync [1/6]
**Pattern:** `[1/6 OtterSync] Syncing ... data="XX.XX% - size"`

**Example:**
```
INFO[12-03|15:18:55.584] [1/6 OtterSync] Syncing file-metadata=281/281 files=36/281 data="6.81% - 866.9MB/12.4GB"
```

**Parsing Strategy:**
- Extract percentage directly from `data="XX.XX%"`
- Regex: `/data="([\d.]+)%/`
- Current implementation works well ✓

**Progress Calculation:**
```javascript
percent = parseFloat(dataMatch[1]) / 100
```

---

### 2. Senders [3/6]
**Pattern:** `[3/6 Senders] Started from=XXXX to=YYYY`

**Examples:**
```
INFO[12-03|18:11:34.838] [3/6 Senders] Started from=23865999 to=23870999
INFO[12-03|18:29:34.529] [3/6 Senders] Started from=23870999 to=23875999
```

**Parsing Strategy:**
- Track the `to` block number progression
- Calculate progress by comparing current `to` block with latest known block
- Need to track: startBlock, currentBlock, latestBlock

**Progress Calculation:**
```javascript
// Extract from and to blocks
const sendersMatch = line.match(/\[3\/6 Senders\] Started\s+from=(\d+)\s+to=(\d+)/);
if (sendersMatch) {
  const fromBlock = parseInt(sendersMatch[1], 10);
  const toBlock = parseInt(sendersMatch[2], 10);
  
  // Store in tracking object
  if (!sendersTracking.startBlock) {
    sendersTracking.startBlock = fromBlock;
  }
  sendersTracking.currentBlock = toBlock;
  
  // Calculate percentage
  if (sendersTracking.latestBlock) {
    const totalBlocks = sendersTracking.latestBlock - sendersTracking.startBlock;
    const processedBlocks = sendersTracking.currentBlock - sendersTracking.startBlock;
    percent = processedBlocks / totalBlocks;
  }
}
```

**Alternative Pattern:** `[3/6 Senders] Recovery block_number=XXXX`
- Less useful for progress tracking, can be ignored or used as secondary indicator

---

### 3. Execution [4/6]
**Pattern:** `[4/6 Execution] serial executed blk=XXXX`

**Examples:**
```
INFO[12-03|18:02:38.122] [4/6 Execution] serial executed blk=23863312 blks=163 blk/s=8 txs=39.06k
INFO[12-03|18:03:18.115] [4/6 Execution] serial executed blk=23863344 blks=31 blk/s=10 txs=6.60k
```

**Additional Patterns:**
- `[4/6 Execution] serial starting from=XXXX to=YYYY` - start of range
- `[4/6 Execution] serial done blk=XXXX` - completion message
- `[4/6 Execution][agg] computing trie progress=XXXk/YYYk` - trie computation

**Parsing Strategy:**
- Track the `blk` (current block) from "serial executed" lines
- Use "serial starting" to identify the start and end of each range
- Calculate progress based on block progression

**Progress Calculation:**
```javascript
// Pattern 1: serial starting - capture range
const startingMatch = line.match(/\[4\/6 Execution\] serial starting\s+from=(\d+)\s+to=(\d+)/);
if (startingMatch) {
  const fromBlock = parseInt(startingMatch[1], 10);
  const toBlock = parseInt(startingMatch[2], 10);
  
  if (!executionTracking.startBlock) {
    executionTracking.startBlock = fromBlock;
  }
  executionTracking.targetBlock = toBlock;
}

// Pattern 2: serial executed - track progress
const executedMatch = line.match(/\[4\/6 Execution\] serial executed\s+blk=(\d+)/);
if (executedMatch) {
  const currentBlock = parseInt(executedMatch[1], 10);
  executionTracking.currentBlock = currentBlock;
  
  // Calculate percentage
  if (executionTracking.startBlock && executionTracking.targetBlock) {
    const totalBlocks = executionTracking.targetBlock - executionTracking.startBlock;
    const processedBlocks = currentBlock - executionTracking.startBlock;
    percent = Math.min(1.0, processedBlocks / totalBlocks);
  }
}

// Pattern 3: computing trie (optional - shows sub-progress)
const trieMatch = line.match(/\[4\/6 Execution\]\[agg\] computing trie\s+progress=([\d.]+)k\/([\d.]+)k/);
if (trieMatch) {
  const current = parseFloat(trieMatch[1]);
  const total = parseFloat(trieMatch[2]);
  // This could be used to show sub-stage progress
  triePercent = current / total;
}
```

---

## Implementation Plan

### Data Structure
```javascript
// Enhanced tracking objects
let erigonStagePercentages = {};
let erigonSendersTracking = {
  startBlock: null,
  currentBlock: null,
  latestBlock: null  // Will be set from chain tip
};
let erigonExecutionTracking = {
  startBlock: null,
  currentBlock: null,
  targetBlock: null
};
```

### Enhanced parseErigonSyncProgress() Function
```javascript
function parseErigonSyncProgress(line) {
  const stageMatch = line.match(/\[(\d+)\/(\d+)\s+([^\]]+)\]/);
  if (!stageMatch) return false;
  
  const stageIndex = parseInt(stageMatch[1], 10);
  const totalStages = parseInt(stageMatch[2], 10);
  const stageName = stageMatch[3].trim();
  
  let percent = null;
  let updated = false;
  
  // Parse based on stage type
  if (stageName === "OtterSync") {
    // Existing logic for OtterSync
    const dataMatch = line.match(/data="([\d.]+)%/);
    if (dataMatch) {
      percent = parseFloat(dataMatch[1]) / 100;
      updated = true;
    }
  }
  else if (stageName === "Senders") {
    // New logic for Senders
    const sendersMatch = line.match(/Started\s+from=(\d+)\s+to=(\d+)/);
    if (sendersMatch) {
      // Track progress...
      updated = true;
    }
  }
  else if (stageName === "Execution") {
    // New logic for Execution
    const startingMatch = line.match(/serial starting\s+from=(\d+)\s+to=(\d+)/);
    const executedMatch = line.match(/serial executed\s+blk=(\d+)/);
    // Track progress...
    updated = true;
  }
  
  if (updated && percent !== null) {
    erigonStagePercentages[stageIndex] = {
      name: stageName,
      percent: percent,
      totalStages: totalStages
    };
  }
  
  return updated;
}
```

### Display Strategy
The display always shows all three main stages in a fixed format:

```
OTTERSYNC
[████████░░░░] 45%
SENDERS
[██░░░░░░░░░░] 12%
EXECUTION
[░░░░░░░░░░░░] 0%
```

Implementation details:
1. **Always display all three stages** - even if they're at 0%
2. Display in stage number order (1=OtterSync, 3=Senders, 4=Execution)
3. Match the format of Geth/Reth sync boxes:
   - Stage name in uppercase
   - Progress bar with filled (█) and empty (space) characters
   - Percentage on the same line as the bar
4. No emojis or status indicators - the progress bar shows the state
5. Stages can run simultaneously - each updates independently

---

## Edge Cases

1. **Simultaneous Stages**: Senders and Execution can run at the same time
   - Solution: Track and display both independently

2. **Missing Latest Block**: For Senders, we need the chain tip block number
   - Solution: Use the highest `to` block seen, or query from RPC

3. **Stage Completion**: Stages may complete before 100%
   - Solution: Set to 100% when seeing "DONE" messages

4. **Stage Restarts**: Syncing may restart stages
   - Solution: Reset tracking when seeing a new "starting" message with lower block numbers

5. **No Progress Updates**: Some stages may not log frequently
   - Solution: Keep last known percentage, mark as "stale" after X minutes

---

## Testing Checklist

- [ ] OtterSync percentage parsing works correctly
- [ ] Senders block range tracking works
- [ ] Execution block progression tracking works
- [ ] Multiple simultaneous stages display correctly
- [ ] Progress bars update in real-time
- [ ] Stage completion (100%) detection works
- [ ] Display handles stage transitions smoothly


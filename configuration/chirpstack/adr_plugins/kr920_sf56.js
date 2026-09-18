// KR920 RP002-1.0.5 ADR algorithm for Device Profiles that support
// DR0-DR5 plus DR12/SF6 and DR13/SF5.  The configured global maxDr remains
// 5 so that the built-in ADR algorithm keeps legacy devices on DR0-DR5.

const DATA_RATES = [0, 1, 2, 3, 4, 5, 12, 13];
const REQUIRED_HISTORY_COUNT = 20;

export function name() {
  return "KR920 RP002-1.0.5 (DR0-5, DR12-13)";
}

export function id() {
  return "kr920_sf56";
}

function packetLossPercentage(history) {
  if (history.length < REQUIRED_HISTORY_COUNT) {
    return 0;
  }

  let lostPackets = 0;
  for (let i = 1; i < history.length; i += 1) {
    lostPackets += history[i].fCnt - history[i - 1].fCnt - 1;
  }

  return (lostPackets / history.length) * 100;
}

function nextNbTrans(currentNbTrans, packetLoss) {
  const table = [[1, 1, 2], [1, 2, 3], [2, 3, 3], [3, 3, 3]];
  const index = Math.min(3, Math.max(1, currentNbTrans)) - 1;
  const row = packetLoss < 5 ? 0 : packetLoss < 10 ? 1 : packetLoss < 30 ? 2 : 3;
  return table[row][index];
}

function currentDataRateIndex(dr) {
  const index = DATA_RATES.indexOf(dr);
  if (index >= 0) {
    return index;
  }

  // Do not emit a KR920 RFU DR if a device reports an unexpected one.
  for (let i = DATA_RATES.length - 1; i >= 0; i -= 1) {
    if (DATA_RATES[i] <= dr) {
      return i;
    }
  }
  return 0;
}

export function handle(req) {
  const response = {
    dr: DATA_RATES[currentDataRateIndex(req.dr)],
    txPowerIndex: req.txPowerIndex,
    nbTrans: req.nbTrans,
  };

  if (!req.adr) {
    return response;
  }

  const history = req.uplinkHistory || [];
  response.nbTrans = nextNbTrans(req.nbTrans, packetLossPercentage(history));

  let maxSnr = -999;
  let equalPowerHistoryCount = 0;
  for (const item of history) {
    maxSnr = Math.max(maxSnr, item.maxSnr);
    if (item.txPowerIndex === req.txPowerIndex) {
      equalPowerHistoryCount += 1;
    }
  }

  const snrMargin = maxSnr - req.requiredSnrForDr - req.installationMargin;
  const steps = Math.trunc(snrMargin / 3);

  // Match the default algorithm: do not react to a negative margin until a
  // complete, same-power ADR history is available.
  if (steps < 0 && equalPowerHistoryCount !== REQUIRED_HISTORY_COUNT) {
    return response;
  }

  let remainingSteps = steps;
  let rateIndex = currentDataRateIndex(req.dr);
  while (remainingSteps > 0) {
    if (rateIndex < DATA_RATES.length - 1) {
      rateIndex += 1;
    } else if (response.txPowerIndex < req.maxTxPowerIndex) {
      response.txPowerIndex += 1;
    }
    remainingSteps -= 1;
  }

  while (remainingSteps < 0) {
    response.txPowerIndex = Math.max(0, response.txPowerIndex - 1);
    remainingSteps += 1;
  }

  response.dr = DATA_RATES[rateIndex];
  return response;
}

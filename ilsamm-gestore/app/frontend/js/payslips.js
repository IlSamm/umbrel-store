var MAX_PAYSLIP_PHOTOS = 8;

function beginPayslipOperation(title, message, options) {
  if (!window.GestOreLoading) return '';
  return window.GestOreLoading.begin(Object.assign({
    title: title,
    message: message,
    kind: 'payslip',
    delay: 0,
    minVisible: 620,
    dismissKeyboard: true
  }, options || {}));
}

function endPayslipOperation(token) {
  if (token && window.GestOreLoading) window.GestOreLoading.end(token);
}

function loadPendingPayslipDraft() {
  try {
    var raw = localStorage.getItem(STORAGE_PENDING_PAYSLIP);
    var parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    return null;
  }
}

function persistPendingPayslipDraft(draft) {
  try { localStorage.setItem(STORAGE_PENDING_PAYSLIP, JSON.stringify(draft || {})); } catch (err) {}
}

function clearPendingPayslipDraft() {
  try { localStorage.removeItem(STORAGE_PENDING_PAYSLIP); } catch (err) {}
}

var state = {
      activeTab: 'home',
      settingsSection: '',
      entries: loadEntriesWithRecovery(),
      settings: normalizeRuntimeSettings(loadWithMigration(STORAGE_SETTINGS, LEGACY_SETTINGS_KEYS, SETTINGS_BACKUP_KEYS, {}, 'settings')),
      settingsDraft: {},
      currentMonth: new Date(),
      statsRange: 'month',
      calendarFilter: 'all',
      editingDate: null,
      draft: null,
      typeOpen: false,
      notesOpen: false,
      confirmClearOpen: false,
      editorValidationIssues: [],
      payslips: normalizePayslipCollection(loadPayslipsWithRecovery()),
      payslipDraft: loadPendingPayslipDraft(),
      payslipBusy: false,
      payslipStatus: '',
      payslipOcrReady: false,
      payslipViewer: null,
      payslipDetailId: '',
      payslipEditorOpen: false,
      payslipStatsOpen: false,
      payslipStatsYear: new Date().getFullYear(),
      payslipEstimateOpen: false,
      payslipEstimateYear: new Date().getFullYear(),
      payslipEstimateMonth: new Date().getMonth() + 1,
      payslipEstimateStatus: '',
      payslipHydratingId: '',
      payslipDeletePendingId: '',
      payslipPhotoDeletePendingIndex: -1,
      vacationManagerOpen: false,
      vacationManagerMode: 'allowance',
      vacationManagerError: '',
      vacationDraft: null,
      vacationStatus: '',
      vacationHistoryOpen: false,
      vacationHistoryYear: new Date().getFullYear(),
      vacationScreenYear: new Date().getFullYear(),
      privacyLocked: false,
      syncStatus: 'Solo sul dispositivo',
      syncPending: false,
      syncConflictNotice: '',
      lastSyncedAt: 0
    };
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
    state.settingsDraft = Object.assign({}, state.settings);
    state.privacyLocked = Boolean(state.settings.lockApp);

    function normalizePayslipPhotos(payslip) {
      var source = payslip && typeof payslip === 'object' ? payslip : {};
      var sourcePhotos = Array.isArray(source.photos) ? source.photos : [];
      var normalized = sourcePhotos.map(function (photo, index) {
        var current = photo && typeof photo === 'object' ? photo : {};
        var data = String(current.data || current.imageData || current.dataUrl || '');
        if (!data) return null;
        return {
          id: String(current.id || ('photo-' + String(source.id || 'legacy') + '-' + index)),
          data: data,
          thumbnail: String(current.thumbnail || current.thumb || data),
          fileName: String(current.fileName || ('busta-paga-' + (index + 1) + '.jpg')),
          createdAt: Math.max(0, Number(current.createdAt || source.createdAt || Date.now()) || Date.now())
        };
      }).filter(Boolean);
      if (!normalized.length && source.imageData) {
        normalized.push({
          id: 'photo-' + String(source.id || 'legacy') + '-0',
          data: String(source.imageData),
          thumbnail: String(source.thumbnail || source.imageData),
          fileName: String(source.fileName || 'busta-paga.jpg'),
          createdAt: Math.max(0, Number(source.createdAt || Date.now()) || Date.now())
        });
      }
      return normalized;
    }
    function normalizePayslipRecord(payslip) {
      var source = payslip && typeof payslip === 'object' ? payslip : {};
      var photos = normalizePayslipPhotos(source);
      var firstPhoto = photos[0] || null;
      return Object.assign({}, source, {
        photos: photos,
        imageData: firstPhoto ? firstPhoto.data : '',
        fileName: firstPhoto ? firstPhoto.fileName : '',
        hourlyRate: parseDecimalInput(source.hourlyRate, 0),
        overtimeRate: parseDecimalInput(source.overtimeRate, 0),
        reusePreviousRates: Boolean(source.reusePreviousRates),
        notes: String(source.notes || '')
      });
    }
    function normalizePayslipCollection(items) {
      return (Array.isArray(items) ? items : []).map(normalizePayslipRecord);
    }
    function getPayslipPhotoCount(payslip) {
      var localCount = normalizePayslipPhotos(payslip).length;
      return Math.max(localCount, Math.max(0, Number(payslip && payslip.photoCount) || 0));
    }
    function serializePayslipsForSnapshot(items, includePhotos) {
      return (Array.isArray(items) ? items : []).map(function (item) {
        var record = Object.assign({}, item && typeof item === 'object' ? item : {});
        var photos = normalizePayslipPhotos(record);
        var sourceText = String(record.sourceText || '');
        if (includePhotos) {
          record.photos = photos;
          record.imageData = photos[0] ? photos[0].data : '';
          record.fileName = photos[0] ? photos[0].fileName : String(record.fileName || '');
          record.photosDeferred = Boolean(record.photosDeferred && !photos.length);
          record.photoCount = getPayslipPhotoCount(record);
          return record;
        }
        delete record.photos;
        delete record.imageData;
        delete record.sourceText;
        record.photoCount = getPayslipPhotoCount(item);
        record.photosDeferred = record.photoCount > 0 || Boolean(item && item.photosDeferred);
        record.sourceTextDeferred = Boolean(sourceText || (item && item.sourceTextDeferred));
        return record;
      });
    }
    function clonePayslipForDraft(payslip) {
      var normalized = normalizePayslipRecord(payslip);
      return Object.assign({}, normalized, {
        photos: normalized.photos.map(function (photo) { return Object.assign({}, photo); })
      });
    }

    async function waitForPayslipServerReady() {
      var startedAt = Date.now();
      while (!serverSyncReady) {
        if (state.account && state.account.loaded && !state.account.authenticated) throw new Error('Accedi al tuo account prima di salvare.');
        if (Date.now() - startedAt > 15000) throw new Error('Il database del profilo non e ancora pronto.');
        await new Promise(function (resolve) { window.setTimeout(resolve, 50); });
      }
    }

    async function requestPayslipRecord(method, payload, options) {
      var opts = options || {};
      await waitForPayslipServerReady();
      var mutationId = String(payload && payload.mutationId || makeServerMutationId('payslip'));
      var requestPayload = Object.assign({}, payload || {}, { mutationId: mutationId, updatedAt: Date.now() });
      var lastError = null;
      for (var attempt = 0; attempt < 3; attempt += 1) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timeout = controller ? window.setTimeout(function () { controller.abort(); }, Number(opts.timeoutMs) || 30000) : 0;
        try {
          var response = await fetch(PAYSLIP_RECORD_URL, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'X-GestOre-Mutation-Id': mutationId },
            cache: 'no-store',
            body: JSON.stringify(requestPayload),
            signal: controller ? controller.signal : undefined
          });
          if (response.status === 401 && typeof handleAccountUnauthorized === 'function') handleAccountUnauthorized();
          var result = {};
          try { result = await response.json(); } catch (parseError) {}
          if (!response.ok) {
            var responseError = new Error(result.error || 'Il server ha rifiutato la busta paga.');
            responseError.status = response.status;
            throw responseError;
          }
          if (!result.ok || String(result.mutationId || '') !== mutationId) throw new Error('Conferma database non valida.');
          if (String(result.payslipId || '') !== String(requestPayload.payslipId || (requestPayload.payslip || {}).id || '')) {
            throw new Error('Il server ha confermato una busta diversa.');
          }
          serverSyncLastError = '';
          serverSnapshotUpdatedAt = Math.max(serverSnapshotUpdatedAt, Number(result.updatedAt) || 0);
          setSyncStatus('Server locale attivo', Number(result.updatedAt) || Date.now());
          return result;
        } catch (err) {
          lastError = err && err.name === 'AbortError' ? new Error('Il caricamento della foto sta impiegando troppo tempo.') : err;
          if (attempt < 2 && (!lastError.status || lastError.status >= 500)) {
            await new Promise(function (resolve) { window.setTimeout(resolve, 350 * (attempt + 1)); });
            continue;
          }
          break;
        } finally {
          if (timeout) window.clearTimeout(timeout);
        }
      }
      serverSyncLastError = lastError && lastError.message ? lastError.message : 'Salvataggio non confermato.';
      throw lastError || new Error(serverSyncLastError);
    }

    async function persistPayslipRecordToServer(payslip) {
      return requestPayslipRecord('PUT', { payslip: clonePayslipForDraft(payslip) }, { timeoutMs: 45000 });
    }

    async function deletePayslipRecordFromServer(payslipId) {
      return requestPayslipRecord('DELETE', { payslipId: String(payslipId || '') });
    }

    async function hydratePayslipRecord(payslipId) {
      var id = String(payslipId || '');
      var current = (state.payslips || []).find(function (item) { return item.id === id; });
      if (!current || (!current.photosDeferred && !current.sourceTextDeferred)) return current || null;
      state.payslipHydratingId = id;
      var loadingToken = beginPayslipOperation('Carico i documenti', 'Recupero le foto di questa busta paga');
      try {
        await waitForPayslipServerReady();
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 15000) : 0;
        var response;
        try {
          response = await fetch(PAYSLIP_RECORD_URL + '?id=' + encodeURIComponent(id), {
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
          });
        } finally {
          if (timeout) window.clearTimeout(timeout);
        }
        if (response.status === 401 && typeof handleAccountUnauthorized === 'function') handleAccountUnauthorized();
        var payload = {};
        try { payload = await response.json(); } catch (parseError) {}
        if (!response.ok || !payload.payslip) throw new Error(payload.error || 'Foto della busta non disponibili.');
        var hydrated = normalizePayslipRecord(Object.assign({}, payload.payslip, {
          photosDeferred: false,
          sourceTextDeferred: false,
          photoCount: normalizePayslipPhotos(payload.payslip).length
        }));
        var index = (state.payslips || []).findIndex(function (item) { return item.id === id; });
        if (index >= 0) state.payslips[index] = hydrated;
        persistPayslipsLocally();
        return hydrated;
      } catch (err) {
        state.payslipStatus = err && err.name === 'AbortError'
          ? 'Le foto stanno impiegando troppo tempo. Riprova.'
          : (err.message || 'Non sono riuscito ad aprire le foto della busta.');
        return current;
      } finally {
        state.payslipHydratingId = '';
        endPayslipOperation(loadingToken);
      }
    }

    function getPayslipMonthDate(payslip) {
      if (!payslip || !payslip.month || !payslip.year) return null;
      return new Date(Number(payslip.year), Math.max(0, Number(payslip.month) - 1), 1);
    }
    function getPayslipMonthLabel(payslip) {
      var monthDate = getPayslipMonthDate(payslip);
      return monthDate ? formatMonthYear(monthDate) : 'Busta paga';
    }
    function getPayslipPeriodValue(payslip) {
      var date = getPayslipMonthDate(payslip);
      return date ? (date.getFullYear() * 12 + date.getMonth()) : -1;
    }
    function findPreviousPayslipWithRates(payslip) {
      var current = payslip || {};
      var currentPeriod = getPayslipPeriodValue(current);
      if (currentPeriod < 0) return null;
      return (state.payslips || []).filter(function (item) {
        if (!item || item.id === current.id) return false;
        var itemPeriod = getPayslipPeriodValue(item);
        return itemPeriod >= 0 && itemPeriod < currentPeriod &&
          (parseDecimalInput(item.hourlyRate, 0) > 0 || parseDecimalInput(item.overtimeRate, 0) > 0);
      }).sort(function (a, b) {
        return getPayslipPeriodValue(b) - getPayslipPeriodValue(a);
      })[0] || null;
    }
    function applyPreviousPayslipRatesToDraft() {
      var draft = ensurePayslipDraft();
      var previous = findPreviousPayslipWithRates(draft);
      if (!previous) {
        draft.reusePreviousRates = false;
        return null;
      }
      draft.hourlyRate = parseDecimalInput(previous.hourlyRate, 0);
      draft.overtimeRate = parseDecimalInput(previous.overtimeRate, 0);
      draft.reusePreviousRates = true;
      return previous;
    }
    function getMonthFromItalianText(text) {
      var lower = String(text || '').toLowerCase();
      var names = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
      for (var i = 0; i < names.length; i += 1) {
        if (lower.indexOf(names[i]) !== -1) return i + 1;
      }
      var shortNames = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
      for (var j = 0; j < shortNames.length; j += 1) {
        if (new RegExp('\\b' + shortNames[j] + '\\b', 'i').test(lower)) return j + 1;
      }
      return null;
    }
    function normalizePayslipText(text) {
      return String(text || '')
        .replace(/[|]/g, 'I')
        .replace(/[“”]/g, '"')
        .replace(/[€]/g, ' € ')
        .replace(/\u00A0/g, ' ')
        .replace(/[\t\r]+/g, ' ')
        .replace(/[ ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    function parseItalianNumber(raw) {
      if (raw === null || raw === undefined) return 0;
      var value = String(raw)
        .replace(/€/g, '')
        .replace(/\s+/g, '')
        .replace(/O/g, '0')
        .replace(/o/g, '0');
      if (!value) return 0;
      if (value.indexOf(',') !== -1 && value.indexOf('.') !== -1) {
        if (value.lastIndexOf(',') > value.lastIndexOf('.')) value = value.replace(/\./g, '').replace(',', '.');
        else value = value.replace(/,/g, '');
      } else if (value.indexOf(',') !== -1) {
        value = value.replace(/\./g, '').replace(',', '.');
      }
      var parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    function getPayslipLines(text) {
      return normalizePayslipText(text)
        .split(/\n+/)
        .map(function (line) { return line.replace(/\s+/g, ' ').trim(); })
        .filter(Boolean);
    }
    function getLineNumbers(line, opts) {
      var options = opts || {};
      return (String(line || '').match(/[0-9OolI]{1,3}(?:(?:[\.,][0-9OolI]{3})+)?(?:[\.,][0-9OolI]{1,4})?|[0-9OolI]{1,4}(?:[\.,][0-9OolI]{1,4})?/g) || [])
        .map(function (chunk) { return parseItalianNumber(chunk); })
        .filter(function (num) {
          if (!Number.isFinite(num)) return false;
          if (options.min !== undefined && num < options.min) return false;
          if (options.max !== undefined && num > options.max) return false;
          return true;
        });
    }
    function getExactLineNumbers(line, opts) {
      var options = opts || {};
      return (String(line || '').match(/[0-9OolI]{1,3}(?:(?:[\.,][0-9OolI]{3})+)?(?:[\.,][0-9OolI]{1,2})|[0-9OolI]{1,4}(?:[\.,][0-9OolI]{1,2})?|[0-9OolI]{1,3}(?:[\.,][0-9OolI]{3})+/g) || [])
        .map(function (chunk) { return parseItalianNumber(chunk); })
        .filter(function (num) {
          if (!Number.isFinite(num)) return false;
          if (options.min !== undefined && num < options.min) return false;
          if (options.max !== undefined && num > options.max) return false;
          return true;
        });
    }
    function pickFirstReasonableNumber(numbers, opts) {
      var list = numbers || [];
      var options = opts || {};
      for (var i = 0; i < list.length; i += 1) {
        var num = list[i];
        if (options.min !== undefined && num < options.min) continue;
        if (options.max !== undefined && num > options.max) continue;
        return num;
      }
      return 0;
    }
    function pickLastReasonableNumber(numbers, opts) {
      var list = numbers || [];
      var options = opts || {};
      for (var i = list.length - 1; i >= 0; i -= 1) {
        var num = list[i];
        if (options.min !== undefined && num < options.min) continue;
        if (options.max !== undefined && num > options.max) continue;
        return num;
      }
      return 0;
    }
    function extractNumberNearLabel(source, patterns, opts) {
      var options = opts || {};
      var text = String(source || '');
      for (var i = 0; i < patterns.length; i += 1) {
        var rx = patterns[i] instanceof RegExp ? patterns[i] : new RegExp(patterns[i], 'i');
        var match = text.match(rx);
        if (match) {
          for (var g = 1; g < match.length; g += 1) {
            if (match[g]) {
              var num = parseItalianNumber(match[g]);
              if (options.max && num > options.max) continue;
              if (options.min && num < options.min) continue;
              return num;
            }
          }
        }
      }
      return 0;
    }
    function findLineIndex(lines, patterns) {
      for (var i = 0; i < lines.length; i += 1) {
        for (var j = 0; j < patterns.length; j += 1) {
          if (patterns[j].test(lines[i])) return i;
        }
      }
      return -1;
    }
    function getLineWindow(lines, index) {
      if (index < 0) return '';
      return [lines[index] || '', lines[index + 1] || ''].join(' ').trim();
    }
    function extractAmountFromLine(lines, patterns, opts) {
      var options = opts || {};
      var idx = findLineIndex(lines, patterns);
      if (idx === -1) return 0;
      var numbers = getExactLineNumbers(lines[idx], options);
      return options.pick === 'first' ? pickFirstReasonableNumber(numbers, options) : pickLastReasonableNumber(numbers, options);
    }
    function getLineByPatterns(lines, patterns) {
      var idx = findLineIndex(lines, patterns);
      return idx === -1 ? '' : lines[idx];
    }
    function extractAmountFromLineWindow(lines, patterns, opts) {
      var options = opts || {};
      var idx = findLineIndex(lines, patterns);
      if (idx === -1) return 0;
      var numbers = getLineNumbers(getLineWindow(lines, idx), options);
      return options.pick === 'first' ? pickFirstReasonableNumber(numbers, options) : pickLastReasonableNumber(numbers, options);
    }
    function extractHoursFromVoiceLine(lines, patterns) {
      var idx = findLineIndex(lines, patterns);
      if (idx === -1) return 0;
      var line = String(lines[idx] || '');
      line = line.replace(/^\s*[A-Z]?\s*\d{1,4}\s+/, '');
      line = line.replace(/\b(?:voce|descrizione|competenz[ae]?|trattenut[ae]?|figurativ[ae]?|base|qta|qtà|%\s*magg\.?|magg\.?|sigla)\b/gi, ' ');
      var numbers = getExactLineNumbers(line, { min: 0.25, max: 260 });
      if (!numbers.length) numbers = getLineNumbers(line, { min: 0.25, max: 260 });
      if (!numbers.length) return 0;
      for (var i = 0; i < numbers.length; i += 1) {
        var num = numbers[i];
        if (num >= 1 && num <= 260 && Math.abs(num - Math.round(num)) < 0.01) return num;
      }
      for (var j = 0; j < numbers.length; j += 1) {
        var num2 = numbers[j];
        if (num2 >= 1 && num2 <= 260) return num2;
      }
      return numbers[0] || 0;
    }
    function extractTrailingAmountFromVoiceLine(lines, patterns) {
      var idx = findLineIndex(lines, patterns);
      if (idx === -1) return 0;
      var line = String(lines[idx] || '').replace(/^\s*[A-Z]?\s*\d{1,4}\s+/, '');
      var numbers = getExactLineNumbers(line, { min: 0.01, max: 50000 });
      return pickLastReasonableNumber(numbers, { min: 0.01, max: 50000 });
    }
    function extractCompanyFromPayslip(text, lines) {
      var source = normalizePayslipText(text);
      var direct = source.match(/(?:azienda|datore\s+di\s+lavoro|ragione\s+sociale|societa|società)\s*[:\-]?\s*([^\n]{3,60})/i);
      if (direct && direct[1]) return direct[1].trim().replace(/\s{2,}/g, ' ');
      var blacklist = /(?:cedolino|busta paga|periodo|competenza|netto|lordo|imponibile|retribuzione|ore|ferie|permess|malattia|tfr|iban|codice|fiscale|matricola)/i;
      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i];
        if (line.length >= 4 && line.length <= 50 && /[A-Za-z]/.test(line) && /(?:s\.r\.l\.|srl|s\.p\.a\.|spa|snc|sas|societa|società)/i.test(line) && !blacklist.test(line)) return line.trim();
      }
      return '';
    }
    function matchYearFromText(text) {
      var match = String(text || '').match(/20\d{2}/);
      return match ? Number(match[0]) : new Date().getFullYear();
    }
    function extractWorkedDaysFromCalendar(text) {
      var source = String(text || '');
      var blockMatch = source.match(/(?:\b1\b[\s\S]{0,1200}\b31\b[\s\S]{0,400})(?:giorno\s+festivo|fe\s+ferie|os\s+ore\s+straord|gg\s+non\s+lavor)/i);
      if (!blockMatch) return 0;
      var block = blockMatch[0];
      var worked = 0;
      var rx = /\b\d{1,2}\b([^\n]{0,32})/g;
      var m;
      while ((m = rx.exec(block))) {
        var row = m[1] || '';
        if (/\b8[,\.]00\b|\b8\b/.test(row)) worked += 1;
      }
      return worked > 0 && worked <= 31 ? worked : 0;
    }
    function boostPayslipParsedData(parsed, normalized, cleaned, lines) {
      var out = Object.assign({}, parsed || {});
      out.netto = out.netto || extractAmountFromLine(lines, [/\bnetto\b/i], { min: 300, max: 10000 });
      out.lordo = out.lordo || extractAmountFromLine(lines, [/retribuzione\s+teorica|imponibile\s+irpef|imponibile\s+inps|imponibile\s+contribut/i], { min: 500, max: 10000 });
      out.ordinaryHours = out.ordinaryHours || extractAmountFromLine(lines, [/\bore\s+lav\.?/i], { min: 1, max: 260, pick: 'last' }) || extractHoursFromVoiceLine(lines, [/retribuzione\s+ordinaria/i]);
      out.overtimeHours = out.overtimeHours || extractHoursFromVoiceLine(lines, [/straord/i, /lavoro\s+festivo/i]);
      out.ferieHours = out.ferieHours || extractHoursFromVoiceLine(lines, [/ferie\s+godute/i, /ferie/i]);
      out.permessoHours = out.permessoHours || extractHoursFromVoiceLine(lines, [/permessi?\s*rol/i, /permess/i, /rol/i, /ex\s*fest/i]);
      out.malattiaHours = out.malattiaHours || extractHoursFromVoiceLine(lines, [/malattia/i, /assenze/i]);
      out.workedDays = out.workedDays || Math.round(extractAmountFromLine(lines, [/\bgg\.?\s*lav\.?/i, /giorni\s+lavorati/i], { min: 1, max: 31, pick: 'last' })) || extractWorkedDaysFromCalendar(normalized);
      out.tfr = out.tfr || extractTrailingAmountFromVoiceLine(lines, [/accantonamento\s+t\.?f\.?r\.?/i]) || extractAmountFromLine(lines, [/tfr\s*mese/i, /tfr\s+spettante/i], { min: 10, max: 50000 });
      if (!out.netto) out.netto = extractNumberNearLabel(cleaned, [/\bnetto\D{0,20}([\d\.,]{3,16})/i], { min: 300, max: 10000 });
      if (!out.lordo) out.lordo = extractNumberNearLabel(cleaned, [/(?:imponibile\s+irpef|retribuzione\s+teorica)\D{0,20}([\d\.,]{3,16})/i], { min: 500, max: 10000 });
      return out;
    }

    function cropCanvasArea(sourceCanvas, leftRatio, topRatio, widthRatio, heightRatio) {
      var sw = sourceCanvas.width || 1;
      var sh = sourceCanvas.height || 1;
      var sx = Math.max(0, Math.floor(sw * leftRatio));
      var sy = Math.max(0, Math.floor(sh * topRatio));
      var cw = Math.max(1, Math.min(sw - sx, Math.floor(sw * widthRatio)));
      var ch = Math.max(1, Math.min(sh - sy, Math.floor(sh * heightRatio)));
      var crop = document.createElement('canvas');
      crop.width = cw;
      crop.height = ch;
      var ctx = crop.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sourceCanvas, sx, sy, cw, ch, 0, 0, cw, ch);
      return crop;
    }
    function getPayslipRegionSources(pageCanvas) {
      if (!pageCanvas) return [];
      var defs = [
        { key: 'fullPage', label: 'FULL PAGE', box: [0, 0, 1, 1] },
        { key: 'headerLeft', label: 'HEADER LEFT', box: [0.02, 0.02, 0.52, 0.24] },
        { key: 'headerRight', label: 'HEADER RIGHT', box: [0.45, 0.02, 0.53, 0.24] },
        { key: 'companyBand', label: 'COMPANY BAND', box: [0.02, 0.04, 0.66, 0.18] },
        { key: 'tableMain', label: 'TABLE MAIN', box: [0.04, 0.34, 0.92, 0.34] },
        { key: 'bottomSummary', label: 'BOTTOM SUMMARY', box: [0.03, 0.66, 0.94, 0.24] },
        { key: 'bottomRight', label: 'BOTTOM RIGHT', box: [0.58, 0.61, 0.38, 0.28] },
        { key: 'amountsRight', label: 'AMOUNTS RIGHT', box: [0.52, 0.56, 0.44, 0.34] }
      ];
      return defs.map(function (def) {
        var crop = cropCanvasArea(pageCanvas, def.box[0], def.box[1], def.box[2], def.box[3]);
        return { key: def.key, label: def.label, image: crop.toDataURL('image/jpeg', 0.96) };
      });
    }
    function lineByPattern(text, pattern) {
      var lines = getPayslipLines(text || '');
      for (var i = 0; i < lines.length; i += 1) {
        if (pattern.test(lines[i])) return lines[i];
      }
      return '';
    }
    function extractHoursFromSingleLine(line) {
      var nums = getExactLineNumbers(String(line || ''), { min: 0.25, max: 260 });
      if (!nums.length) nums = getLineNumbers(String(line || ''), { min: 0.25, max: 260 });
      if (!nums.length) return 0;
      for (var i = 0; i < nums.length; i += 1) {
        var n = nums[i];
        if (n >= 1 && n <= 260 && Math.abs(n - Math.round(n)) < 0.01) return n;
      }
      return nums[0] || 0;
    }
    function parsePayslipRegionTexts(regions, baseParsed) {
      var out = Object.assign({}, baseParsed || {});
      var regionMap = {};
      (regions || []).forEach(function (item) {
        regionMap[item.key] = normalizePayslipText(item.text || '');
      });
      var headerLeft = regionMap.headerLeft || '';
      var headerRight = regionMap.headerRight || '';
      var tableMain = regionMap.tableMain || '';
      var bottomSummary = regionMap.bottomSummary || '';
      var bottomRight = regionMap.bottomRight || '';

      if (!out.company) {
        var companyLines = getPayslipLines(headerLeft);
        for (var i = 0; i < companyLines.length; i += 1) {
          var line = companyLines[i];
          if (/(s\.?r\.?l\.?|srl|s\.?p\.?a\.?|spa|snc|sas)/i.test(line) && !/(via|cf|cod|matric)/i.test(line)) {
            out.company = line.trim();
            break;
          }
        }
      }
      if (headerRight) {
        var m = headerRight.match(/\b(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/i);
        if (m) out.month = getMonthFromItalianText(m[1]) || out.month;
        var y = headerRight.match(/20\d{2}/);
        if (y) out.year = Number(y[0]) || out.year;
      }
      var nettoLine = lineByPattern(bottomRight, /(?:^|\b)netto(?:\b|\s)/i);
      if (nettoLine && !/ritenuta/i.test(nettoLine)) {
        var nettoNum = pickLastReasonableNumber(getLineNumbers(nettoLine, { min: 300, max: 10000 }), { min: 300, max: 10000 });
        if (nettoNum) out.netto = nettoNum;
      }
      if (!out.netto) {
        var allNetto = getLineNumbers(bottomRight, { min: 300, max: 10000 });
        out.netto = pickLastReasonableNumber(allNetto, { min: 300, max: 10000 });
      }
      if (!out.lordo) {
        var impLine = lineByPattern(bottomSummary, /imponibile\s+irpef|retrib.*lorda|imponibile\s+contribut/i);
        if (impLine) out.lordo = pickLastReasonableNumber(getLineNumbers(impLine, { min: 500, max: 10000 }), { min: 500, max: 10000 });
      }
      if (!out.ordinaryHours) {
        var oreLavLine = lineByPattern(bottomSummary, /\bore\s+lav\.?/i);
        if (oreLavLine) out.ordinaryHours = pickLastReasonableNumber(getLineNumbers(oreLavLine, { min: 1, max: 260 }), { min: 1, max: 260 });
      }
      if (!out.ordinaryHours) {
        var ordLine = lineByPattern(tableMain, /retribuzione\s+ordinaria/i);
        if (ordLine) out.ordinaryHours = extractHoursFromSingleLine(ordLine);
      }
      if (!out.overtimeHours) {
        var straordLine = lineByPattern(tableMain, /straord|lavoro\s+festivo/i);
        if (straordLine) out.overtimeHours = extractHoursFromSingleLine(straordLine);
      }
      if (!out.ferieHours) {
        var ferieLine = lineByPattern(tableMain, /ferie\s+godute|ferie/i);
        if (ferieLine) out.ferieHours = extractHoursFromSingleLine(ferieLine);
      }
      if (!out.permessoHours) {
        var permLine = lineByPattern(tableMain + '\n' + bottomSummary, /\bpermess|rol|ex\s*fest/i);
        if (permLine) {
          var perm = extractHoursFromSingleLine(permLine);
          if (perm > 0 && perm <= 80) out.permessoHours = perm;
        }
      }
      if (!out.malattiaHours) {
        var malLine = lineByPattern(tableMain, /malattia|assenze/i);
        if (malLine) out.malattiaHours = extractHoursFromSingleLine(malLine);
      }
      if (!out.workedDays) {
        var ggLine = lineByPattern(bottomSummary, /\bgg\.?\s*lav\.?/i);
        if (ggLine) out.workedDays = Math.round(pickLastReasonableNumber(getLineNumbers(ggLine, { min: 1, max: 31 }), { min: 1, max: 31 }));
      }
      if (!out.tfr) {
        var tfrLine = lineByPattern(bottomSummary, /tfr\s+a\s+prev|tfr\s*mese|tfr\s*\/\s*0,50|accantonamento\s+t\.?f\.?r/i);
        if (tfrLine) {
          var tfrNums = getLineNumbers(tfrLine, { min: 1, max: 5000 });
          for (var j = 0; j < tfrNums.length; j += 1) {
            var val = tfrNums[j];
            if (val >= 20 && val <= 500) { out.tfr = val; break; }
          }
          if (!out.tfr) out.tfr = pickLastReasonableNumber(tfrNums, { min: 1, max: 5000 });
        }
      }
      if (out.permessoHours > 80) out.permessoHours = 0;
      if (out.workedDays > 31) out.workedDays = 0;
      if (out.tfr > 5000) out.tfr = 0;
      return out;
    }
    function reducePayslipToCoreFields(parsed) {
      var source = Object.assign({}, parsed || {});
      return {
        month: source.month || (new Date().getMonth() + 1),
        year: source.year || new Date().getFullYear(),
        company: String(source.company || '').trim(),
        netto: parseDecimalInput(source.netto, 0),
        lordo: parseDecimalInput(source.lordo, 0),
        ordinaryHours: 0,
        overtimeHours: 0,
        ferieHours: 0,
        permessoHours: 0,
        malattiaHours: 0,
        workedDays: 0,
        tfr: 0,
        sourceText: source.sourceText || '',
        hourlyRate: parseDecimalInput(source.hourlyRate, 0),
        overtimeRate: parseDecimalInput(source.overtimeRate, 0),
        reusePreviousRates: Boolean(source.reusePreviousRates),
        notes: String(source.notes || '')
      };
    }
    function extractMonthYearFromFileName(fileName) {
      var source = String(fileName || '').replace(/\.[^.]+$/, '');
      var lower = source.toLowerCase();
      var month = getMonthFromItalianText(lower) || 0;
      var year = 0;
      var direct = lower.match(/\b(20\d{2})[-_ .](0?[1-9]|1[0-2])\b/);
      if (direct) {
        year = Number(direct[1]) || 0;
        month = Number(direct[2]) || month;
      }
      var inverse = lower.match(/\b(0?[1-9]|1[0-2])[-_ .](20\d{2})\b/);
      if (inverse) {
        month = Number(inverse[1]) || month;
        year = Number(inverse[2]) || year;
      }
      var yearMatch = lower.match(/20\d{2}/);
      if (yearMatch) year = Number(yearMatch[0]) || year;
      return {
        month: month || (new Date().getMonth() + 1),
        year: year || new Date().getFullYear()
      };
    }
    function normalizeCompanyCandidate(value) {
      return String(value || '')
        .replace(/^(?:azienda|datore(?:\s+di\s+lavoro)?|ragione\s+sociale|societa|società)\s*[:\-]?\s*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
    function scoreCompanyCandidate(value) {
      var line = normalizeCompanyCandidate(value);
      if (!line || line.length < 3 || line.length > 64) return -10;
      var score = 0;
      if (/[a-z]/i.test(line)) score += 2;
      if (/(s\.?r\.?l\.?|srl|s\.?p\.?a\.?|spa|snc|sas|soc\.?\s*coop\.?|cooperativa)/i.test(line)) score += 6;
      if (/^[A-Z0-9 '&.\/-]+$/.test(line)) score += 1;
      if (/\d/.test(line)) score -= 1;
      if (/(via|viale|piazza|cap|telefono|tel|fax|cf|c\.f\.|p\.?iva|partita\s+iva|matric|iban|inail|comune|provincia)/i.test(line)) score -= 6;
      return score;
    }
    function pickBestCompanyCandidate(candidates) {
      var best = '';
      var bestScore = -Infinity;
      (candidates || []).forEach(function (value) {
        var candidate = normalizeCompanyCandidate(value);
        var score = scoreCompanyCandidate(candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
      return best;
    }
    function pushWeightedAmount(list, value, weight) {
      var amount = parseDecimalInput(value, 0);
      if (amount > 0) list.push({ value: +amount.toFixed(2), weight: weight || 1 });
    }
    function pickWeightedAmount(candidates, opts) {
      var options = opts || {};
      var bestValue = 0;
      var bestScore = -Infinity;
      var buckets = {};
      (candidates || []).forEach(function (item) {
        if (!item) return;
        var value = parseDecimalInput(item.value, 0);
        if (!value) return;
        if (options.min !== undefined && value < options.min) return;
        if (options.max !== undefined && value > options.max) return;
        var key = value.toFixed(2);
        buckets[key] = (buckets[key] || 0) + (item.weight || 1);
      });
      Object.keys(buckets).forEach(function (key) {
        var value = Number(key);
        var score = buckets[key];
        if (score > bestScore || (score === bestScore && value > bestValue)) {
          bestValue = value;
          bestScore = score;
        }
      });
      return bestValue;
    }
    function mergePayslipCoreCandidates(candidates, fileName) {
      var fallbackMonthYear = extractMonthYearFromFileName(fileName);
      var merged = {
        month: 0,
        year: 0,
        company: '',
        netto: 0,
        lordo: 0,
        sourceText: ''
      };
      var companyCandidates = [];
      var nettoCandidates = [];
      var lordoCandidates = [];
      var sourceTexts = [];
      (candidates || []).forEach(function (item) {
        var parsed = reducePayslipToCoreFields(item && item.parsed ? item.parsed : item);
        var weight = item && item.weight ? item.weight : 1;
        if (!merged.month && parsed.month) merged.month = parsed.month;
        if (!merged.year && parsed.year) merged.year = parsed.year;
        if (parsed.company) companyCandidates.push(parsed.company);
        pushWeightedAmount(nettoCandidates, parsed.netto, weight);
        pushWeightedAmount(lordoCandidates, parsed.lordo, weight);
        if (parsed.sourceText) sourceTexts.push(parsed.sourceText);
      });
      merged.month = merged.month || fallbackMonthYear.month;
      merged.year = merged.year || fallbackMonthYear.year;
      merged.company = pickBestCompanyCandidate(companyCandidates);
      merged.netto = pickWeightedAmount(nettoCandidates, { min: 300, max: 10000 });
      merged.lordo = pickWeightedAmount(lordoCandidates, { min: Math.max(500, merged.netto || 0), max: 10000 }) || pickWeightedAmount(lordoCandidates, { min: 500, max: 10000 });
      if (merged.lordo && merged.netto && merged.lordo < merged.netto) {
        var lowerNetto = pickWeightedAmount(nettoCandidates, { min: 300, max: merged.lordo });
        if (lowerNetto) merged.netto = lowerNetto;
      }
      merged.sourceText = sourceTexts.filter(Boolean).join('\n\n=== OCR ===\n');
      return reducePayslipToCoreFields(merged);
    }
    function extractCompanyCore(text) {
      var lines = getPayslipLines(text || '');
      var shortlist = [];
      for (var i = 0; i < Math.min(lines.length, 10); i += 1) shortlist.push(lines[i]);
      return pickBestCompanyCandidate(shortlist);
    }
    function extractMonthYearCore(text) {
      var source = normalizePayslipText(text || '');
      var month = getMonthFromItalianText(source) || 0;
      var yearMatch = source.match(/20\d{2}/);
      var year = yearMatch ? Number(yearMatch[0]) : 0;
      var monthYear = source.match(/\b(0?[1-9]|1[0-2])[\/\.-](20\d{2})\b/);
      if (monthYear) {
        month = Number(monthYear[1]) || month;
        year = Number(monthYear[2]) || year;
      }
      var inverseMonthYear = source.match(/\b(20\d{2})[\/\.-](0?[1-9]|1[0-2])\b/);
      if (inverseMonthYear) {
        year = Number(inverseMonthYear[1]) || year;
        month = Number(inverseMonthYear[2]) || month;
      }
      return { month: month, year: year };
    }
    function extractAmountCore(texts, type) {
      var sources = texts || [];
      var labels = type === 'netto'
        ? [/(?:^|\b)(?:netto|nctto|nelto|netro)(?:\s+da\s+pagare|\s+busta|\s+in\s+busta)?\D{0,28}([\d\.,]{3,16})/i, /([\d\.,]{3,16})\D{0,16}(?:netto\s+da\s+pagare|totale\s+netto|(?:^|\b)netto\b)/i]
        : [/(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+contributi|imponibile\s+inps|lordo|lorda)\D{0,32}([\d\.,]{3,16})/i, /([\d\.,]{3,16})\D{0,16}(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+contributi|imponibile\s+inps|lordo|lorda)\b/i];
      var labelTest = type === 'netto'
        ? /(?:^|\b)(?:netto|nctto|nelto|netro|da\s+pagare|totale\s+netto)\b/i
        : /(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+contributi|imponibile\s+inps|lordo|lorda)\b/i;
      var min = type === 'netto' ? 300 : 500;
      var max = 10000;
      var bestValue = 0;
      var bestScore = -Infinity;
      for (var i = 0; i < sources.length; i += 1) {
        var src = normalizePayslipText(sources[i] || '');
        for (var p = 0; p < labels.length; p += 1) {
          var m = src.match(labels[p]);
          if (m && m[1]) {
            var num = parseItalianNumber(m[1]);
            if (num >= min && num <= max) {
              bestValue = num;
              bestScore = Math.max(bestScore, 8);
            }
          }
        }
        var lines = getPayslipLines(src);
        for (var l = 0; l < lines.length; l += 1) {
          var windowText = [lines[l - 1] || '', lines[l] || '', lines[l + 1] || ''].join(' ').trim();
          if (!labelTest.test(windowText)) continue;
          var nums = getExactLineNumbers(windowText, { min: min, max: max });
          if (!nums.length) nums = getLineNumbers(windowText, { min: min, max: max });
          if (!nums.length) continue;
          for (var n = 0; n < nums.length; n += 1) {
            var picked = nums[n];
            var score = 4;
            if (/[.,]\d{2}\b/.test(windowText)) score += 0.5;
            if (type === 'netto' && /da\s+pagare|totale\s+netto/.test(windowText)) score += 2;
            if (type === 'lordo' && /imponibile|retribuzione/.test(windowText)) score += 2;
            if (type === 'lordo' && /netto/.test(windowText)) score -= 3;
            if (type === 'netto' && /lordo|imponibile/.test(windowText)) score -= 2.5;
            if (score > bestScore || (score === bestScore && picked > bestValue)) {
              bestValue = picked;
              bestScore = score;
            }
          }
        }
      }
      return bestValue || 0;
    }
    function parsePayslipCore(regionResults, fullText) {
      var regionMap = {};
      (regionResults || []).forEach(function (item) { regionMap[item.key] = normalizePayslipText(item.text || ''); });
      var allText = normalizePayslipText(fullText || '');
      var fullRegionText = regionMap.fullPage || '';
      var monthYear = extractMonthYearCore((regionMap.headerRight || '') + '\n' + fullRegionText + '\n' + allText);
      var company = pickBestCompanyCandidate([regionMap.companyBand || '', regionMap.headerLeft || '', fullRegionText, allText]);
      var netto = extractAmountCore([regionMap.amountsRight || '', regionMap.bottomRight || '', regionMap.bottomSummary || '', fullRegionText, allText], 'netto');
      var lordo = extractAmountCore([regionMap.bottomSummary || '', regionMap.amountsRight || '', regionMap.tableMain || '', fullRegionText, allText], 'lordo');
      return reducePayslipToCoreFields({
        month: monthYear.month || (new Date().getMonth() + 1),
        year: monthYear.year || new Date().getFullYear(),
        company: company,
        netto: netto,
        lordo: lordo,
        sourceText: [allText, fullRegionText].filter(Boolean).join('\n\n') + ((regionResults && regionResults.length) ? ('\n\n=== REGIONI OCR ===\n' + regionResults.map(function (item) {
          return '[' + item.label + ']\n' + (item.text || '');
        }).join('\n\n')) : '')
      });
    }

    function parsePayslipText(text) {
      var normalized = normalizePayslipText(text);
      var cleaned = normalized.replace(/\s+/g, ' ').trim();
      var lines = getPayslipLines(normalized);
      var month = getMonthFromItalianText(cleaned) || (new Date().getMonth() + 1);
      var year = matchYearFromText(cleaned);
      var explicitMonthYear = cleaned.match(/(?:periodo|mese|competenza)?\s*(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})/i);
      if (explicitMonthYear) {
        month = getMonthFromItalianText(explicitMonthYear[1]) || month;
        year = Number(explicitMonthYear[2]) || year;
      }
      var monthYear = cleaned.match(/\b(0?[1-9]|1[0-2])[\/\-.](20\d{2})\b/);
      if (monthYear) {
        month = Number(monthYear[1]);
        year = Number(monthYear[2]);
      }
      var parsed = {
        month: month,
        year: year,
        company: extractCompanyFromPayslip(normalized, lines),
        netto: 0,
        lordo: 0,
        ordinaryHours: 0,
        overtimeHours: 0,
        ferieHours: 0,
        permessoHours: 0,
        malattiaHours: 0,
        workedDays: 0,
        tfr: 0,
        sourceText: normalized
      };

      parsed.netto = extractAmountFromLine(lines, [/(?:^|\b)netto(?:\b|\s)/i, /netto\s+da\s+pagare/i, /totale\s+netto/i], { min: 300, max: 10000 }) || extractAmountFromLineWindow(lines, [/(?:^|\b)netto(?:\b|\s)/i, /netto\s+da\s+pagare/i, /totale\s+netto/i], { min: 300, max: 10000 }) || extractNumberNearLabel(cleaned, [
        /(?:netto\s+da\s+pagare|totale\s+netto|importo\s+netto|netto\s+busta|competenze\s+netto|netto)\D{0,36}([\d\.,]{1,16})/i,
        /([\d\.,]{1,16})\D{0,16}(?:netto\s+da\s+pagare|totale\s+netto|importo\s+netto|netto\s+busta|netto)\b/i
      ], { min: 300, max: 10000 });

      parsed.lordo = extractAmountFromLine(lines, [/(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+inps|imponibile\s+contributi|retribuzione\s+teorica)/i], { min: 500, max: 10000 }) || extractAmountFromLineWindow(lines, [/(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+inps|imponibile\s+contributi|retribuzione\s+teorica)/i], { min: 500, max: 10000 }) || extractNumberNearLabel(cleaned, [
        /(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+lordo|imponibile\s+irpef|imponibile\s+inps|lordo)\D{0,36}([\d\.,]{1,16})/i,
        /([\d\.,]{1,16})\D{0,16}(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+lordo|imponibile\s+irpef|imponibile\s+inps|lordo)\b/i
      ], { min: 500, max: 10000 });

      parsed.ordinaryHours = extractAmountFromLine(lines, [/\bore\s+lav\.?/i], { min: 1, max: 260, pick: 'last' }) || extractHoursFromVoiceLine(lines, [/retribuzione\s+ordinaria/i, /retribuzione\s+teorica/i, /ore\s+lav/i]) || extractNumberNearLabel(cleaned, [
        /(?:ore\s+ordinarie|ore\s+normali|retribuzione\s+ordinaria|ore\s+lav\.?|ordinarie|normali)\D{0,20}([\d\.,]{1,8})/i,
        /([\d\.,]{1,8})\D{0,12}(?:ore\s+ordinarie|ore\s+normali|retribuzione\s+ordinaria|ore\s+lav\.?|ordinarie|normali)\b/i
      ], { min: 1, max: 260 });

      parsed.overtimeHours = extractHoursFromVoiceLine(lines, [/straord/i, /lavoro\s+festivo/i]) || extractNumberNearLabel(cleaned, [
        /(?:ore\s+straordinar(?:ie|i)|straordinar(?:ie|i)|straordinario|ore\s+straord)\D{0,20}([\d\.,]{1,8})/i,
        /([\d\.,]{1,8})\D{0,12}(?:ore\s+straordinar(?:ie|i)|straordinar(?:ie|i)|straordinario|ore\s+straord)\b/i
      ], { min: 0.25, max: 120 });

      parsed.ferieHours = extractHoursFromVoiceLine(lines, [/ferie\s+godute/i, /ferie/i]) || extractNumberNearLabel(cleaned, [
        /(?:ore\s+ferie|ferie\s+godute|ferie)\D{0,20}([\d\.,]{1,8})/i,
        /([\d\.,]{1,8})\D{0,12}(?:ore\s+ferie|ferie\s+godute|ferie)\b/i
      ], { min: 0.5, max: 240 });

      parsed.permessoHours = extractHoursFromVoiceLine(lines, [/permess/i, /rol/i, /ex\s+fest/i]) || extractNumberNearLabel(cleaned, [
        /(?:permessi|permesso|rol|ex\s*festivita|ex\s*festività)\D{0,20}([\d\.,]{1,8})/i,
        /([\d\.,]{1,8})\D{0,12}(?:permessi|permesso|rol|ex\s*festivita|ex\s*festività)\b/i
      ], { min: 0.25, max: 120 });

      parsed.malattiaHours = extractHoursFromVoiceLine(lines, [/malattia/i, /assenze/i]) || extractNumberNearLabel(cleaned, [
        /(?:ore\s+malattia|malattia|assenze)\D{0,20}([\d\.,]{1,8})/i,
        /([\d\.,]{1,8})\D{0,12}(?:ore\s+malattia|malattia|assenze)\b/i
      ], { min: 0.25, max: 240 });

      parsed.workedDays = Math.round(extractAmountFromLine(lines, [/gg\.?\s*lav/i, /giorni\s+lavorati/i, /giorni\s+retribuiti/i], { min: 1, max: 31, pick: 'last' })) || Math.round(extractNumberNearLabel(cleaned, [
        /(?:giorni\s+lavorati|gg\.?\s*lavorati|gg\.?\s*lav\.?|giorni\s+retribuiti)\D{0,20}([\d\.,]{1,6})/i,
        /([\d\.,]{1,6})\D{0,12}(?:giorni\s+lavorati|gg\.?\s*lavorati|gg\.?\s*lav\.?|giorni\s+retribuiti)\b/i
      ], { min: 1, max: 31 })) || 0;

      parsed.tfr = extractTrailingAmountFromVoiceLine(lines, [/accantonamento\s+t\.?f\.?r\.?/i]) || extractAmountFromLine(lines, [/accantonamento\s+t\.?f\.?r\.?/i, /fondo\s+tfr/i, /tfr\s+spettante/i], { min: 10, max: 50000 }) || extractAmountFromLineWindow(lines, [/accantonamento\s+t\.?f\.?r\.?/i, /fondo\s+tfr/i, /tfr\s+spettante/i], { min: 10, max: 50000 }) || extractNumberNearLabel(cleaned, [
        /(?:quota\s+tfr|accantonamento\s+t\.?f\.?r\.?|fondo\s+tfr|tfr\s+spettante|tfr)\D{0,24}([\d\.,]{1,16})/i,
        /([\d\.,]{1,16})\D{0,12}(?:quota\s+tfr|accantonamento\s+t\.?f\.?r\.?|fondo\s+tfr|tfr\s+spettante|tfr)\b/i
      ], { min: 10, max: 50000 });

      lines.forEach(function (line) {
        var low = line.toLowerCase();
        var nums = getExactLineNumbers(line);
        if (!nums.length) nums = getLineNumbers(line);
        if (!nums.length) return;
        if (!parsed.netto && /\bnetto\b/.test(low)) parsed.netto = pickLastReasonableNumber(nums, { min: 300, max: 10000 });
        if (!parsed.lordo && /(lordo|imponibile|retribuzione teorica)/.test(low)) parsed.lordo = pickLastReasonableNumber(nums, { min: 500, max: 10000 });
        if (!parsed.ordinaryHours && /retribuzione ordinaria/.test(low)) parsed.ordinaryHours = extractHoursFromVoiceLine([line], [/retribuzione ordinaria/i]) || pickFirstReasonableNumber(nums, { min: 1, max: 260 });
        if (!parsed.overtimeHours && /straord/.test(low)) parsed.overtimeHours = extractHoursFromVoiceLine([line], [/straord/i]) || pickFirstReasonableNumber(nums, { min: 0.25, max: 120 });
        if (!parsed.ferieHours && /ferie/.test(low)) parsed.ferieHours = extractHoursFromVoiceLine([line], [/ferie/i]) || pickFirstReasonableNumber(nums, { min: 0.5, max: 240 });
        if (!parsed.permessoHours && /(permess|rol|ex fest)/.test(low)) parsed.permessoHours = extractHoursFromVoiceLine([line], [/(permess|rol|ex fest)/i]) || pickFirstReasonableNumber(nums, { min: 0.25, max: 120 });
        if (!parsed.malattiaHours && /(malattia|assenze)/.test(low)) parsed.malattiaHours = extractHoursFromVoiceLine([line], [/(malattia|assenze)/i]) || pickFirstReasonableNumber(nums, { min: 0.25, max: 240 });
        if (!parsed.workedDays && /(gg\.\s*lav|giorni lavorati|giorni retribuiti)/.test(low)) parsed.workedDays = Math.round(pickLastReasonableNumber(nums, { min: 1, max: 31 }));
        if (!parsed.tfr && /tfr/.test(low)) parsed.tfr = pickLastReasonableNumber(nums, { min: 10, max: 50000 });
      });
      parsed = boostPayslipParsedData(parsed, normalized, cleaned, lines);
      return parsed;
    }
    function getPayslipComparison(payslip) {
      var monthDate = getPayslipMonthDate(payslip);
      if (!monthDate) return [];
      var stats = getMonthStats(monthDate);
      var rows = [
        { label: 'Ore ordinarie', app: +(minutesToHours(stats.normalMinutes).toFixed(2)), slip: +(parseDecimalInput(payslip.ordinaryHours, 0).toFixed(2)), unit: 'h' },
        { label: 'Straordinari', app: +(minutesToHours(stats.overtimeMinutes).toFixed(2)), slip: +(parseDecimalInput(payslip.overtimeHours, 0).toFixed(2)), unit: 'h' },
        { label: 'Ferie', app: stats.ferie, slip: Math.round(parseDecimalInput(payslip.ferieHours, 0)), unit: '' },
        { label: 'Permessi', app: stats.permesso, slip: Math.round(parseDecimalInput(payslip.permessoHours, 0)), unit: '' },
        { label: 'Malattia', app: stats.malattia, slip: Math.round(parseDecimalInput(payslip.malattiaHours, 0)), unit: '' },
        { label: 'Giorni lavorati', app: stats.workedDays, slip: Math.round(parseDecimalInput(payslip.workedDays, 0)), unit: '' }
      ];
      rows.forEach(function (row) { row.diff = +((row.slip || 0) - (row.app || 0)).toFixed(2); row.ok = Math.abs(row.diff) < 0.01; });
      return rows;
    }
    function getPayslipStatus(payslip) {
      var rows = getPayslipComparison(payslip).filter(function (row) { return (row.app || row.slip); });
      if (!rows.length) return { label: 'Da verificare', tone: 'soft' };
      var hasDiff = rows.some(function (row) { return !row.ok; });
      return hasDiff ? { label: 'Differenze trovate', tone: 'alert' } : { label: 'Verificata', tone: 'ok' };
    }
    function formatMoneyEuro(value) {
      var num = parseDecimalInput(value, 0);
      if (!num) return '—';
      return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    }
    function formatSalaryEstimateMoney(value) {
      var amount = Math.max(0, Number(value) || 0);
      return amount.toLocaleString('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    function getSalaryEstimateMonthKey(year, month) {
      var safeYear = Math.min(2200, Math.max(2000, Number(year) || new Date().getFullYear()));
      var safeMonth = Math.min(12, Math.max(1, Number(month) || 1));
      return safeYear + '-' + String(safeMonth).padStart(2, '0');
    }
    function getSalaryEstimatePeriodIndex(year, month) {
      return (Number(year) || 0) * 12 + Math.min(12, Math.max(1, Number(month) || 1)) - 1;
    }
    function normalizeSalaryEstimateRates(source) {
      var rateSource = source && typeof source === 'object' ? source : {};
      var legacyHoursLimit = Math.min(744, Math.max(0, parseDecimalInput(rateSource.ordinaryHoursLimit, 0)));
      var overtimeHoursLimit = Math.min(744, Math.max(0, parseDecimalInput(
        rateSource.overtimeHoursLimit !== undefined ? rateSource.overtimeHoursLimit : legacyHoursLimit,
        0
      )));
      return {
        hourlyRate: Math.min(10000, Math.max(0, parseDecimalInput(rateSource.hourlyRate, 0))),
        overtimeRate: Math.min(10000, Math.max(0, parseDecimalInput(rateSource.overtimeRate, 0))),
        overtimeHoursLimit: overtimeHoursLimit,
        overtimeLimitEnabled: (
          rateSource.overtimeLimitEnabled === true ||
          (rateSource.overtimeLimitEnabled === undefined && rateSource.limitEnabled === true)
        ) && overtimeHoursLimit > 0
      };
    }
    function getSalaryEstimateRates(year, month) {
      var selectedIndex = getSalaryEstimatePeriodIndex(year, month);
      var selectedKey = getSalaryEstimateMonthKey(year, month);
      var settingsRates = state.settings && state.settings.salaryRatesByMonth && typeof state.settings.salaryRatesByMonth === 'object'
        ? state.settings.salaryRatesByMonth
        : {};
      var exactSetting = normalizeSalaryEstimateRates(settingsRates[selectedKey]);
      var exactPayslip = (state.payslips || []).find(function (item) {
        return Number(item.year) === Number(year) && Number(item.month) === Number(month) &&
          (parseDecimalInput(item.hourlyRate, 0) > 0 || parseDecimalInput(item.overtimeRate, 0) > 0);
      });
      var exactSlipRates = normalizeSalaryEstimateRates(exactPayslip);
      if (exactSetting.hourlyRate || exactSetting.overtimeRate || exactSetting.overtimeLimitEnabled) {
        return {
          hourlyRate: exactSetting.hourlyRate || exactSlipRates.hourlyRate,
          overtimeRate: exactSetting.overtimeRate || exactSlipRates.overtimeRate,
          overtimeHoursLimit: exactSetting.overtimeHoursLimit,
          overtimeLimitEnabled: exactSetting.overtimeLimitEnabled,
          sourceType: 'saved',
          sourceYear: Number(year),
          sourceMonth: Number(month),
          inherited: false
        };
      }
      if (exactSlipRates.hourlyRate || exactSlipRates.overtimeRate) {
        return {
          hourlyRate: exactSlipRates.hourlyRate,
          overtimeRate: exactSlipRates.overtimeRate,
          overtimeHoursLimit: 0,
          overtimeLimitEnabled: false,
          sourceType: 'payslip',
          sourceYear: Number(year),
          sourceMonth: Number(month),
          inherited: false
        };
      }
      var candidates = [];
      Object.keys(settingsRates).forEach(function (key) {
        var match = key.match(/^(\d{4})-(\d{2})$/);
        if (!match) return;
        var candidateYear = Number(match[1]);
        var candidateMonth = Number(match[2]);
        var index = getSalaryEstimatePeriodIndex(candidateYear, candidateMonth);
        var rates = normalizeSalaryEstimateRates(settingsRates[key]);
        if (index < selectedIndex && (rates.hourlyRate || rates.overtimeRate)) {
          candidates.push({ index: index, year: candidateYear, month: candidateMonth, rates: rates, sourceType: 'saved' });
        }
      });
      (state.payslips || []).forEach(function (item) {
        var candidateYear = Number(item.year) || 0;
        var candidateMonth = Number(item.month) || 0;
        var index = getSalaryEstimatePeriodIndex(candidateYear, candidateMonth);
        var rates = normalizeSalaryEstimateRates(item);
        if (candidateYear >= 2000 && candidateMonth >= 1 && candidateMonth <= 12 && index < selectedIndex && (rates.hourlyRate || rates.overtimeRate)) {
          candidates.push({ index: index, year: candidateYear, month: candidateMonth, rates: rates, sourceType: 'payslip' });
        }
      });
      candidates.sort(function (a, b) {
        return (b.index - a.index) || (a.sourceType === 'saved' ? -1 : 1);
      });
      var previous = candidates[0];
      if (!previous) {
        return {
          hourlyRate: 0,
          overtimeRate: 0,
          overtimeHoursLimit: 0,
          overtimeLimitEnabled: false,
          sourceType: 'empty',
          sourceYear: 0,
          sourceMonth: 0,
          inherited: false
        };
      }
      return {
        hourlyRate: previous.rates.hourlyRate,
        overtimeRate: previous.rates.overtimeRate,
        overtimeHoursLimit: previous.rates.overtimeHoursLimit,
        overtimeLimitEnabled: previous.rates.overtimeLimitEnabled,
        sourceType: previous.sourceType,
        sourceYear: previous.year,
        sourceMonth: previous.month,
        inherited: true
      };
    }
    function getSalaryEstimateForMonth(year, month, rateOverride) {
      var safeYear = Math.min(2200, Math.max(2000, Number(year) || new Date().getFullYear()));
      var safeMonth = Math.min(12, Math.max(1, Number(month) || 1));
      var rates = normalizeSalaryEstimateRates(rateOverride || getSalaryEstimateRates(safeYear, safeMonth));
      var ordinaryMinutes = 0;
      var overtimeRecordedMinutes = 0;
      getMonthEntries(new Date(safeYear, safeMonth - 1, 1)).forEach(function (pair) {
        var breakdown = getBreakdown(pair[1]);
        ordinaryMinutes += Math.max(0, breakdown.normal || 0) + Math.max(0, breakdown.leave || 0);
        overtimeRecordedMinutes += Math.max(0, breakdown.overtime || 0);
      });
      var overtimeLimitMinutes = rates.overtimeLimitEnabled
        ? Math.max(0, Math.round(rates.overtimeHoursLimit * 60))
        : overtimeRecordedMinutes;
      var overtimeMinutes = Math.min(overtimeRecordedMinutes, overtimeLimitMinutes);
      var overtimeExcludedMinutes = Math.max(0, overtimeRecordedMinutes - overtimeMinutes);
      var ordinaryHours = minutesToHours(ordinaryMinutes);
      var overtimeRecordedHours = minutesToHours(overtimeRecordedMinutes);
      var overtimeHours = minutesToHours(overtimeMinutes);
      var ordinaryAmount = Math.round(ordinaryHours * rates.hourlyRate * 100) / 100;
      var overtimeAmount = Math.round(overtimeHours * rates.overtimeRate * 100) / 100;
      var hasHours = ordinaryMinutes > 0 || overtimeRecordedMinutes > 0;
      var ordinaryReady = ordinaryMinutes <= 0 || rates.hourlyRate > 0;
      var overtimeReady = overtimeMinutes <= 0 || rates.overtimeRate > 0;
      var actualPayslip = (state.payslips || []).find(function (item) {
        return Number(item.year) === safeYear && Number(item.month) === safeMonth;
      }) || null;
      return {
        year: safeYear,
        month: safeMonth,
        ordinaryMinutes: ordinaryMinutes,
        overtimeRecordedMinutes: overtimeRecordedMinutes,
        overtimeExcludedMinutes: overtimeExcludedMinutes,
        overtimeMinutes: overtimeMinutes,
        ordinaryHours: ordinaryHours,
        overtimeRecordedHours: overtimeRecordedHours,
        overtimeHours: overtimeHours,
        hourlyRate: rates.hourlyRate,
        overtimeRate: rates.overtimeRate,
        overtimeHoursLimit: rates.overtimeHoursLimit,
        overtimeLimitEnabled: rates.overtimeLimitEnabled,
        ordinaryAmount: ordinaryAmount,
        overtimeAmount: overtimeAmount,
        total: Math.round((ordinaryAmount + overtimeAmount) * 100) / 100,
        hasHours: hasHours,
        complete: hasHours && ordinaryReady && overtimeReady,
        actualPayslip: actualPayslip
      };
    }
    function saveSalaryEstimateRates(year, month, hourlyRate, overtimeRate, overtimeLimitEnabled, overtimeHoursLimit) {
      var normalized = normalizeSalaryEstimateRates({
        hourlyRate: hourlyRate,
        overtimeRate: overtimeRate,
        overtimeLimitEnabled: overtimeLimitEnabled,
        overtimeHoursLimit: overtimeHoursLimit
      });
      var key = getSalaryEstimateMonthKey(year, month);
      var nextRates = Object.assign({}, state.settings.salaryRatesByMonth || {});
      if (normalized.hourlyRate || normalized.overtimeRate || normalized.overtimeLimitEnabled) {
        nextRates[key] = {
          hourlyRate: normalized.hourlyRate,
          overtimeRate: normalized.overtimeRate,
          overtimeHoursLimit: normalized.overtimeHoursLimit,
          overtimeLimitEnabled: normalized.overtimeLimitEnabled,
          updatedAt: Date.now()
        };
      } else {
        delete nextRates[key];
      }
      state.settings.salaryRatesByMonth = nextRates;
      state.settingsDraft = Object.assign({}, state.settings, { salaryRatesByMonth: Object.assign({}, nextRates) });
      saveSettings();
      return normalized;
    }
    function updateSalaryEstimatePreviewFromInputs() {
      var page = document.querySelector('[data-salary-estimate-page]');
      if (!page) return;
      var hourlyInput = document.getElementById('salaryEstimateHourlyRate');
      var overtimeInput = document.getElementById('salaryEstimateOvertimeRate');
      var limitInput = document.getElementById('salaryEstimateOvertimeHoursLimit');
      var limitToggle = document.querySelector('[data-salary-estimate-limit-toggle]');
      var hourlyRate = parseDecimalInput(hourlyInput ? hourlyInput.value : 0, 0);
      var overtimeRate = parseDecimalInput(overtimeInput ? overtimeInput.value : 0, 0);
      var ordinaryHours = Math.max(0, Number(page.dataset.ordinaryHours) || 0);
      var overtimeRecordedHours = Math.max(0, Number(page.dataset.overtimeRecordedHours) || Number(page.dataset.overtimeHours) || 0);
      var limitEnabled = Boolean(limitToggle && limitToggle.getAttribute('aria-pressed') === 'true');
      var overtimeHoursLimit = Math.min(744, Math.max(0, parseDecimalInput(limitInput ? limitInput.value : 0, 0)));
      var limitReady = !limitEnabled || overtimeHoursLimit > 0;
      var overtimeHours = limitEnabled && overtimeHoursLimit > 0
        ? Math.min(overtimeRecordedHours, overtimeHoursLimit)
        : overtimeRecordedHours;
      var overtimeExcludedHours = Math.max(0, overtimeRecordedHours - overtimeHours);
      var ordinaryAmount = Math.round(ordinaryHours * hourlyRate * 100) / 100;
      var overtimeAmount = Math.round(overtimeHours * overtimeRate * 100) / 100;
      var complete = limitReady && (ordinaryHours <= 0 || hourlyRate > 0) && (overtimeHours <= 0 || overtimeRate > 0);
      var hasHours = ordinaryHours > 0 || overtimeRecordedHours > 0;
      var ordinaryValue = document.querySelector('[data-salary-estimate-ordinary-total]');
      var overtimeValue = document.querySelector('[data-salary-estimate-overtime-total]');
      var totalValue = document.querySelector('[data-salary-estimate-total]');
      var totalNote = document.querySelector('[data-salary-estimate-total-note]');
      var ordinaryFormula = document.querySelector('[data-salary-estimate-ordinary-formula]');
      var overtimeDuration = document.querySelector('[data-salary-estimate-overtime-duration]');
      var overtimeFormula = document.querySelector('[data-salary-estimate-overtime-formula]');
      var overtimeMetric = document.querySelector('[data-salary-estimate-overtime-metric]');
      var limitImpact = document.querySelector('[data-salary-estimate-limit-impact]');
      var limitImpactText = document.querySelector('[data-salary-estimate-limit-impact-text]');
      var liveNote = document.querySelector('[data-salary-estimate-live-note]');
      if (ordinaryValue) ordinaryValue.textContent = hourlyRate > 0 || ordinaryHours <= 0 ? formatSalaryEstimateMoney(ordinaryAmount) : '--';
      if (overtimeValue) overtimeValue.textContent = overtimeRate > 0 || overtimeHours <= 0 ? formatSalaryEstimateMoney(overtimeAmount) : '--';
      if (totalValue) totalValue.textContent = hasHours && complete ? formatSalaryEstimateMoney(ordinaryAmount + overtimeAmount) : (hasHours ? '--' : formatSalaryEstimateMoney(0));
      if (totalNote) {
        totalNote.textContent = !hasHours
          ? 'Nessuna ora registrata in questo mese'
          : (limitReady
            ? (formatDuration(Math.round((ordinaryHours + overtimeHours) * 60)) + ' conteggiate nel calcolo')
            : 'Inserisci il limite mensile per completare il calcolo');
      }
      if (ordinaryFormula) {
        ordinaryFormula.textContent = ordinaryHours.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' +
          (hourlyRate > 0 ? formatSalaryEstimateMoney(hourlyRate) : '--');
      }
      if (overtimeDuration) overtimeDuration.textContent = formatDuration(Math.round(overtimeHours * 60));
      if (overtimeFormula) {
        overtimeFormula.textContent = overtimeHours.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' +
          (overtimeRate > 0 ? formatSalaryEstimateMoney(overtimeRate) : '--');
      }
      if (overtimeMetric) {
        overtimeMetric.innerHTML = '<b>' + escapeHtml(formatDuration(Math.round(overtimeHours * 60))) + '</b> ' +
          (limitEnabled ? ('su ' + escapeHtml(formatDuration(Math.round(overtimeRecordedHours * 60))) + ' straordinarie') : 'straordinarie');
      }
      if (limitImpact) limitImpact.classList.toggle('is-visible', limitEnabled && limitReady);
      if (limitImpactText) {
        limitImpactText.textContent = overtimeExcludedHours > 0
          ? (formatDuration(Math.round(overtimeExcludedHours * 60)) + ' di straordinario non entrano nella stima.')
          : 'Il limite non esclude ancora nessuna ora straordinaria.';
      }
      if (liveNote) {
        liveNote.textContent = !limitReady
          ? 'Inserisci quante ore straordinarie vuoi conteggiare al massimo.'
          : (!hasHours
            ? 'La stima si aggiornera quando registri delle ore.'
            : (complete ? 'Stima aggiornata con tariffe e limite del mese.' : 'Inserisci le tariffe mancanti per completare la stima.'));
      }
      page.classList.toggle('is-incomplete', hasHours && !complete);
    }
    function getPayrollCalculatorApi() {
      return typeof globalThis !== 'undefined' && globalThis.GestOrePayroll
        ? globalThis.GestOrePayroll
        : null;
    }
    function getPayrollEstimateDefaultsForMonth(year, month) {
      var api = getPayrollCalculatorApi();
      var defaults = api && api.DEFAULT_PAYROLL_INPUT
        ? Object.assign({}, api.DEFAULT_PAYROLL_INPUT)
        : {
            baseMonthlyGross: 1766,
            salaryMonths: 14,
            overtimeHoursMonthly: 20,
            overtimeHourlyRate: 10.98,
            monthsWithOvertime: 12,
            otherAnnualGross: 0,
            employeeContributionRate: 9.19,
            region: 'Lombardia',
            municipality: '',
            taxYear: 2026,
            employmentDays: 365,
            employmentType: 'permanent',
            otherAnnualDeductions: 0,
            annualReimbursements: 0
          };
      var selectedYear = Number(year) || new Date().getFullYear();
      if (typeof globalThis !== 'undefined' && globalThis.GestOreTaxConfigs && globalThis.GestOreTaxConfigs[selectedYear]) {
        defaults.taxYear = selectedYear;
      }
      var legacyRates = getSalaryEstimateRates(year, month);
      if (legacyRates.overtimeRate > 0) defaults.overtimeHourlyRate = legacyRates.overtimeRate;
      if (legacyRates.overtimeLimitEnabled && legacyRates.overtimeHoursLimit > 0) {
        defaults.overtimeHoursMonthly = legacyRates.overtimeHoursLimit;
      }
      return api && typeof api.normalizePayrollInput === 'function'
        ? api.normalizePayrollInput(defaults)
        : defaults;
    }
    function getPayrollEstimateConfig(year, month) {
      var selectedIndex = getSalaryEstimatePeriodIndex(year, month);
      var selectedKey = getSalaryEstimateMonthKey(year, month);
      var stored = state.settings && state.settings.payrollEstimateByMonth && typeof state.settings.payrollEstimateByMonth === 'object'
        ? state.settings.payrollEstimateByMonth
        : {};
      var api = getPayrollCalculatorApi();
      var exact = stored[selectedKey];
      if (exact && typeof exact === 'object') {
        return Object.assign(
          api && typeof api.normalizePayrollInput === 'function' ? api.normalizePayrollInput(exact) : exact,
          {
            sourceType: 'saved',
            sourceYear: Number(year),
            sourceMonth: Number(month),
            inherited: false
          }
        );
      }
      var previous = Object.keys(stored).map(function (key) {
        var match = key.match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;
        var itemYear = Number(match[1]);
        var itemMonth = Number(match[2]);
        var index = getSalaryEstimatePeriodIndex(itemYear, itemMonth);
        if (index >= selectedIndex) return null;
        return {
          index: index,
          year: itemYear,
          month: itemMonth,
          config: stored[key]
        };
      }).filter(Boolean).sort(function (a, b) { return b.index - a.index; })[0];
      if (previous) {
        return Object.assign(
          api && typeof api.normalizePayrollInput === 'function'
            ? api.normalizePayrollInput(previous.config)
            : previous.config,
          {
            sourceType: 'saved',
            sourceYear: previous.year,
            sourceMonth: previous.month,
            inherited: true
          }
        );
      }
      return Object.assign(getPayrollEstimateDefaultsForMonth(year, month), {
        sourceType: 'default',
        sourceYear: Number(year),
        sourceMonth: Number(month),
        inherited: false
      });
    }
    function getPayrollNetEstimateForMonth(year, month, configOverride) {
      var api = getPayrollCalculatorApi();
      var config = configOverride || getPayrollEstimateConfig(year, month);
      if (!api || typeof api.calculatePayrollEstimate !== 'function') {
        return {
          valid: false,
          incomplete: true,
          errors: { calculator: 'Motore di calcolo non disponibile.' },
          input: config
        };
      }
      var estimate = api.calculatePayrollEstimate(config);
      estimate.configMeta = config;
      estimate.actualPayslip = (state.payslips || []).find(function (item) {
        return Number(item.year) === Number(year) && Number(item.month) === Number(month);
      }) || null;
      return estimate;
    }
    function savePayrollEstimateConfig(year, month, source) {
      var api = getPayrollCalculatorApi();
      if (!api || typeof api.validatePayrollInput !== 'function') {
        return { valid: false, errors: { calculator: 'Motore di calcolo non disponibile.' } };
      }
      var checked = api.validatePayrollInput(source);
      if (!checked.valid) return checked;
      var key = getSalaryEstimateMonthKey(year, month);
      var next = Object.assign({}, state.settings.payrollEstimateByMonth || {});
      next[key] = Object.assign({}, checked.input, { updatedAt: Date.now() });
      state.settings.payrollEstimateByMonth = next;
      state.settingsDraft = Object.assign({}, state.settings, {
        payrollEstimateByMonth: Object.assign({}, next)
      });
      saveSettings();
      return {
        valid: true,
        input: checked.input,
        estimate: getPayrollNetEstimateForMonth(year, month, checked.input)
      };
    }
    function collectPayrollCalculatorInputFromDom() {
      var source = {};
      document.querySelectorAll('[data-payroll-field]').forEach(function (field) {
        var key = field.dataset.payrollField;
        if (!key) return;
        source[key] = field.value;
      });
      return source;
    }
    function refreshPayrollMunicipalityOptions() {
      var api = getPayrollCalculatorApi();
      var list = document.getElementById('payrollMunicipalities');
      if (!api || typeof api.getMunicipalityOptions !== 'function' || !list) return;
      var yearField = document.querySelector('[data-payroll-field="taxYear"]');
      var regionField = document.querySelector('[data-payroll-field="region"]');
      var options = api.getMunicipalityOptions(
        yearField ? yearField.value : 0,
        null,
        regionField ? regionField.value : ''
      );
      list.innerHTML = options.map(function (item) {
        return '<option value="' + escapeHtml(item.municipalityName) + '">' +
          escapeHtml(item.municipalityCode + ' - ' + item.province) + '</option>';
      }).join('');
    }
    function setPayrollEstimateText(key, value) {
      document.querySelectorAll('[data-payroll-value="' + key + '"]').forEach(function (node) {
        node.textContent = value;
      });
    }
    function getPayrollNegativeMoney(api, cents) {
      var value = Math.max(0, Number(cents) || 0);
      return value > 0 ? ('− ' + api.formatCurrencyFromCents(value)) : api.formatCurrencyFromCents(0);
    }
    function renderPayrollEstimateValidation(errors) {
      var source = errors || {};
      document.querySelectorAll('[data-payroll-field]').forEach(function (field) {
        var message = source[field.dataset.payrollField] || '';
        field.setAttribute('aria-invalid', message ? 'true' : 'false');
        var wrapper = field.closest('.payroll-calculator-field');
        if (wrapper) wrapper.classList.toggle('has-error', Boolean(message));
      });
      var status = document.querySelector('[data-payslip-estimate-status]');
      var firstError = Object.keys(source).map(function (key) { return source[key]; }).filter(Boolean)[0] || '';
      if (status) {
        status.textContent = firstError;
        status.classList.toggle('is-visible', Boolean(firstError));
        status.classList.toggle('is-error', Boolean(firstError));
      }
    }
    function updatePayrollCalculatorPreviewFromInputs() {
      var page = document.querySelector('[data-payroll-calculator-page]');
      var api = getPayrollCalculatorApi();
      if (!page || !api || typeof api.calculatePayrollEstimate !== 'function') return null;
      var estimate = api.calculatePayrollEstimate(collectPayrollCalculatorInputFromDom());
      renderPayrollEstimateValidation(estimate.errors);
      page.classList.toggle('is-invalid', !estimate.valid);
      if (!estimate.valid) {
        setPayrollEstimateText('netMonth', '--');
        return estimate;
      }
      var month = estimate.monthlyBreakdown.withOvertime;
      setPayrollEstimateText('netMonth', api.formatCurrency(estimate.estimatedMonthWithOvertimeNet));
      setPayrollEstimateText('baseMonthlyGross', api.formatCurrency(estimate.baseMonthlyGross));
      setPayrollEstimateText('overtimeMonthlyGross', api.formatCurrency(estimate.overtimeMonthlyGross));
      setPayrollEstimateText('totalMonthlyGross', api.formatCurrency(estimate.totalMonthlyGross));
      setPayrollEstimateText('monthlyContributions', getPayrollNegativeMoney(api, month.contributionCents));
      setPayrollEstimateText('monthlyIrpef', getPayrollNegativeMoney(api, month.irpefCents));
      setPayrollEstimateText(
        'monthlyRegionalTax',
        estimate.regionalAvailable ? getPayrollNegativeMoney(api, month.regionalCents) : 'Non calcolata'
      );
      setPayrollEstimateText(
        'monthlyMunicipalTax',
        estimate.municipalityConfig ? getPayrollNegativeMoney(api, month.municipalCents) : 'Non calcolata'
      );
      setPayrollEstimateText('monthlyOtherDeductions', getPayrollNegativeMoney(api, month.otherDeductionsCents));
      setPayrollEstimateText(
        'monthlyReimbursements',
        month.reimbursementsCents > 0
          ? ('+ ' + api.formatCurrencyFromCents(month.reimbursementsCents))
          : api.formatCurrencyFromCents(0)
      );
      setPayrollEstimateText('annualNet', api.formatCurrency(estimate.estimatedAnnualNet));
      setPayrollEstimateText('baseAnnualGross', api.formatCurrency(estimate.baseAnnualGross));
      setPayrollEstimateText('overtimeAnnualGross', api.formatCurrency(estimate.overtimeAnnualGross));
      setPayrollEstimateText('totalAnnualGross', api.formatCurrency(estimate.totalAnnualGross));
      setPayrollEstimateText('annualContributions', api.formatCurrency(estimate.annualContributions));
      setPayrollEstimateText('annualTaxableIncome', api.formatCurrency(estimate.annualTaxableIncome));
      setPayrollEstimateText('annualGrossIrpef', api.formatCurrency(estimate.annualGrossIrpef));
      setPayrollEstimateText('employeeDeduction', api.formatCurrency(estimate.employeeDeduction));
      setPayrollEstimateText('annualNetIrpef', api.formatCurrency(estimate.annualNetIrpef));
      setPayrollEstimateText(
        'annualRegionalTax',
        estimate.regionalAvailable ? api.formatCurrency(estimate.annualRegionalTax) : 'Non calcolata'
      );
      setPayrollEstimateText(
        'annualMunicipalTax',
        estimate.municipalityConfig ? api.formatCurrency(estimate.annualMunicipalTax) : 'Non calcolata'
      );
      setPayrollEstimateText(
        'calcMunicipal',
        estimate.municipalityConfig
          ? ('Acconto ' + api.formatCurrency(estimate.annualMunicipalAdvance) +
            ' · saldo ' + api.formatCurrency(estimate.annualMunicipalBalance))
          : ''
      );
      setPayrollEstimateText('annualOtherDeductions', api.formatCurrency(estimate.annualOtherDeductions));
      setPayrollEstimateText('annualReimbursements', api.formatCurrency(estimate.annualReimbursements));
      setPayrollEstimateText('ordinaryMonthNet', api.formatCurrency(estimate.estimatedOrdinaryMonthNet));
      setPayrollEstimateText('monthWithOvertimeNet', api.formatCurrency(estimate.estimatedMonthWithOvertimeNet));
      setPayrollEstimateText(
        'thirteenthNet',
        estimate.input.salaryMonths >= 13 ? api.formatCurrency(estimate.estimatedThirteenthNet) : 'Non prevista'
      );
      setPayrollEstimateText(
        'fourteenthNet',
        estimate.input.salaryMonths >= 14 ? api.formatCurrency(estimate.estimatedFourteenthNet) : 'Non prevista'
      );
      setPayrollEstimateText(
        'calcBaseAnnual',
        api.formatCurrency(estimate.baseMonthlyGross) + ' × ' + estimate.input.salaryMonths + ' = ' +
          api.formatCurrency(estimate.baseAnnualGross)
      );
      setPayrollEstimateText(
        'calcOvertimeAnnual',
        estimate.input.overtimeHoursMonthly.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' h × ' +
          api.formatCurrency(estimate.input.overtimeHourlyRate) + ' × ' + estimate.input.monthsWithOvertime +
          ' = ' + api.formatCurrency(estimate.overtimeAnnualGross)
      );
      setPayrollEstimateText(
        'calcContributions',
        api.formatCurrency(estimate.totalAnnualGross) + ' × ' +
          estimate.input.employeeContributionRate.toLocaleString('it-IT', { maximumFractionDigits: 2 }) +
          '% = ' + api.formatCurrency(estimate.annualContributions)
      );
      setPayrollEstimateText(
        'calcTaxable',
        api.formatCurrency(estimate.totalAnnualGross) + ' − ' +
          api.formatCurrency(estimate.annualContributions) + ' = ' +
          api.formatCurrency(estimate.annualTaxableIncome)
      );
      setPayrollEstimateText(
        'calcIrpef',
        api.formatCurrency(estimate.annualGrossIrpef) + ' − ' +
          api.formatCurrency(estimate.employeeDeduction) + ' = ' +
          api.formatCurrency(estimate.annualNetIrpef)
      );
      var completeness = document.querySelector('[data-payroll-estimate-completeness]');
      if (completeness) {
        completeness.textContent = estimate.incomplete
          ? 'Stima parziale: alcune addizionali non sono incluse'
          : 'Stima completa con le tabelle selezionate';
        completeness.classList.toggle('is-complete', !estimate.incomplete);
      }
      var notice = document.querySelector('[data-payroll-municipal-notice]');
      if (notice) {
        notice.textContent = estimate.incompleteReasons.join(' ');
        notice.classList.toggle('is-visible', estimate.incompleteReasons.length > 0);
      }
      var brackets = document.querySelector('[data-payroll-irpef-brackets]');
      if (brackets) {
        brackets.innerHTML = estimate.irpefBreakdown.map(function (row) {
          var range = row.to === null
            ? ('oltre ' + api.formatCurrency(row.from))
            : (api.formatCurrency(row.from) + ' – ' + api.formatCurrency(row.to));
          return '<span><i>' + escapeHtml(range) + ' · ' + row.rate + '%</i><b>' +
            escapeHtml(api.formatCurrencyFromCents(row.taxCents)) + '</b></span>';
        }).join('');
      }
      return estimate;
    }
    function ensurePayslipDraft() {
      if (!state.payslipDraft) {
        state.payslipDraft = { id: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), company: '', netto: 0, lordo: 0, ordinaryHours: 0, overtimeHours: 0, ferieHours: 0, permessoHours: 0, malattiaHours: 0, workedDays: 0, tfr: 0, sourceText: '', imageData: '', fileName: '', createdAt: Date.now() };
      }
      return state.payslipDraft;
    }
    function resetPayslipDraft() {
      state.payslipDraft = { id: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), company: '', netto: 0, lordo: 0, ordinaryHours: 0, overtimeHours: 0, ferieHours: 0, permessoHours: 0, malattiaHours: 0, workedDays: 0, tfr: 0, sourceText: '', imageData: '', fileName: '', createdAt: Date.now() };
      state.payslipStatus = '';
    }
    function mergePayslipParsedData(parsed, extra) {
      ensurePayslipDraft();
      state.payslipDraft = Object.assign({}, state.payslipDraft, parsed || {}, extra || {});
    }
    function savePayslipDraft() {
      ensurePayslipDraft();
      var draft = Object.assign({}, state.payslipDraft);
      if (!draft.id) draft.id = 'payslip-' + Date.now();
      var index = (state.payslips || []).findIndex(function (item) { return item.id === draft.id; });
      if (index >= 0) state.payslips[index] = draft;
      else state.payslips.unshift(draft);
      state.payslips.sort(function (a, b) {
        var ad = getPayslipMonthDate(a), bd = getPayslipMonthDate(b);
        return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
      });
      savePayslips();
      state.payslipStatus = 'Busta paga salvata.';
      state.activeTab = 'payslips';
      render();
    }
    async function deletePayslip(id) {
      if (state.payslipBusy) return false;
      var payslipId = String(id || '');
      if (!payslipId) return false;
      state.payslipBusy = true;
      state.payslipStatus = 'Eliminazione dal database...';
      var loadingToken = beginPayslipOperation('Elimino la busta', 'Aggiorno l\'archivio del tuo profilo', { kind: 'delete' });
      render();
      try {
        await deletePayslipRecordFromServer(payslipId);
      } catch (err) {
        endPayslipOperation(loadingToken);
        state.payslipBusy = false;
        state.payslipDeletePendingId = '';
        state.payslipStatus = 'Eliminazione non confermata: ' + (err.message || getServerSyncFailureMessage());
        render();
        return false;
      }
      endPayslipOperation(loadingToken);
      state.payslips = (state.payslips || []).filter(function (item) { return item.id !== payslipId; });
      persistPayslipsLocally();
      saveSafetyBundle();
      if (state.payslipDraft && state.payslipDraft.id === payslipId) resetPayslipDraft(true);
      if (state.payslipDetailId === payslipId) state.payslipDetailId = '';
      state.payslipBusy = false;
      state.payslipEditorOpen = false;
      state.payslipDeletePendingId = '';
      state.payslipViewer = null;
      state.payslipStatus = 'Busta eliminata dal database.';
      render();
      return true;
    }
    function readFileAsDataURL(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    async function preparePayslipImage(dataUrl) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          function renderImage(maxSide, quality) {
            var ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
            var width = Math.max(1, Math.round(img.width * ratio));
            var height = Math.max(1, Math.round(img.height * ratio));
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var context = canvas.getContext('2d', { alpha: false });
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
            context.drawImage(img, 0, 0, width, height);
            return canvas.toDataURL('image/jpeg', quality);
          }
          resolve({
            preview: renderImage(1800, 0.84),
            thumbnail: renderImage(360, 0.7)
          });
        };
        img.onerror = function () {
          resolve({ preview: dataUrl, thumbnail: dataUrl });
        };
        img.src = dataUrl;
      });
    }
    async function processPayslipFileLegacy(file) {
      return processPayslipFile(file);
      /* Legacy OCR flow retained below only for migration history. */
      if (!file) return;
      ensurePayslipDraft();
      state.payslipBusy = true;
      state.payslipStatus = 'Sto leggendo la busta paga...';
      render();
      try {
        var dataUrl = await readFileAsDataURL(file);
        var prepared = (file.type && file.type.indexOf('image/') === 0)
          ? await preparePayslipImage(dataUrl)
          : { preview: '', ocr: '' };
        mergePayslipParsedData({}, { imageData: prepared.preview || dataUrl, fileName: file.name || 'busta paga' });
        if (file.type && file.type.indexOf('image/') === 0) {
          var Tesseract = await loadTesseract();
          var sources = [prepared.ocr || dataUrl, prepared.ocrAlt || dataUrl].filter(Boolean);
          var bestParsed = null;
          var bestText = '';
          var bestScore = -1;
          for (var attempt = 0; attempt < sources.length; attempt += 1) {
            state.payslipStatus = 'Sto leggendo la busta paga... tentativo ' + (attempt + 1) + '/' + sources.length;
            render();
            var result = await Tesseract.recognize(sources[attempt], 'ita', {
              logger: function (m) {
                if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
                  state.payslipStatus = 'Sto leggendo la busta paga... ' + Math.round(m.progress * 100) + '%';
                  render();
                }
              }
            });
            var extractedText = (result && result.data && result.data.text) || '';
            var parsed = parsePayslipText(extractedText);
            var score = ['netto','lordo','ordinaryHours','overtimeHours','ferieHours','permessoHours','malattiaHours','workedDays','tfr'].filter(function (key) {
              return Number(parsed[key] || 0) > 0;
            }).length;
            if ((parsed.company || '').length > 2) score += 0.5;
            if (parsed.month && parsed.year) score += 0.5;
            if (score > bestScore) {
              bestScore = score;
              bestParsed = parsed;
              bestText = extractedText;
            }
          }

          var regionResults = [];
          var regionSources = (prepared.regions || []).filter(function (item) { return !!item.image; });
          for (var r = 0; r < regionSources.length; r += 1) {
            state.payslipStatus = 'Sto leggendo la busta paga... sezione ' + (r + 1) + '/' + regionSources.length;
            render();
            try {
              var regionResult = await Tesseract.recognize(regionSources[r].image, 'ita');
              regionResults.push({
                key: regionSources[r].key,
                label: regionSources[r].label,
                text: (regionResult && regionResult.data && regionResult.data.text) || ''
              });
            } catch (regionErr) {}
          }

          bestParsed = bestParsed || parsePayslipText(bestText || '');
          bestParsed = parsePayslipRegionTexts(regionResults, bestParsed);
          bestParsed.sourceText = (bestText || bestParsed.sourceText || '') + (regionResults.length ? ('\n\n=== REGIONI OCR ===\n' + regionResults.map(function (item) {
            return '[' + item.label + ']\n' + (item.text || '');
          }).join('\n\n')) : '');
          mergePayslipParsedData(bestParsed, { imageData: prepared.preview || dataUrl, fileName: file.name || 'busta paga' });
          var foundValues = ['netto','lordo','ordinaryHours','overtimeHours','ferieHours','permessoHours','malattiaHours','workedDays','tfr'].filter(function (key) {
            return Number(bestParsed[key] || 0) > 0;
          }).length;
          state.payslipStatus = foundValues >= 4
            ? 'Ho estratto i dati principali dalla foto. Controllali bene prima di salvare.'
            : 'Ho letto la foto ma ho trovato ancora pochi campi affidabili. Correggi i valori a mano dove serve.';
        } else {
          state.payslipStatus = 'Per ora la lettura automatica funziona con le foto. Il PDF è stato caricato, ma i campi vanno compilati a mano.';
        }
      } catch (err) {
        state.payslipStatus = err && err.message === 'ocr-unavailable'
          ? 'Il lettore automatico non è riuscito a caricare il motore OCR. Riprova con connessione attiva oppure compila i campi a mano.'
          : 'Non sono riuscito a leggere la busta in automatico. Riprova con una foto più nitida e ben dritta, oppure compila i campi a mano.';
      }
      state.payslipBusy = false;
      state.activeTab = 'payslips';
      render();
    }

    function getPayslipCoreFieldScore(parsed) {
      var candidate = parsed || {};
      var score = 0;
      if (Number(candidate.month || 0) > 0) score += 1;
      if (Number(candidate.year || 0) > 0) score += 1;
      if (String(candidate.company || '').trim()) score += 1;
      if (parseDecimalInput(candidate.netto, 0) > 0) score += 1;
      if (parseDecimalInput(candidate.lordo, 0) > 0) score += 1;
      return score;
    }
    function getPayslipMissingCoreFields(parsed) {
      var candidate = reducePayslipToCoreFields(parsed || {});
      var missing = [];
      if (!String(candidate.company || '').trim()) missing.push('ditta');
      if (parseDecimalInput(candidate.netto, 0) <= 0) missing.push('netto');
      if (parseDecimalInput(candidate.lordo, 0) <= 0) missing.push('lordo');
      return missing;
    }
    function makeEmptyPayslipDraft() {
      return Object.assign({
        id: '',
        photos: [],
        imageData: '',
        fileName: '',
        hourlyRate: 0,
        overtimeRate: 0,
        reusePreviousRates: false,
        notes: '',
        createdAt: Date.now()
      }, reducePayslipToCoreFields({
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        company: '',
        netto: 0,
        lordo: 0,
        sourceText: ''
      }));
    }
    function getPayslipStatus(payslip) {
      var score = getPayslipCoreFieldScore(payslip);
      var hasImage = normalizePayslipPhotos(payslip).length > 0;
      if (score >= 5) return { label: hasImage ? 'Foto + dati' : 'Completa', tone: 'ok' };
      if (score >= 3) return { label: 'Da controllare', tone: hasImage ? 'alert' : 'soft' };
      return { label: hasImage ? 'Foto salvata' : 'Da completare', tone: 'soft' };
    }
    function ensurePayslipDraft() {
      if (!state.payslipDraft) state.payslipDraft = makeEmptyPayslipDraft();
      state.payslipDraft = clonePayslipForDraft(state.payslipDraft);
      return state.payslipDraft;
    }
    function resetPayslipDraft(discardPending) {
      if (discardPending === true) clearPendingPayslipDraft();
      var pending = discardPending === true ? null : loadPendingPayslipDraft();
      state.payslipDraft = pending ? clonePayslipForDraft(pending) : makeEmptyPayslipDraft();
      state.payslipStatus = pending ? 'Riprendo la busta non ancora confermata dal database.' : '';
    }
    function mergePayslipParsedData(parsed, extra) {
      var current = ensurePayslipDraft();
      var normalized = reducePayslipToCoreFields(Object.assign({}, current, parsed || {}));
      state.payslipDraft = clonePayslipForDraft(Object.assign({}, makeEmptyPayslipDraft(), current, normalized, extra || {}));
    }
    function commitPayslipEditorInputs() {
      var draft = ensurePayslipDraft();
      var month = document.getElementById('payslipMonth');
      var year = document.getElementById('payslipYear');
      var netto = document.getElementById('payslipNetto');
      var hourly = document.getElementById('payslipHourlyRate');
      var overtime = document.getElementById('payslipOvertimeRate');
      var notes = document.getElementById('payslipNotes');
      if (month) draft.month = Math.max(1, Math.min(12, Number(month.value) || (new Date().getMonth() + 1)));
      if (year) draft.year = Math.max(2000, Math.min(2100, Number(year.value) || new Date().getFullYear()));
      if (netto) draft.netto = parseDecimalInput(netto.value, 0);
      if (hourly) draft.hourlyRate = parseDecimalInput(hourly.value, 0);
      if (overtime) draft.overtimeRate = parseDecimalInput(overtime.value, 0);
      if (notes) draft.notes = String(notes.value || '').slice(0, 1000);
      return draft;
    }
    async function savePayslipDraft() {
      commitPayslipEditorInputs();
      var draft = clonePayslipForDraft(Object.assign({}, makeEmptyPayslipDraft(), state.payslipDraft));
      var photos = normalizePayslipPhotos(draft);
      if (!photos.length) {
        state.payslipStatus = 'Aggiungi prima la foto della busta paga.';
        render();
        return false;
      }
      if (parseDecimalInput(draft.netto, 0) <= 0) {
        state.payslipStatus = 'Inserisci l\'importo ricevuto.';
        render();
        return false;
      }
      var previousPayslips = (state.payslips || []).slice();
      var existing = (state.payslips || []).find(function (item) { return item.id === draft.id; }) || {};
      var saved = Object.assign({}, existing, draft, reducePayslipToCoreFields(draft), {
        id: draft.id || ('payslip-' + Date.now()),
        photos: photos,
        imageData: photos[0].data,
        fileName: photos[0].fileName,
        createdAt: draft.createdAt || Date.now()
      });
      var index = (state.payslips || []).findIndex(function (item) { return item.id === saved.id; });
      if (index >= 0) state.payslips[index] = saved;
      else state.payslips.unshift(saved);
      state.payslips.sort(function (a, b) {
        var ad = getPayslipMonthDate(a), bd = getPayslipMonthDate(b);
        return (bd ? bd.getTime() : 0) - (ad ? ad.getTime() : 0);
      });
      state.payslipDraft = clonePayslipForDraft(saved);
      state.payslipBusy = true;
      state.payslipStatus = 'Salvataggio nel database...';
      var loadingToken = beginPayslipOperation('Salvo la busta paga', 'Invio foto e importo al database personale');
      persistPendingPayslipDraft(saved);
      persistPayslipsLocally();
      saveSafetyBundle();
      render();
      var confirmed = false;
      try {
        var confirmation = await persistPayslipRecordToServer(saved);
        confirmed = Boolean(confirmation && confirmation.ok && confirmation.payslipId === saved.id);
      } catch (err) {
        serverSyncLastError = err && err.message ? err.message : serverSyncLastError;
        confirmed = false;
      }
      confirmed = confirmed && (state.payslips || []).some(function (item) { return item.id === saved.id; });
      state.payslipBusy = false;
      endPayslipOperation(loadingToken);
      if (!confirmed) {
        state.payslips = previousPayslips;
        persistPayslipsLocally();
        saveSafetyBundle();
        state.payslipDraft = clonePayslipForDraft(saved);
        state.payslipStatus = 'La busta non e stata confermata dal database. ' + getServerSyncFailureMessage() + ' Le foto e i valori restano qui: riprova senza reinserirli.';
        render();
        return false;
      }
      saveSafetyBundle();
      clearPendingPayslipDraft();
      if (state.account && state.account.storage) state.account.storage.loaded = false;
      state.payslipDetailId = saved.id;
      state.payslipEditorOpen = false;
      state.payslipDraft = makeEmptyPayslipDraft();
      state.payslipStatus = 'Busta paga salvata nel database.';
      state.activeTab = 'payslips';
      render();
      return true;
    }
    async function processPayslipFileOcrLegacy(file) {
      return processPayslipFile(file);
      /* Legacy OCR flow retained below only for migration history. */
      if (!file) return;
      ensurePayslipDraft();
      state.payslipBusy = true;
      state.payslipStatus = 'Sto leggendo la foto della busta...';
      render();
      try {
        if (!file.type || file.type.indexOf('image/') !== 0) throw new Error('image-only');
        var dataUrl = await readFileAsDataURL(file);
        var prepared = await preparePayslipImage(dataUrl);
        mergePayslipParsedData({}, { imageData: prepared.preview || dataUrl, fileName: file.name || 'busta-paga.jpg' });
        var Tesseract = await loadTesseract();
        var sources = [
          { label: 'contrasto forte', image: prepared.ocr || dataUrl },
          { label: 'contrasto morbido', image: prepared.ocrAlt || dataUrl },
          { label: 'pagina intera', image: prepared.ocrWide || dataUrl }
        ].filter(function (item, index, list) {
          if (!item.image) return false;
          return list.findIndex(function (other) { return other.image === item.image; }) === index;
        });
        var attemptCandidates = [];
        var bestText = '';
        var bestScore = -1;
        for (var attempt = 0; attempt < sources.length; attempt += 1) {
          state.payslipStatus = 'Sto leggendo la foto... ' + sources[attempt].label + ' (' + (attempt + 1) + '/' + sources.length + ')';
          render();
          var attemptResult = await Tesseract.recognize(sources[attempt].image, 'ita', {
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1',
            logger: function (m) {
              if (m && m.status === 'recognizing text' && typeof m.progress === 'number') {
                state.payslipStatus = 'Sto leggendo la foto... ' + Math.round(m.progress * 100) + '%';
                render();
              }
            }
          });
          var extractedText = (attemptResult && attemptResult.data && attemptResult.data.text) || '';
          var parsedCore = parsePayslipCore([], extractedText);
          var parsedLegacy = reducePayslipToCoreFields(parsePayslipText(extractedText));
          var attemptMerged = mergePayslipCoreCandidates([
            { parsed: parsedCore, weight: 2.4 },
            { parsed: parsedLegacy, weight: 1.6 }
          ], file.name);
          attemptCandidates.push({ parsed: attemptMerged, weight: 2.6 });
          var score = getPayslipCoreFieldScore(attemptMerged);
          if (score > bestScore) {
            bestScore = score;
            bestText = extractedText;
          }
        }
        var regionResults = [];
        var regionSources = (prepared.regions || []).filter(function (item) { return !!item.image; });
        for (var r = 0; r < regionSources.length; r += 1) {
          state.payslipStatus = 'Sto leggendo la foto... sezione ' + (r + 1) + '/' + regionSources.length;
          render();
          try {
            var regionResult = await Tesseract.recognize(regionSources[r].image, 'ita', {
              tessedit_pageseg_mode: '6',
              preserve_interword_spaces: '1'
            });
            regionResults.push({
              key: regionSources[r].key,
              label: regionSources[r].label,
              text: (regionResult && regionResult.data && regionResult.data.text) || ''
            });
          } catch (regionErr) {}
        }
        var regionCore = parsePayslipCore(regionResults, bestText || '');
        var regionLegacy = reducePayslipToCoreFields(parsePayslipRegionTexts(regionResults, parsePayslipText(bestText || '')));
        var finalParsed = mergePayslipCoreCandidates(
          attemptCandidates.concat([
            { parsed: regionCore, weight: 3.2 },
            { parsed: regionLegacy, weight: 2.2 }
          ]),
          file.name
        );
        mergePayslipParsedData(finalParsed, { imageData: prepared.preview || dataUrl, fileName: file.name || 'busta-paga.jpg' });
        var finalScore = getPayslipCoreFieldScore(finalParsed);
        if (finalScore >= 5) state.payslipStatus = 'Ho letto mese, anno, ditta, netto e lordo. Controllali e salva.';
        else if (finalScore >= 3) state.payslipStatus = 'Ho letto solo alcuni campi della foto. Controlla e completa a mano quello che manca.';
        else state.payslipStatus = 'La foto e salvata, ma i dati letti non sono ancora affidabili. Compilali a mano.';
      } catch (err) {
        if (err && err.message === 'image-only') state.payslipStatus = 'Per ora puoi caricare solo foto della busta paga.';
        else if (err && err.message === 'ocr-unavailable') state.payslipStatus = 'Il lettore automatico non si e caricato. Riprova oppure compila i campi a mano.';
        else state.payslipStatus = 'Non sono riuscito a leggere bene la foto. Prova con una foto piu nitida oppure compila i campi a mano.';
      }
      state.payslipBusy = false;
      state.activeTab = 'payslips';
      render();
    }

    function removePayslipPhotoAt(index) {
      var draft = ensurePayslipDraft();
      var photos = normalizePayslipPhotos(draft);
      if (index < 0 || index >= photos.length) return;
      photos.splice(index, 1);
      var firstPhoto = photos[0] || null;
      state.payslipDraft = Object.assign({}, draft, {
        photos: photos,
        imageData: firstPhoto ? firstPhoto.data : '',
        fileName: firstPhoto ? firstPhoto.fileName : ''
      });
      state.payslipPhotoDeletePendingIndex = -1;
      state.payslipViewer = null;
      state.payslipStatus = photos.length ? 'Foto rimossa.' : 'Aggiungi almeno una foto prima di salvare.';
      render();
    }

    async function processPayslipFiles(fileList) {
      var files = Array.prototype.slice.call(fileList || []).filter(Boolean);
      if (!files.length) return;
      ensurePayslipDraft();
      var currentPhotos = normalizePayslipPhotos(state.payslipDraft);
      var availableSlots = Math.max(0, MAX_PAYSLIP_PHOTOS - currentPhotos.length);
      if (!availableSlots) {
        state.payslipStatus = 'Puoi salvare fino a ' + MAX_PAYSLIP_PHOTOS + ' foto per ogni busta paga.';
        render();
        return;
      }
      files = files.slice(0, availableSlots);
      state.payslipBusy = true;
      state.payslipStatus = files.length > 1 ? ('Sto preparando ' + files.length + ' foto...') : 'Sto preparando la foto...';
      var loadingToken = beginPayslipOperation(
        files.length > 1 ? 'Preparo le foto' : 'Preparo la foto',
        files.length > 1 ? ('Ottimizzo ' + files.length + ' immagini per il salvataggio') : 'Ottimizzo l\'immagine per il salvataggio',
        { kind: 'photo' }
      );
      render();
      var added = [];
      var rejected = 0;
      try {
        for (var index = 0; index < files.length; index += 1) {
          var file = files[index];
          if (!file.type || file.type.indexOf('image/') !== 0) {
            rejected += 1;
            continue;
          }
          state.payslipStatus = 'Preparazione foto ' + (index + 1) + ' di ' + files.length + '...';
          if (loadingToken && window.GestOreLoading) {
            window.GestOreLoading.update(loadingToken, {
              message: 'Preparazione foto ' + (index + 1) + ' di ' + files.length,
              progress: index / files.length
            });
          }
          render();
          var dataUrl = await readFileAsDataURL(file);
          var prepared = await preparePayslipImage(dataUrl);
          added.push({
            id: 'photo-' + Date.now() + '-' + index,
            data: prepared.preview || dataUrl,
            thumbnail: prepared.thumbnail || prepared.preview || dataUrl,
            fileName: file.name || ('busta-paga-' + (currentPhotos.length + index + 1) + '.jpg'),
            createdAt: Date.now()
          });
        }
        var nextPhotos = currentPhotos.concat(added);
        var firstPhoto = nextPhotos[0] || null;
        state.payslipDraft = Object.assign({}, state.payslipDraft, {
          photos: nextPhotos,
          imageData: firstPhoto ? firstPhoto.data : '',
          fileName: firstPhoto ? firstPhoto.fileName : ''
        });
        state.payslipStatus = added.length
          ? (added.length + (added.length === 1 ? ' foto pronta.' : ' foto pronte.') + ' Inserisci l\'importo e salva.')
          : 'Non ho trovato immagini valide.';
        if (rejected && added.length) state.payslipStatus += ' ' + rejected + ' file ignorati.';
      } catch (err) {
        state.payslipStatus = 'Non sono riuscito a caricare tutte le foto. Riprova con immagini piu leggere.';
      }
      state.payslipBusy = false;
      if (loadingToken && window.GestOreLoading) window.GestOreLoading.update(loadingToken, { progress: 1 });
      endPayslipOperation(loadingToken);
      state.activeTab = 'payslips';
      render();
    }
    async function processPayslipFile(file) {
      return processPayslipFiles(file ? [file] : []);
    }

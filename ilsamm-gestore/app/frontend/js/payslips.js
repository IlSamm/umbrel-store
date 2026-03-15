var state = {
      activeTab: 'home',
      entries: loadWithMigration(STORAGE_ENTRIES, LEGACY_ENTRY_KEYS, ENTRY_BACKUP_KEYS, {}, 'entries'),
      settings: Object.assign({}, defaultSettings, loadWithMigration(STORAGE_SETTINGS, LEGACY_SETTINGS_KEYS, SETTINGS_BACKUP_KEYS, {}, 'settings')),
      settingsDraft: {},
      currentMonth: new Date(),
      editingDate: null,
      draft: null,
      typeOpen: false,
      notesOpen: false,
      confirmClearOpen: false,
      payslips: loadStorage(STORAGE_PAYSLIPS, []),
      payslipDraft: null,
      payslipBusy: false,
      payslipStatus: '',
      payslipOcrReady: false
    };
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
    state.settings.workdays = normalizeWeekdayList(state.settings.workdays || defaultSettings.workdays || []);
    state.settings.autoRestDays = normalizeWeekdayList(state.settings.autoRestDays || []);
    state.settingsDraft = Object.assign({}, state.settings);
    saveEntries(); saveSettings();

    function getPayslipMonthDate(payslip) {
      if (!payslip || !payslip.month || !payslip.year) return null;
      return new Date(Number(payslip.year), Math.max(0, Number(payslip.month) - 1), 1);
    }
    function getPayslipMonthLabel(payslip) {
      var monthDate = getPayslipMonthDate(payslip);
      return monthDate ? formatMonthYear(monthDate) : 'Busta paga';
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
        { key: 'headerLeft', label: 'HEADER LEFT', box: [0.02, 0.02, 0.40, 0.20] },
        { key: 'headerRight', label: 'HEADER RIGHT', box: [0.53, 0.02, 0.43, 0.21] },
        { key: 'tableMain', label: 'TABLE MAIN', box: [0.07, 0.49, 0.61, 0.22] },
        { key: 'bottomSummary', label: 'BOTTOM SUMMARY', box: [0.02, 0.77, 0.74, 0.18] },
        { key: 'bottomRight', label: 'BOTTOM RIGHT', box: [0.63, 0.70, 0.24, 0.19] }
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
        sourceText: source.sourceText || ''
      };
    }
    function extractCompanyCore(text) {
      var lines = getPayslipLines(text || '');
      var blacklist = /(via|viale|piazza|cap|telefono|tel|fax|cf|c\.f\.|p\.?iva|partita\s+iva|matric|commercio|inail|costa\s+volpino|sovere|\bBG\b)/i;
      for (var i = 0; i < lines.length; i += 1) {
        var line = String(lines[i] || '').replace(/\s{2,}/g, ' ').trim();
        if (!line || blacklist.test(line)) continue;
        if (/(s\.?r\.?l\.?|srl|s\.?p\.?a\.?|spa|snc|sas|soc\.?\s*coop\.?|cooperativa)/i.test(line)) return line;
      }
      for (var j = 0; j < Math.min(lines.length, 3); j += 1) {
        var fallback = String(lines[j] || '').replace(/\s{2,}/g, ' ').trim();
        if (fallback && !blacklist.test(fallback) && fallback.length <= 60 && /[A-Za-z]/.test(fallback)) return fallback;
      }
      return '';
    }
    function extractMonthYearCore(text) {
      var source = normalizePayslipText(text || '');
      var month = getMonthFromItalianText(source) || (new Date().getMonth() + 1);
      var yearMatch = source.match(/20\d{2}/);
      var year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();
      var monthYear = source.match(/\b(0?[1-9]|1[0-2])[\/\.-](20\d{2})\b/);
      if (monthYear) {
        month = Number(monthYear[1]) || month;
        year = Number(monthYear[2]) || year;
      }
      return { month: month, year: year };
    }
    function extractAmountCore(texts, type) {
      var sources = texts || [];
      var labels = type === 'netto'
        ? [/(?:^|\b)netto(?:\s+da\s+pagare|\s+busta|\s+in\s+busta)?\D{0,24}([\d\.,]{3,16})/i, /([\d\.,]{3,16})\D{0,12}(?:netto\s+da\s+pagare|totale\s+netto|\bnetto\b)/i]
        : [/(?:retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+contributi|imponibile\s+inps|lordo)\D{0,28}([\d\.,]{3,16})/i];
      var min = type === 'netto' ? 300 : 500;
      var max = 10000;
      for (var i = 0; i < sources.length; i += 1) {
        var src = normalizePayslipText(sources[i] || '');
        for (var p = 0; p < labels.length; p += 1) {
          var m = src.match(labels[p]);
          if (m && m[1]) {
            var num = parseItalianNumber(m[1]);
            if (num >= min && num <= max) return num;
          }
        }
        var lines = getPayslipLines(src);
        for (var l = 0; l < lines.length; l += 1) {
          var test = type === 'netto' ? /\bnetto\b/i : /(retribuzione\s+lorda|totale\s+lordo|imponibile\s+irpef|imponibile\s+contributi|imponibile\s+inps|lordo)/i;
          if (!test.test(lines[l])) continue;
          var nums = getLineNumbers(lines[l], { min: min, max: max });
          var picked = pickLastReasonableNumber(nums, { min: min, max: max });
          if (picked) return picked;
        }
      }
      return 0;
    }
    function parsePayslipCore(regionResults, fullText) {
      var regionMap = {};
      (regionResults || []).forEach(function (item) { regionMap[item.key] = normalizePayslipText(item.text || ''); });
      var allText = normalizePayslipText(fullText || '');
      var monthYear = extractMonthYearCore((regionMap.headerRight || '') + '\n' + allText);
      var company = extractCompanyCore(regionMap.headerLeft || '') || extractCompanyCore(allText);
      var netto = extractAmountCore([regionMap.bottomRight || '', regionMap.bottomSummary || '', allText], 'netto');
      var lordo = extractAmountCore([regionMap.bottomSummary || '', regionMap.tableMain || '', allText], 'lordo');
      return reducePayslipToCoreFields({
        month: monthYear.month,
        year: monthYear.year,
        company: company,
        netto: netto,
        lordo: lordo,
        sourceText: allText + ((regionResults && regionResults.length) ? ('\n\n=== REGIONI OCR ===\n' + regionResults.map(function (item) {
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
    function deletePayslip(id) {
      state.payslips = (state.payslips || []).filter(function (item) { return item.id !== id; });
      savePayslips();
      if (state.payslipDraft && state.payslipDraft.id === id) resetPayslipDraft();
      render();
    }
    async function loadExternalScript(src) {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = function () { resolve(); };
        script.onerror = function () {
          script.remove();
          reject(new Error('load'));
        };
        document.head.appendChild(script);
      });
    }
    async function loadTesseract() {
      if (window.Tesseract && typeof window.Tesseract.recognize === 'function') return window.Tesseract;
      var sources = [
        'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
        'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
      ];
      for (var i = 0; i < sources.length; i++) {
        try {
          await loadExternalScript(sources[i]);
          if (window.Tesseract && typeof window.Tesseract.recognize === 'function') return window.Tesseract;
        } catch (err) {}
      }
      throw new Error('ocr-unavailable');
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
          var maxSide = 2200;
          var ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
          var width = Math.max(1, Math.round(img.width * ratio));
          var height = Math.max(1, Math.round(img.height * ratio));
          var baseCanvas = document.createElement('canvas');
          baseCanvas.width = width;
          baseCanvas.height = height;
          var baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
          baseCtx.drawImage(img, 0, 0, width, height);
          var preview = baseCanvas.toDataURL('image/jpeg', 0.92);

          var imageData = baseCtx.getImageData(0, 0, width, height);
          var data = imageData.data;
          for (var i = 0; i < data.length; i += 4) {
            var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            gray = (gray - 128) * 1.55 + 128;
            gray = gray < 0 ? 0 : (gray > 255 ? 255 : gray);
            var boosted = gray > 182 ? 255 : gray < 84 ? 0 : gray;
            data[i] = boosted;
            data[i + 1] = boosted;
            data[i + 2] = boosted;
          }
          baseCtx.putImageData(imageData, 0, 0);

          var sharpCanvas = document.createElement('canvas');
          sharpCanvas.width = width;
          sharpCanvas.height = height;
          var sharpCtx = sharpCanvas.getContext('2d', { willReadFrequently: true });
          sharpCtx.filter = 'contrast(150%) brightness(108%) grayscale(100%)';
          sharpCtx.drawImage(baseCanvas, 0, 0, width, height);
          var pageCanvas = cropCanvasArea(sharpCanvas, 0.14, 0.10, 0.80, 0.86);
          resolve({
            preview: preview,
            ocr: sharpCanvas.toDataURL('image/jpeg', 0.96),
            ocrAlt: preview,
            regions: getPayslipRegionSources(pageCanvas)
          });
        };
        img.onerror = function () {
          resolve({ preview: dataUrl, ocr: dataUrl, ocrAlt: dataUrl, regions: [] });
        };
        img.src = dataUrl;
      });
    }
    async function processPayslipFile(file) {
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

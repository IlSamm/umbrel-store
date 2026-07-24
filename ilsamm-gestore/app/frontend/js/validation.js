function getDayDraftValidationIssues(draft) {
  var source = draft && typeof draft === 'object' ? draft : {};
  var issues = [];
  var type = String(source.type || 'lavoro');
  var isWork = type === 'lavoro' || type === 'lavoro_ferie';
  var start = parseTimeToMinutes(source.start);
  var end = parseTimeToMinutes(source.end);
  var hasStart = start !== null;
  var hasEnd = end !== null;
  var breakMinutes = hoursToMinutes(source.breakHours || 0);
  var overtimeMinutes = hoursToMinutes(source.overtimeHours || 0);
  var leaveMinutes = hoursToMinutes(source.leaveHours || 0);

  function add(code, level, title, message, fields) {
    issues.push({
      code: code,
      level: level,
      title: title,
      message: message,
      fields: Array.isArray(fields) ? fields : []
    });
  }

  if (isWork) {
    if (hasStart !== hasEnd) {
      add(
        'incomplete-time-range',
        'error',
        'Orario incompleto',
        'Inserisci sia l\'entrata sia l\'uscita.',
        hasStart ? ['end'] : ['start']
      );
    }

    if (hasStart && hasEnd) {
      var grossMinutes = end - start;
      if (grossMinutes <= 0) grossMinutes += 1440;
      if (grossMinutes > 16 * 60) {
        add(
          'long-shift',
          'warning',
          'Turno molto lungo',
          'Controlla gli orari: il turno supera 16 ore.',
          ['start', 'end']
        );
      }
      if (breakMinutes >= grossMinutes && grossMinutes > 0) {
        add(
          'break-too-long',
          'error',
          'Pausa non valida',
          'La pausa deve essere piu corta della durata del turno.',
          ['breakHours']
        );
      }
      var workedMinutes = Math.max(0, grossMinutes - breakMinutes);
      if (source.overtimeManual && overtimeMinutes > workedMinutes) {
        add(
          'overtime-too-long',
          'error',
          'Straordinari non validi',
          'Gli straordinari non possono superare le ore lavorate.',
          ['overtimeHours']
        );
      }
      if (type === 'lavoro_ferie' && workedMinutes + leaveMinutes > 24 * 60) {
        add(
          'mixed-day-too-long',
          'error',
          'Totale giornata non valido',
          'Lavoro e ferie insieme non possono superare 24 ore.',
          ['leaveHours']
        );
      }
    } else if (!hasStart && !hasEnd && (breakMinutes || overtimeMinutes || leaveMinutes)) {
      add(
        'hours-without-range',
        'error',
        'Mancano gli orari',
        'Inserisci entrata e uscita prima di pausa, ferie o straordinari.',
        ['start', 'end']
      );
    }
  } else if (type !== 'riposo') {
    var quantityMinutes = hoursToMinutes(source.quantityHours || 0);
    if (quantityMinutes > 24 * 60) {
      add(
        'quantity-too-long',
        'error',
        'Quantita non valida',
        'Le ore registrate non possono superare 24.',
        ['quantityHours']
      );
    } else if (quantityMinutes <= 0) {
      add(
        'quantity-empty',
        'warning',
        'Ore non indicate',
        'Questa giornata risulta registrata senza ore coperte.',
        ['quantityHours']
      );
    }
  }

  return issues;
}

function hasBlockingDayDraftIssues(issues) {
  return (Array.isArray(issues) ? issues : []).some(function (issue) {
    return issue && issue.level === 'error';
  });
}

function renderEditorValidationIssues(issues) {
  var list = Array.isArray(issues) ? issues : [];
  if (!list.length) return '';
  var hasError = hasBlockingDayDraftIssues(list);
  return '<section class="day-editor-validation ' + (hasError ? 'has-error' : 'has-warning') + '" id="editorValidation" aria-live="polite">' +
    '<span class="day-editor-validation-icon">' + (hasError ? icons.x : icons.activity) + '</span>' +
    '<div class="day-editor-validation-copy">' +
      list.map(function (issue) {
        return '<p><strong>' + escapeHtml(issue.title) + '</strong><small>' + escapeHtml(issue.message) + '</small></p>';
      }).join('') +
    '</div>' +
    (hasError ? '<button type="button" data-discard-invalid-editor="1">Esci senza salvare</button>' : '') +
  '</section>';
}

function updateEditorValidationUI() {
  if (!state || !state.draft) return [];
  var issues = getDayDraftValidationIssues(state.draft);
  state.editorValidationIssues = issues;
  var root = document.getElementById('editorValidationSlot');
  if (root) {
    root.innerHTML = renderEditorValidationIssues(issues);
    var discard = root.querySelector('[data-discard-invalid-editor]');
    if (discard) discard.onclick = function () { closeEditor({ skipAutosave: true }); };
  }

  document.querySelectorAll('[data-editor-validation-field]').forEach(function (element) {
    element.classList.remove('has-validation-error');
  });
  issues.forEach(function (issue) {
    if (!issue || issue.level !== 'error') return;
    (issue.fields || []).forEach(function (field) {
      var target = document.querySelector('[data-editor-validation-field="' + field + '"]');
      if (target) target.classList.add('has-validation-error');
    });
  });
  return issues;
}

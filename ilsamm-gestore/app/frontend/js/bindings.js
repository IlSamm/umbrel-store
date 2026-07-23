function bindPayslipViewerZoom() {
      var surface = document.querySelector('[data-payslip-zoom-surface]');
      var image = surface && surface.querySelector('[data-payslip-zoom-image]');
      if (!surface || !image) return;

      var label = surface.querySelector('[data-payslip-zoom-label]');
      var zoomIn = surface.querySelector('[data-payslip-zoom-in]');
      var zoomOut = surface.querySelector('[data-payslip-zoom-out]');
      var zoomReset = surface.querySelector('[data-payslip-zoom-reset]');
      var pointers = new Map();
      var scale = 1;
      var translateX = 0;
      var translateY = 0;
      var pinchStart = null;

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function clampTranslation() {
        if (scale <= 1.001) {
          translateX = 0;
          translateY = 0;
          return;
        }
        var rect = surface.getBoundingClientRect();
        var maxX = Math.max(0, rect.width * (scale - 1) / 2);
        var maxY = Math.max(0, rect.height * (scale - 1) / 2);
        translateX = clamp(translateX, -maxX, maxX);
        translateY = clamp(translateY, -maxY, maxY);
      }

      function applyZoom(animate) {
        clampTranslation();
        image.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.25,1)' : 'none';
        image.style.transform = 'translate3d(' + translateX.toFixed(1) + 'px,' + translateY.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ')';
        if (label) label.textContent = Math.round(scale * 100) + '%';
        surface.classList.toggle('is-zoomed', scale > 1.01);
      }

      function setScale(nextScale, clientX, clientY, animate) {
        var previousScale = scale;
        var next = clamp(nextScale, 1, 5);
        if (Math.abs(next - previousScale) < .001) return;
        var rect = surface.getBoundingClientRect();
        var focusX = Number.isFinite(clientX) ? clientX - (rect.left + rect.width / 2) : 0;
        var focusY = Number.isFinite(clientY) ? clientY - (rect.top + rect.height / 2) : 0;
        var ratio = next / previousScale;
        translateX = focusX - (focusX - translateX) * ratio;
        translateY = focusY - (focusY - translateY) * ratio;
        scale = next;
        applyZoom(animate);
      }

      function resetZoom(animate) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        applyZoom(animate);
      }

      function distance(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
      }

      function midpoint(a, b) {
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }

      surface.addEventListener('pointerdown', function (event) {
        if (event.target.closest('.payvault-viewer-zoom-tools')) return;
        event.preventDefault();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (typeof surface.setPointerCapture === 'function') {
          try { surface.setPointerCapture(event.pointerId); } catch (err) {}
        }
        if (pointers.size === 2) {
          var pair = Array.from(pointers.values());
          pinchStart = {
            distance: Math.max(1, distance(pair[0], pair[1])),
            scale: scale,
            center: midpoint(pair[0], pair[1]),
            translateX: translateX,
            translateY: translateY
          };
        }
      });

      surface.addEventListener('pointermove', function (event) {
        var previous = pointers.get(event.pointerId);
        if (!previous) return;
        event.preventDefault();
        var current = { x: event.clientX, y: event.clientY };
        pointers.set(event.pointerId, current);
        if (pointers.size >= 2 && pinchStart) {
          var pair = Array.from(pointers.values()).slice(0, 2);
          var center = midpoint(pair[0], pair[1]);
          scale = clamp(pinchStart.scale * distance(pair[0], pair[1]) / pinchStart.distance, 1, 5);
          translateX = pinchStart.translateX + (center.x - pinchStart.center.x);
          translateY = pinchStart.translateY + (center.y - pinchStart.center.y);
          applyZoom(false);
          return;
        }
        if (pointers.size === 1 && scale > 1.01) {
          translateX += current.x - previous.x;
          translateY += current.y - previous.y;
          applyZoom(false);
        }
      });

      function releasePointer(event) {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (scale <= 1.01) resetZoom(true);
      }

      surface.addEventListener('pointerup', releasePointer);
      surface.addEventListener('pointercancel', releasePointer);
      surface.addEventListener('dblclick', function (event) {
        if (event.target.closest('.payvault-viewer-zoom-tools')) return;
        event.preventDefault();
        if (scale > 1.01) resetZoom(true);
        else setScale(2.5, event.clientX, event.clientY, true);
      });
      surface.addEventListener('wheel', function (event) {
        event.preventDefault();
        setScale(scale + (event.deltaY < 0 ? .35 : -.35), event.clientX, event.clientY, false);
      }, { passive: false });

      if (zoomIn) zoomIn.onclick = function (event) { event.stopPropagation(); setScale(scale + .5, NaN, NaN, true); };
      if (zoomOut) zoomOut.onclick = function (event) { event.stopPropagation(); setScale(scale - .5, NaN, NaN, true); };
      if (zoomReset) zoomReset.onclick = function (event) { event.stopPropagation(); resetZoom(true); };
      applyZoom(false);
    }

var navInteractionLockUntil = 0;

function getPrimaryNavOrder() {
  return ['calendar', 'stats', 'home', 'vacations', 'profile'];
}

function getPrimaryNavTab(tab) {
  return tab === 'payslips' || tab === 'settings' || tab === 'exports' ? 'profile' : tab;
}

function activatePrimaryTab(nextTab, pressedButton, delay) {
  if (state.privacyLocked || !nextTab) return;
  var order = getPrimaryNavOrder();
  var currentPrimaryTab = getPrimaryNavTab(state.activeTab);
  var currentIndex = order.indexOf(currentPrimaryTab);
  var nextIndex = order.indexOf(nextTab);
  if (nextIndex < 0 || currentPrimaryTab === nextTab) return;
  var navGrid = pressedButton && pressedButton.closest ? pressedButton.closest('.nav-grid') : document.querySelector('.nav-grid-v2');
  document.querySelectorAll('.nav-btn.nav-press').forEach(function (node) { node.classList.remove('nav-press'); });
  if (navGrid) navGrid.classList.add('nav-switching');
  if (pressedButton) pressedButton.classList.add('nav-press');
  window.setTimeout(function () {
    state.tabSwitchFx = true;
    state.tabSwitchDir = nextIndex >= currentIndex ? 'forward' : 'back';
    state.navPreviousIndex = currentIndex >= 0 ? currentIndex : nextIndex;
    state.activeTab = nextTab;
    render();
  }, Math.max(0, Number(delay) || 0));
}

function bindFluidNavigation() {
  var grid = document.querySelector('.nav-grid-v2');
  if (!grid) return;
  var buttons = Array.from(grid.querySelectorAll('.nav-btn[data-tab]'));
  if (!buttons.length) return;

  var session = null;
  var holdTimer = 0;
  var HOLD_MS = 170;
  var DRAG_THRESHOLD = 7;

  function clearHoldTimer() {
    if (!holdTimer) return;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function getGeometry() {
    var rect = grid.getBoundingClientRect();
    var style = window.getComputedStyle(grid);
    var padLeft = parseFloat(style.paddingLeft) || 0;
    var padRight = parseFloat(style.paddingRight) || 0;
    var usableWidth = Math.max(1, rect.width - padLeft - padRight);
    return {
      rect: rect,
      padLeft: padLeft,
      cellWidth: usableWidth / buttons.length
    };
  }

  function indexFromClientX(clientX, geometry, fractional) {
    var raw = (clientX - geometry.rect.left - geometry.padLeft) / geometry.cellWidth - 0.5;
    var clamped = Math.max(0, Math.min(buttons.length - 1, raw));
    return fractional ? clamped : Math.max(0, Math.min(buttons.length - 1, Math.round(clamped)));
  }

  function updateDragPreview(clientX) {
    if (!session) return;
    var geometry = getGeometry();
    var floatingIndex = indexFromClientX(clientX, geometry, true);
    var previewIndex = indexFromClientX(clientX, geometry, false);
    var movement = Math.abs(clientX - session.lastX);
    var stretch = 1 + Math.min(0.16, movement / Math.max(1, geometry.cellWidth) * 0.12);
    session.lastX = clientX;
    session.previewIndex = previewIndex;
    grid.style.setProperty('--nav-drag-x', (floatingIndex * geometry.cellWidth).toFixed(2) + 'px');
    grid.style.setProperty('--nav-drag-stretch', stretch.toFixed(3));
    buttons.forEach(function (button, index) {
      button.classList.toggle('nav-preview', index === previewIndex);
    });
  }

  function beginDragging(clientX) {
    if (!session || session.dragging) return;
    session.dragging = true;
    grid.classList.remove('nav-animated', 'nav-switching');
    grid.classList.add('nav-dragging');
    updateDragPreview(clientX);
  }

  function finishInteraction(event, cancelled) {
    if (!session || event.pointerId !== session.pointerId) return;
    clearHoldTimer();
    var completed = session;
    session = null;
    navInteractionLockUntil = Date.now() + 520;
    try {
      if (typeof grid.releasePointerCapture === 'function' && grid.hasPointerCapture(event.pointerId)) {
        grid.releasePointerCapture(event.pointerId);
      }
    } catch (err) {}

    grid.classList.remove('nav-dragging');
    grid.style.removeProperty('--nav-drag-x');
    grid.style.removeProperty('--nav-drag-stretch');
    buttons.forEach(function (button) { button.classList.remove('nav-preview'); });

    if (cancelled) return;
    var chosenIndex = completed.dragging ? completed.previewIndex : completed.startIndex;
    var chosenButton = buttons[chosenIndex];
    if (!chosenButton) return;
    activatePrimaryTab(chosenButton.dataset.tab, chosenButton, completed.dragging ? 20 : 90);
  }

  grid.addEventListener('pointerdown', function (event) {
    if (state.privacyLocked || session || event.button > 0) return;
    var button = event.target.closest('.nav-btn[data-tab]');
    if (!button || !grid.contains(button)) return;
    var startIndex = buttons.indexOf(button);
    if (startIndex < 0) return;
    session = {
      pointerId: event.pointerId,
      startX: event.clientX,
      lastX: event.clientX,
      startIndex: startIndex,
      previewIndex: startIndex,
      dragging: false
    };
    try {
      if (typeof grid.setPointerCapture === 'function') grid.setPointerCapture(event.pointerId);
    } catch (err) {}
    holdTimer = window.setTimeout(function () {
      if (session && session.pointerId === event.pointerId) beginDragging(session.lastX);
    }, HOLD_MS);
  });

  grid.addEventListener('pointermove', function (event) {
    if (!session || event.pointerId !== session.pointerId) return;
    session.lastX = event.clientX;
    if (!session.dragging && Math.abs(event.clientX - session.startX) >= DRAG_THRESHOLD) {
      clearHoldTimer();
      beginDragging(event.clientX);
    }
    if (session.dragging) {
      event.preventDefault();
      updateDragPreview(event.clientX);
    }
  }, { passive: false });

  grid.addEventListener('pointerup', function (event) { finishInteraction(event, false); });
  grid.addEventListener('pointercancel', function (event) { finishInteraction(event, true); });
  grid.addEventListener('lostpointercapture', function (event) {
    if (session && event.pointerId === session.pointerId) finishInteraction(event, true);
  });

  buttons.forEach(function (button) {
    button.onclick = function (event) {
      if (Date.now() < navInteractionLockUntil) {
        event.preventDefault();
        return;
      }
      activatePrimaryTab(button.dataset.tab, button, 90);
    };
  });
}

function bindEvents() {
      bindFluidNavigation();
      document.querySelectorAll('[data-tab]:not(.nav-btn)').forEach(function (btn) {
        btn.onclick = function () {
          activatePrimaryTab(btn.dataset.tab, btn, 90);
        };
      });
      document.querySelectorAll('[data-open-profile-section]').forEach(function (btn) {
        btn.onclick = function () {
          var section = btn.dataset.openProfileSection;
          if (section !== 'settings' && section !== 'payslips' && section !== 'exports') return;
          if (section === 'settings') state.settingsSection = btn.dataset.settingsSection || '';
          if (section === 'payslips') {
            state.payslipDetailId = '';
            state.payslipEditorOpen = false;
            state.payslipStatsOpen = false;
            state.payslipViewer = null;
          }
          state.activeTab = section;
          render();
        };
      });
      document.querySelectorAll('[data-back-profile]').forEach(function (btn) {
        btn.onclick = function () {
          state.settingsSection = '';
          state.payslipDetailId = '';
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = false;
          state.payslipViewer = null;
          state.activeTab = 'profile';
          render();
        };
      });
      document.querySelectorAll('[data-open-settings-section]').forEach(function (btn) {
        btn.onclick = function () {
          var section = btn.dataset.openSettingsSection;
          if (['profile', 'calendar', 'timer', 'notifications', 'privacy', 'data', 'accounts'].indexOf(section) === -1) return;
          state.settingsSection = section;
          render();
        };
      });
      document.querySelectorAll('[data-back-settings]').forEach(function (btn) {
        btn.onclick = function () {
          state.settingsSection = '';
          state.activeTab = 'profile';
          render();
        };
      });
      document.querySelectorAll('[data-open-date]').forEach(function (btn) {
        btn.onclick = function () { openEditor(new Date(btn.dataset.openDate + 'T12:00:00')); };
      });
      var unlockBtn = document.querySelector('[data-unlock-app]');
      if (unlockBtn) unlockBtn.onclick = unlockPrivacyScreen;
      document.querySelectorAll('[data-trigger-payslip-camera], [data-trigger-payslip-gallery]').forEach(function (btn) {
        btn.onclick = function () {
          if (state.privacyLocked) return;
          if (state.payslipBusy) return;
          var input = document.getElementById('payslipFileInput');
          if (!input) return;
          if (btn.hasAttribute('data-trigger-payslip-camera')) {
            input.setAttribute('capture', 'environment');
            input.removeAttribute('multiple');
          } else {
            input.removeAttribute('capture');
            input.setAttribute('multiple', 'multiple');
          }
          input.value = '';
          input.click();
        };
      });
      var payslipInput = document.getElementById('payslipFileInput');
      if (payslipInput) payslipInput.onchange = function (e) {
        processPayslipFiles(e.target.files || []);
      };
      var resetPayslip = document.querySelector('[data-reset-payslip]');
      if (resetPayslip) resetPayslip.onclick = function () { resetPayslipDraft(true); state.payslipEditorOpen = true; state.payslipDetailId = ''; render(); };
      document.querySelectorAll('[data-new-payslip]').forEach(function (btn) {
        btn.onclick = function () {
          resetPayslipDraft();
          state.payslipDetailId = '';
          state.payslipEditorOpen = true;
          state.payslipStatsOpen = false;
          state.payslipViewer = null;
          render();
        };
      });
      document.querySelectorAll('[data-open-payslip-stats]').forEach(function (btn) {
        btn.onclick = function () {
          var years = (state.payslips || []).map(function (item) { return Number(item.year) || 0; }).filter(Boolean);
          state.payslipStatsYear = years.length ? Math.max.apply(null, years) : new Date().getFullYear();
          state.payslipDetailId = '';
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = true;
          state.payslipViewer = null;
          render();
        };
      });
      document.querySelectorAll('[data-close-payslip-stats]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipStatsOpen = false;
          render();
        };
      });
      document.querySelectorAll('[data-payslip-stats-year]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipStatsYear += Number(btn.dataset.payslipStatsYear) || 0;
          render();
        };
      });
      document.querySelectorAll('[data-open-payslip]').forEach(function (btn) {
        btn.onclick = async function () {
          var found = (state.payslips || []).find(function (item) { return item.id === btn.dataset.openPayslip; });
          if (!found) return;
          state.payslipDetailId = found.id;
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = false;
          state.payslipViewer = null;
          state.payslipStatus = '';
          render();
          if (found.photosDeferred || found.sourceTextDeferred) {
            await hydratePayslipRecord(found.id);
            render();
          }
        };
      });
      document.querySelectorAll('[data-close-payslip-detail]').forEach(function (btn) {
        btn.onclick = function () { state.payslipDetailId = ''; state.payslipViewer = null; render(); };
      });
      document.querySelectorAll('[data-edit-payslip]').forEach(function (btn) {
        btn.onclick = async function () {
          var found = (state.payslips || []).find(function (item) { return item.id === btn.dataset.editPayslip; });
          if (!found) return;
          if (found.photosDeferred || found.sourceTextDeferred) found = await hydratePayslipRecord(found.id) || found;
          state.payslipDraft = clonePayslipForDraft(found);
          state.payslipDetailId = found.id;
          state.payslipEditorOpen = true;
          state.payslipViewer = null;
          state.payslipStatus = '';
          render();
        };
      });
      document.querySelectorAll('[data-close-payslip-editor]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipEditorOpen = false;
          state.payslipViewer = null;
          resetPayslipDraft();
          render();
        };
      });
      document.querySelectorAll('[data-open-payslip-archive]').forEach(function (btn) {
        btn.onclick = function () {
          state.activeTab = 'payslips';
          state.payslipDetailId = '';
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = false;
          render();
        };
      });
      document.querySelectorAll('[data-open-home-payslip]').forEach(function (btn) {
        btn.onclick = async function () {
          var found = (state.payslips || []).find(function (item) { return item.id === btn.dataset.openHomePayslip; });
          if (!found) return;
          state.payslipDetailId = found.id;
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = false;
          state.payslipViewer = null;
          state.payslipStatus = '';
          state.activeTab = 'payslips';
          render();
          if (found.photosDeferred || found.sourceTextDeferred) {
            await hydratePayslipRecord(found.id);
            render();
          }
        };
      });
      var savePayslipBtn = document.querySelector('[data-save-payslip]');
      if (savePayslipBtn) savePayslipBtn.onclick = function () {
        if (state.payslipBusy) return;
        commitPayslipEditorInputs();
        var active = document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
        savePayslipDraft();
      };
      document.querySelectorAll('[data-delete-payslip]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipDeletePendingId = btn.dataset.deletePayslip || '';
          state.payslipPhotoDeletePendingIndex = -1;
          render();
        };
      });
      document.querySelectorAll('[data-view-payslip-photo]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipViewer = {
            source: btn.dataset.payslipSource === 'archive' ? 'archive' : 'draft',
            payslipId: btn.dataset.payslipId || '',
            index: Number(btn.dataset.viewPayslipPhoto) || 0
          };
          render();
        };
      });
      document.querySelectorAll('[data-remove-payslip-photo]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipPhotoDeletePendingIndex = Number(btn.dataset.removePayslipPhoto);
          state.payslipDeletePendingId = '';
          render();
        };
      });
      document.querySelectorAll('[data-close-payslip-viewer]').forEach(function (btn) {
        btn.onclick = function () { state.payslipViewer = null; render(); };
      });
      bindPayslipViewerZoom();
      var viewerPrev = document.querySelector('[data-payslip-viewer-prev]');
      if (viewerPrev) viewerPrev.onclick = function () {
        if (!state.payslipViewer) return;
        var source = state.payslipViewer.source === 'archive'
          ? (state.payslips || []).find(function (item) { return item.id === state.payslipViewer.payslipId; })
          : state.payslipDraft;
        var photos = normalizePayslipPhotos(source);
        if (!photos.length) return;
        state.payslipViewer.index = (Number(state.payslipViewer.index) - 1 + photos.length) % photos.length;
        render();
      };
      var viewerNext = document.querySelector('[data-payslip-viewer-next]');
      if (viewerNext) viewerNext.onclick = function () {
        if (!state.payslipViewer) return;
        var source = state.payslipViewer.source === 'archive'
          ? (state.payslips || []).find(function (item) { return item.id === state.payslipViewer.payslipId; })
          : state.payslipDraft;
        var photos = normalizePayslipPhotos(source);
        if (!photos.length) return;
        state.payslipViewer.index = (Number(state.payslipViewer.index) + 1) % photos.length;
        render();
      };
      document.querySelectorAll('[data-close-payslip-decision]').forEach(function (btn) {
        btn.onclick = function () {
          state.payslipDeletePendingId = '';
          state.payslipPhotoDeletePendingIndex = -1;
          render();
        };
      });
      var confirmPayslipDecision = document.querySelector('[data-confirm-payslip-decision]');
      if (confirmPayslipDecision) confirmPayslipDecision.onclick = function () {
        if (Number.isInteger(Number(state.payslipPhotoDeletePendingIndex)) && Number(state.payslipPhotoDeletePendingIndex) >= 0) {
          removePayslipPhotoAt(Number(state.payslipPhotoDeletePendingIndex));
          return;
        }
        if (state.payslipDeletePendingId) deletePayslip(state.payslipDeletePendingId);
      };
      var payslipNetto = document.getElementById('payslipNetto');
      if (payslipNetto) {
        payslipNetto.oninput = function (e) {
          ensurePayslipDraft();
          state.payslipDraft.netto = parseDecimalInput(e.target.value, 0);
        };
        payslipNetto.onfocus = function (e) {
          if (isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        payslipNetto.onblur = function (e) {
          ensurePayslipDraft();
          state.payslipDraft.netto = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.payslipDraft.netto || 0);
        };
      }
      var rateReuse = document.querySelector('[data-toggle-payslip-rate-reuse]');
      if (rateReuse) rateReuse.onclick = function () {
        var draft = ensurePayslipDraft();
        if (draft.reusePreviousRates) {
          draft.reusePreviousRates = false;
          state.payslipStatus = 'Ora puoi modificare le tariffe di questo mese.';
        } else {
          var previous = applyPreviousPayslipRatesToDraft();
          state.payslipStatus = previous
            ? ('Tariffe copiate da ' + getPayslipMonthLabel(previous) + '.')
            : 'Non ci sono ancora tariffe in un mese precedente.';
        }
        render();
      };
      [['payslipHourlyRate', 'hourlyRate'], ['payslipOvertimeRate', 'overtimeRate']].forEach(function (pair) {
        var input = document.getElementById(pair[0]);
        if (!input) return;
        input.oninput = function (event) {
          ensurePayslipDraft();
          state.payslipDraft[pair[1]] = parseDecimalInput(event.target.value, 0);
          state.payslipDraft.reusePreviousRates = false;
        };
        input.onfocus = function (event) {
          if (isZeroLikeDecimalText(event.target.value)) event.target.value = '';
          requestAnimationFrame(function () { event.target.setSelectionRange(event.target.value.length, event.target.value.length); });
        };
        input.onblur = function (event) {
          ensurePayslipDraft();
          state.payslipDraft[pair[1]] = parseDecimalInput(event.target.value, 0);
          event.target.value = formatEditorDecimal(state.payslipDraft[pair[1]] || 0);
        };
      });
      var payslipNotes = document.getElementById('payslipNotes');
      if (payslipNotes) payslipNotes.oninput = function (event) {
        ensurePayslipDraft();
        state.payslipDraft.notes = String(event.target.value || '');
      };
      var payslipMonth = document.getElementById('payslipMonth');
      if (payslipMonth) payslipMonth.onchange = function (e) {
        ensurePayslipDraft();
        state.payslipDraft.month = Math.max(1, Math.min(12, Number(e.target.value) || (new Date().getMonth() + 1)));
        if (state.payslipDraft.reusePreviousRates) applyPreviousPayslipRatesToDraft();
        render();
      };
      var payslipYear = document.getElementById('payslipYear');
      if (payslipYear) payslipYear.onchange = function (e) {
        ensurePayslipDraft();
        state.payslipDraft.year = Math.max(2000, Math.min(2100, Number(e.target.value) || new Date().getFullYear()));
        if (state.payslipDraft.reusePreviousRates) applyPreviousPayslipRatesToDraft();
        render();
      };
      var sourceText = document.getElementById('payslipSourceText');
      if (sourceText) sourceText.oninput = function (e) { ensurePayslipDraft(); state.payslipDraft.sourceText = String(e.target.value || ''); };

      var calToday = document.querySelector('[data-calendar-today]');
      if (calToday) calToday.onclick = function () { var now = new Date(); state.currentMonth = new Date(now.getFullYear(), now.getMonth(), 1); render(); };
      var calPrev = document.querySelector('[data-calendar-prev]');
      if (calPrev) calPrev.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1); render(); };
      var calNext = document.querySelector('[data-calendar-next]');
      if (calNext) calNext.onclick = function () { state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1); render(); };
      var stPrev = document.querySelector('[data-stats-prev]');
      if (stPrev) stPrev.onclick = function () {
        var step = state.statsRange === 'year' ? -12 : -1;
        state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + step, 1);
        render();
      };
      var stNext = document.querySelector('[data-stats-next]');
      if (stNext) stNext.onclick = function () {
        var step = state.statsRange === 'year' ? 12 : 1;
        state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + step, 1);
        render();
      };
      document.querySelectorAll('[data-stats-range]').forEach(function (btn) {
        btn.onclick = function () {
          var nextRange = btn.dataset.statsRange === 'year' ? 'year' : 'month';
          if (state.statsRange === nextRange) return;
          state.statsRange = nextRange;
          render();
        };
      });

      var vacationYearPrev = document.querySelector('[data-vacation-year-prev]');
      if (vacationYearPrev) vacationYearPrev.onclick = function () { state.vacationScreenYear = (Number(state.vacationScreenYear) || new Date().getFullYear()) - 1; render(); };
      var vacationYearNext = document.querySelector('[data-vacation-year-next]');
      if (vacationYearNext) vacationYearNext.onclick = function () { state.vacationScreenYear = (Number(state.vacationScreenYear) || new Date().getFullYear()) + 1; render(); };

      document.querySelectorAll('[data-open-vacation-history]').forEach(function (btn) {
        btn.onclick = function () {
          state.vacationHistoryYear = Number(btn.dataset.openVacationHistory) || state.currentMonth.getFullYear();
          state.vacationHistoryOpen = true;
          render();
        };
      });
      document.querySelectorAll('[data-close-vacation-history]').forEach(function (btn) {
        btn.onclick = function () { state.vacationHistoryOpen = false; render(); };
      });
      document.querySelectorAll('[data-open-vacation-date]').forEach(function (btn) {
        btn.onclick = function () {
          var date = parseLocalDateKey(btn.dataset.openVacationDate);
          if (!date) return;
          state.vacationHistoryOpen = false;
          openEditor(date);
        };
      });
      var openVacationManager = function (btn, mode, yearValue) {
        btn.onclick = function () {
          var year = Number(yearValue) || state.currentMonth.getFullYear();
          var now = new Date();
          var startDate = now.getFullYear() === year ? now : new Date(year, state.currentMonth.getMonth(), 1, 12, 0, 0, 0);
          if (mode === 'range') {
            for (var offset = 0; offset < 366 && startDate.getFullYear() === year; offset += 1) {
              var candidateKey = toISODate(startDate);
              var candidatePreview = getVacationRangePreview(candidateKey, candidateKey);
              if (candidatePreview.ok && candidatePreview.eligibleKeys.length) break;
              startDate.setDate(startDate.getDate() + 1);
            }
            if (startDate.getFullYear() !== year) startDate = new Date(year, 0, 1, 12, 0, 0, 0);
          }
          state.vacationDraft = {
            year: year,
            allowanceDays: getVacationAllowanceDays(year),
            start: toISODate(startDate),
            end: toISODate(startDate),
            rangeMode: 'single'
          };
          state.vacationHistoryOpen = false;
          state.vacationManagerMode = mode;
          state.vacationManagerError = '';
          state.vacationManagerOpen = true;
          render();
        };
      };
      document.querySelectorAll('[data-open-vacation-allowance]').forEach(function (btn) {
        openVacationManager(btn, 'allowance', btn.dataset.openVacationAllowance);
      });
      document.querySelectorAll('[data-open-vacation-range]').forEach(function (btn) {
        openVacationManager(btn, 'range', btn.dataset.openVacationRange);
      });
      document.querySelectorAll('[data-vacation-range-mode]').forEach(function (btn) {
        btn.onclick = function () {
          if (!state.vacationDraft) return;
          state.vacationDraft.rangeMode = btn.dataset.vacationRangeMode === 'period' ? 'period' : 'single';
          if (state.vacationDraft.rangeMode === 'single' || !state.vacationDraft.end) state.vacationDraft.end = state.vacationDraft.start;
          state.vacationManagerError = '';
          render();
        };
      });
      document.querySelectorAll('[data-close-vacation-manager]').forEach(function (btn) {
        btn.onclick = function () { state.vacationManagerOpen = false; state.vacationManagerError = ''; render(); };
      });
      var vacationAllowance = document.getElementById('vacationAllowanceInput');
      if (vacationAllowance) {
        vacationAllowance.oninput = function (e) {
          if (!state.vacationDraft) return;
          state.vacationDraft.allowanceDays = parseDecimalInput(e.target.value, 0);
          var projection = document.getElementById('vacationAllowanceProjection');
          if (projection) {
            var difference = state.vacationDraft.allowanceDays - parseDecimalInput(e.target.dataset.usedDays, 0);
            projection.textContent = formatVacationDayValue(Math.abs(difference)) + (difference < 0 ? ' gg oltre il saldo' : ' gg disponibili');
            projection.dataset.tone = difference < 0 ? 'warning' : 'positive';
          }
        };
        vacationAllowance.onfocus = function (e) {
          if (isZeroLikeDecimalText(e.target.value)) e.target.value = '';
        };
        vacationAllowance.onblur = function (e) {
          if (!state.vacationDraft) return;
          state.vacationDraft.allowanceDays = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.vacationDraft.allowanceDays || 0);
        };
      }
      document.querySelectorAll('[data-vacation-allowance-step]').forEach(function (btn) {
        btn.onclick = function () {
          if (!state.vacationDraft) return;
          var step = Number(btn.dataset.vacationAllowanceStep) || 0;
          state.vacationDraft.allowanceDays = Math.min(366, Math.max(0, parseDecimalInput(state.vacationDraft.allowanceDays, 0) + step));
          render();
        };
      });
      var vacationStart = document.getElementById('vacationStartInput');
      if (vacationStart) vacationStart.onchange = function (e) {
        if (!state.vacationDraft) return;
        state.vacationDraft.start = e.target.value;
        if (state.vacationDraft.rangeMode !== 'period' || !state.vacationDraft.end || state.vacationDraft.end < e.target.value) state.vacationDraft.end = e.target.value;
        state.vacationManagerError = '';
        render();
      };
      var vacationEnd = document.getElementById('vacationEndInput');
      if (vacationEnd) vacationEnd.onchange = function (e) {
        if (!state.vacationDraft) return;
        state.vacationDraft.end = e.target.value;
        state.vacationManagerError = '';
        render();
      };
      var saveVacationAllowance = document.querySelector('[data-save-vacation-allowance]');
      if (saveVacationAllowance) saveVacationAllowance.onclick = function () {
        if (!state.vacationDraft) return;
        setVacationAllowanceDays(state.vacationDraft.year, state.vacationDraft.allowanceDays);
        state.vacationStatus = 'Disponibilita ferie aggiornata.';
        state.vacationManagerOpen = false;
        state.vacationManagerError = '';
        render();
      };
      var applyVacationRange = document.querySelector('[data-apply-vacation-range]');
      if (applyVacationRange) applyVacationRange.onclick = function () {
        if (!state.vacationDraft) return;
        var rangeEnd = state.vacationDraft.rangeMode === 'period' ? state.vacationDraft.end : state.vacationDraft.start;
        var selectedYear = String(Number(state.vacationDraft.year) || new Date().getFullYear());
        if (String(state.vacationDraft.start || '').slice(0, 4) !== selectedYear || String(rangeEnd || '').slice(0, 4) !== selectedYear) {
          state.vacationManagerError = 'Scegli date comprese nel ' + selectedYear + '.';
          render();
          return;
        }
        var result = addVacationRange(state.vacationDraft.start, rangeEnd);
        if (!result.ok) {
          state.vacationManagerError = result.reason === 'range' ? 'Il periodo non puo superare un anno.' : 'Controlla le date inserite.';
          render();
          return;
        }
        state.vacationStatus = result.added
          ? (result.added + (result.added === 1 ? ' giorno di ferie aggiunto.' : ' giorni di ferie aggiunti.') + (result.skipped ? (' ' + result.skipped + ' giorni non modificati.') : ''))
          : 'Nessun giorno aggiunto: il periodo non contiene giornate lavorative libere.';
        state.vacationManagerOpen = false;
        state.vacationManagerError = '';
        render();
      };

      var settingsAutosaveTimer = 0;
      var commitSettingsDraft = function () {
        state.settings = normalizeRuntimeSettings(Object.assign({}, state.settings, state.settingsDraft));
        state.settingsDraft = Object.assign({}, state.settings);
        saveSettings();
      };
      var queueSettingsAutosave = function (delay) {
        if (settingsAutosaveTimer) clearTimeout(settingsAutosaveTimer);
        settingsAutosaveTimer = setTimeout(function () {
          settingsAutosaveTimer = 0;
          commitSettingsDraft();
        }, typeof delay === 'number' ? delay : 140);
      };

      var userName = document.getElementById('userNameInput');
      if (userName) userName.oninput = function (e) {
        state.settingsDraft.userName = String(e.target.value || '').slice(0, 24);
        queueSettingsAutosave(180);
      };
      var weekly = document.getElementById('weeklyTargetInput');
      if (weekly) weekly.oninput = function (e) {
        state.settingsDraft.weeklyTarget = Number(e.target.value) || 0;
        queueSettingsAutosave(120);
      };
      var daily = document.getElementById('dailyTargetInput');
      if (daily) daily.oninput = function (e) {
        state.settingsDraft.dailyTarget = Number(e.target.value) || 0;
        queueSettingsAutosave(120);
      };
      var holidayOffDaysToggle = document.querySelector('[data-toggle-holiday-offdays]');
      if (holidayOffDaysToggle) holidayOffDaysToggle.onclick = function () {
        state.settingsDraft.holidayHoursOnOffDays = !Boolean(state.settingsDraft.holidayHoursOnOffDays);
        commitSettingsDraft();
        render();
      };

      document.querySelectorAll('[data-toggle-workday]').forEach(function (btn) {
        btn.onclick = function () {
          var index = Number(btn.dataset.toggleWorkday);
          state.settingsDraft.workdays = normalizeWeekdayList(state.settingsDraft.workdays || []);
          var pos = state.settingsDraft.workdays.indexOf(index);
          if (pos !== -1) state.settingsDraft.workdays.splice(pos, 1);
          else { state.settingsDraft.workdays.push(index); state.settingsDraft.workdays.sort(function (a, b) { return a - b; }); }
          commitSettingsDraft();
          render();
        };
      });

      document.querySelectorAll('[data-toggle-auto-rest-day]').forEach(function (btn) {
        btn.onclick = function () {
          var index = Number(btn.dataset.toggleAutoRestDay);
          var list = normalizeWeekdayList(state.settingsDraft.autoRestDays || []);
          var pos = list.indexOf(index);
          if (pos !== -1) list.splice(pos, 1);
          else { list.push(index); list.sort(function (a, b) { return a - b; }); }
          state.settingsDraft.autoRestDays = list;
          commitSettingsDraft();
          render();
        };
      });
      var csvBtn = document.querySelector('[data-export-csv]');
      if (csvBtn) csvBtn.onclick = exportCSV;
      var repBtn = document.querySelector('[data-export-report]');
      if (repBtn) repBtn.onclick = exportReport;
      var repYearBtn = document.querySelector('[data-export-report-year]');
      if (repYearBtn) repYearBtn.onclick = exportYearReport;

      var reminderToggle = document.querySelector('[data-toggle-reminders]');
      if (reminderToggle) reminderToggle.onclick = async function () {
        state.settings.remindersEnabled = !state.settings.remindersEnabled;
        state.settingsDraft.remindersEnabled = state.settings.remindersEnabled;
        saveSettings();
        if (state.settings.remindersEnabled) await ensureNotificationPermission(true);
        updateReminderSchedule();
        render();
      };
      var reminderTime = document.getElementById('reminderTimeInput');
      if (reminderTime) reminderTime.onchange = function (e) {
        state.settings.reminderTime = e.target.value;
        state.settingsDraft.reminderTime = e.target.value;
        saveSettings();
        updateReminderSchedule();
        render();
      };
      var testBtn = document.querySelector('[data-test-notification]');
      if (testBtn) testBtn.onclick = testNotification;

      var lockToggle = document.querySelector('[data-toggle-lock]');
      if (lockToggle) lockToggle.onclick = function () {
        state.settings.lockApp = !state.settings.lockApp;
        state.settingsDraft.lockApp = state.settings.lockApp;
        if (!state.settings.lockApp) state.privacyLocked = false;
        saveSettings(); render();
      };

      var shiftTimerToggle = document.querySelector('[data-toggle-shift-timer]');
      if (shiftTimerToggle) shiftTimerToggle.onclick = function () {
        if (state.settings.timerEnabled && state.shiftTimer && state.shiftTimer.active) {
          state.timerNotice = 'Termina o annulla il turno prima di disattivare il timer.';
          state.activeTab = 'home';
          render();
          return;
        }
        state.settings.timerEnabled = !Boolean(state.settings.timerEnabled);
        state.settingsDraft.timerEnabled = state.settings.timerEnabled;
        saveSettings();
        render();
      };

      document.querySelectorAll('[data-timer-start]').forEach(function (btn) {
        btn.onclick = startShiftTimer;
      });
      document.querySelectorAll('[data-timer-toggle-pause]').forEach(function (btn) {
        btn.onclick = function () {
          if (state.shiftTimer && state.shiftTimer.status === 'paused') resumeShiftTimer();
          else pauseShiftTimer();
        };
      });
      document.querySelectorAll('[data-timer-finish]').forEach(function (btn) {
        btn.onclick = finishShiftTimer;
      });
      document.querySelectorAll('[data-timer-discard-request]').forEach(function (btn) {
        btn.onclick = function () { state.timerDiscardConfirm = true; render(); };
      });
      document.querySelectorAll('[data-timer-discard-cancel]').forEach(function (btn) {
        btn.onclick = function () { state.timerDiscardConfirm = false; render(); };
      });
      document.querySelectorAll('[data-timer-discard-confirm]').forEach(function (btn) {
        btn.onclick = discardShiftTimer;
      });

      document.querySelectorAll('[data-open-global-search]').forEach(function (btn) {
        btn.onclick = function () {
          state.globalSearchOpen = true;
          state.globalSearchQuery = '';
          render();
          window.setTimeout(function () {
            var input = document.getElementById('globalSearchInput');
            if (input) input.focus({ preventScroll: true });
          }, 40);
        };
      });
      document.querySelectorAll('[data-close-global-search]').forEach(function (btn) {
        btn.onclick = function () { state.globalSearchOpen = false; state.globalSearchQuery = ''; render(); };
      });
      document.querySelectorAll('[data-clear-global-search]').forEach(function (btn) {
        btn.onclick = function () {
          state.globalSearchQuery = '';
          var input = document.getElementById('globalSearchInput');
          var results = document.getElementById('globalSearchResults');
          var caption = document.getElementById('globalSearchCaption');
          if (input) { input.value = ''; input.focus({ preventScroll: true }); }
          if (results) results.innerHTML = renderGlobalSearchResultsMarkup('');
          if (caption) caption.textContent = 'ELEMENTI RECENTI';
        };
      });
      var globalSearchInput = document.getElementById('globalSearchInput');
      if (globalSearchInput) globalSearchInput.oninput = function (event) {
        state.globalSearchQuery = String(event.target.value || '');
        var results = document.getElementById('globalSearchResults');
        var caption = document.getElementById('globalSearchCaption');
        if (results) results.innerHTML = renderGlobalSearchResultsMarkup(state.globalSearchQuery);
        if (caption) caption.textContent = state.globalSearchQuery.trim() ? 'RISULTATI' : 'ELEMENTI RECENTI';
        bindGlobalSearchResultEvents();
      };

      function bindGlobalSearchResultEvents() {
        document.querySelectorAll('[data-search-open-date]').forEach(function (btn) {
          btn.onclick = function () {
            state.globalSearchOpen = false;
            openEditor(new Date(btn.dataset.searchOpenDate + 'T12:00:00'));
          };
        });
        document.querySelectorAll('[data-search-open-payslip]').forEach(function (btn) {
          btn.onclick = function () {
            var found = (state.payslips || []).find(function (item) { return String(item.id || '') === String(btn.dataset.searchOpenPayslip || ''); });
            if (!found) return;
            state.globalSearchOpen = false;
            state.payslipDetailId = found.id;
            state.payslipEditorOpen = false;
            state.payslipStatsOpen = false;
            state.payslipViewer = null;
            state.activeTab = 'payslips';
            render();
          };
        });
      }
      bindGlobalSearchResultEvents();

      document.querySelectorAll('[data-insight-date]').forEach(function (btn) {
        btn.onclick = function () { openEditor(new Date(btn.dataset.insightDate + 'T12:00:00')); };
      });
      document.querySelectorAll('[data-insight-tab]').forEach(function (btn) {
        btn.onclick = function () { activatePrimaryTab(btn.dataset.insightTab, btn, 60); };
      });
      document.querySelectorAll('[data-insight-payslips]').forEach(function (btn) {
        btn.onclick = function () {
          state.activeTab = 'payslips';
          state.payslipDetailId = '';
          state.payslipEditorOpen = false;
          state.payslipStatsOpen = false;
          render();
        };
      });

      document.querySelectorAll('[data-select-type]').forEach(function (btn) {
        btn.onclick = function () {
          if (!state.draft) return;
          var nextType = btn.dataset.selectType;
          state.draft.type = nextType;
          if (nextType === 'riposo') {
            state.draft.start = '';
            state.draft.end = '';
            state.draft.breakHours = 0;
            state.draft.overtimeHours = 0;
            state.draft.overtimeManual = false;
            state.draft.leaveHours = 0;
            state.draft.quantityHours = 0;
            delete state.draft.holidayName;
          } else if (isStateOnlyType(nextType)) {
            state.draft.start = '';
            state.draft.end = '';
            state.draft.breakHours = 0;
            state.draft.overtimeHours = 0;
            state.draft.overtimeManual = false;
            state.draft.leaveHours = 0;
            if (nextType === 'festivita_pagata') {
              state.draft.quantityHours = getAutoHolidayHours(state.editingDate || new Date());
              var holidayInfo = state.editingDate ? getItalianHolidayInfo(state.editingDate) : null;
              state.draft.holidayName = holidayInfo && holidayInfo.name ? holidayInfo.name : (state.draft.holidayName || '');
            } else {
              delete state.draft.holidayName;
            }
          } else {
            state.draft.quantityHours = 0;
            delete state.draft.holidayName;
            if (!state.draft.overtimeManual) state.draft.overtimeHours = minutesToHours(getAutoOvertimeMinutes(state.draft));
          }
          state.typeOpen = false;
          scheduleEditorAutosave();
          render();
        };
      });
      var toggleType = document.querySelector('[data-toggle-type-open]');
      if (toggleType) toggleType.onclick = function () { state.typeOpen = !state.typeOpen; render(); };
      var toggleNotes = document.querySelector('[data-toggle-notes-open]');
      if (toggleNotes) toggleNotes.onclick = function () { state.notesOpen = !state.notesOpen; render(); };
      var closeBtn = document.querySelector('[data-close-editor]');
      if (closeBtn) closeBtn.onclick = function () { closeEditor(); };
      var start = document.getElementById('editorStart');
      if (start) {
        var syncStart = function (value) {
          syncTimeFieldState(start);
          if (!state.draft) return;
          state.draft.start = normalizeTimeInputValue(value);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
          scheduleEditorAutosave();
        };
        syncTimeFieldState(start);
        start.oninput = function (e) { syncStart(e.target.value); };
        start.onchange = function (e) { syncStart(e.target.value); };
        start.onblur = function (e) {
          var normalized = normalizeTimeInputValue(e.target.value);
          e.target.value = normalized;
          syncStart(normalized);
          flushEditorAutosave();
        };
      }
      var end = document.getElementById('editorEnd');
      if (end) {
        var syncEnd = function (value) {
          syncTimeFieldState(end);
          if (!state.draft) return;
          state.draft.end = normalizeTimeInputValue(value);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
          scheduleEditorAutosave();
        };
        syncTimeFieldState(end);
        end.oninput = function (e) { syncEnd(e.target.value); };
        end.onchange = function (e) { syncEnd(e.target.value); };
        end.onblur = function (e) {
          var normalized = normalizeTimeInputValue(e.target.value);
          e.target.value = normalized;
          syncEnd(normalized);
          flushEditorAutosave();
        };
      }
      var breakH = document.getElementById('editorBreakHours');
      if (breakH) {
        breakH.onfocus = function (e) {
          if (isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        breakH.oninput = function (e) {
          if (!state.draft) return;
          var clean = sanitizeDecimalTyping(e.target.value);
          if (e.target.value !== clean) e.target.value = clean;
          state.draft.breakHours = parseDecimalInput(clean, 0);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
          scheduleEditorAutosave();
        };
        breakH.onblur = function (e) {
          if (!state.draft) return;
          state.draft.breakHours = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.draft.breakHours || 0);
          syncDraftAutoOvertime();
          updateEditorSummaryUI();
          flushEditorAutosave();
        };
      }
      var overtime = document.getElementById('editorOvertimeHours');
      if (overtime) {
        overtime.onfocus = function (e) {
          if (!state.draft) return;
          if (!state.draft.overtimeManual || isZeroLikeDecimalText(e.target.value)) e.target.value = '';
          requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); });
        };
        overtime.oninput = function (e) {
          if (!state.draft) return;
          var clean = sanitizeDecimalTyping(e.target.value);
          if (e.target.value !== clean) e.target.value = clean;
          state.draft.overtimeManual = Boolean(clean);
          state.draft.overtimeHours = parseDecimalInput(clean, 0);
          updateEditorSummaryUI();
          scheduleEditorAutosave();
        };
        overtime.onblur = function (e) {
          if (!state.draft) return;
          var raw = String(e.target.value || '').trim();
          if (!raw) {
            state.draft.overtimeManual = false;
            syncDraftAutoOvertime(true);
            updateEditorSummaryUI();
            scheduleEditorAutosave();
            flushEditorAutosave();
            return;
          }
          state.draft.overtimeManual = true;
          state.draft.overtimeHours = parseDecimalInput(raw, 0);
          e.target.value = formatEditorDecimal(state.draft.overtimeHours || 0);
          updateEditorSummaryUI();
          scheduleEditorAutosave();
          flushEditorAutosave();
        };
      }
      document.querySelectorAll('[data-adjust-editor-hours]').forEach(function (button) {
        button.onclick = function () {
          if (!state.draft) return;
          var field = button.getAttribute('data-adjust-editor-hours');
          if (['breakHours', 'overtimeHours', 'leaveHours'].indexOf(field) === -1) return;
          var delta = Number(button.getAttribute('data-editor-delta')) || 0;
          var nextValue = Math.min(24, Math.max(0, Math.round((parseDecimalInput(state.draft[field], 0) + delta) * 100) / 100));
          state.draft[field] = nextValue;
          if (field === 'overtimeHours') state.draft.overtimeManual = true;
          if (field === 'breakHours') syncDraftAutoOvertime();
          var inputId = field === 'breakHours' ? 'editorBreakHours' : (field === 'overtimeHours' ? 'editorOvertimeHours' : 'editorLeaveHours');
          var fieldInput = document.getElementById(inputId);
          if (fieldInput) fieldInput.value = formatEditorDecimal(state.draft[field] || 0);
          updateEditorSummaryUI();
          scheduleEditorAutosave();
        };
      });
      var overtimeAuto = document.querySelector('[data-toggle-editor-overtime-auto]');
      if (overtimeAuto) overtimeAuto.onclick = function () {
        if (!state.draft) return;
        if (state.draft.overtimeManual) {
          state.draft.overtimeManual = false;
          syncDraftAutoOvertime(true);
        } else {
          state.draft.overtimeManual = true;
          state.draft.overtimeHours = minutesToHours(getBreakdown(state.draft).overtime);
          var overtimeField = document.getElementById('editorOvertimeHours');
          if (overtimeField) overtimeField.value = formatEditorDecimal(state.draft.overtimeHours || 0);
        }
        updateEditorSummaryUI();
        scheduleEditorAutosave();
      };
      var leaveInput = document.getElementById('editorLeaveHours');
      if (leaveInput) {
        leaveInput.onfocus = function (e) { if (isZeroLikeDecimalText(e.target.value)) e.target.value = ''; requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); }); };
        leaveInput.oninput = function (e) { if (!state.draft) return; var clean = sanitizeDecimalTyping(e.target.value); if (e.target.value !== clean) e.target.value = clean; state.draft.leaveHours = parseDecimalInput(clean, 0); updateEditorSummaryUI(); scheduleEditorAutosave(); };
        leaveInput.onblur = function (e) { if (!state.draft) return; state.draft.leaveHours = parseDecimalInput(e.target.value, 0); e.target.value = formatEditorDecimal(state.draft.leaveHours || 0); scheduleEditorAutosave(); flushEditorAutosave(); };
      }
      var quantityInput = document.getElementById('editorQuantityHours');
      if (quantityInput) {
        quantityInput.onfocus = function (e) { if (isZeroLikeDecimalText(e.target.value)) e.target.value = ''; requestAnimationFrame(function () { e.target.setSelectionRange(e.target.value.length, e.target.value.length); }); };
        quantityInput.oninput = function (e) { if (!state.draft) return; var clean = sanitizeDecimalTyping(e.target.value); if (e.target.value !== clean) e.target.value = clean; state.draft.quantityHours = parseDecimalInput(clean, 0); updateEditorSummaryUI(); scheduleEditorAutosave(); };
        quantityInput.onblur = function (e) {
          if (!state.draft) return;
          state.draft.quantityHours = parseDecimalInput(e.target.value, 0);
          e.target.value = formatEditorDecimal(state.draft.quantityHours || 0);
          updateEditorSummaryUI();
          scheduleEditorAutosave();
          flushEditorAutosave();
        };
      }
      var clearDay = document.querySelector('[data-clear-day]');
      if (clearDay) clearDay.onclick = requestClearEditorDay;
      var closeConfirm = document.querySelector('[data-close-confirm]');
      if (closeConfirm) closeConfirm.onclick = function () { state.confirmClearOpen = false; render(); };
      var confirmClear = document.querySelector('[data-confirm-clear]');
      if (confirmClear) confirmClear.onclick = function () { clearEditorDay(); };
      var notes = document.getElementById('editorNotes');
      if (notes) {
        notes.oninput = function (e) { if (!state.draft) return; state.draft.notes = e.target.value; scheduleEditorAutosave(); };
        notes.onblur = flushEditorAutosave;
      }
    }

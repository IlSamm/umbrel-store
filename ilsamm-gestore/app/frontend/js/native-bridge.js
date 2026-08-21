window.GestOreNative = window.GestOreNative || {
  isNative: false,
  notificationPermission: 'unsupported',
  requestNotifications: function () { return Promise.resolve('unsupported'); },
  notifyNow: function () { return Promise.resolve(false); },
  scheduleNotification: function () { return Promise.resolve(false); },
  cancelNotification: function () { return Promise.resolve(); },
  haptic: function () { return Promise.resolve(); },
  shareBlob: function () { return Promise.resolve(false); },
  pickPayslipPhotos: function () { return Promise.resolve([]); }
};

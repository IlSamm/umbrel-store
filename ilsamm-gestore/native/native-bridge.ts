import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

type NativeNotification = {
  id?: number;
  title: string;
  body: string;
  at?: string | Date;
  extra?: Record<string, unknown>;
};

type PayslipPhotoInput = {
  id?: string;
  data?: string;
  dataUrl?: string;
  fileName?: string;
  createdAt?: number;
};

type PayslipPhotoRef = {
  id: string;
  path: string;
  fileName: string;
  mimeType: string;
  createdAt: number;
};

function safePathSegment(value: string, fallback: string): string {
  const cleaned = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 96);
  return cleaned || fallback;
}

function parseDataUrl(value: string): { mimeType: string; base64: string } {
  const match = String(value || '').match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) throw new Error('Formato immagine non valido');
  return { mimeType: match[1] || 'image/jpeg', base64: match[2] };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.readAsDataURL(blob);
  });
}

async function pathToDataUrl(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Unable to read selected image');
  const blob = await response.blob();
  return `data:${blob.type || 'image/jpeg'};base64,${await blobToBase64(blob)}`;
}

const isNative = Capacitor.isNativePlatform();

const bridge = {
  isNative,
  notificationPermission: 'prompt',

  async requestNotifications(): Promise<string> {
    if (!isNative) return 'unsupported';
    const current = await LocalNotifications.checkPermissions();
    const result = current.display === 'prompt'
      ? await LocalNotifications.requestPermissions()
      : current;
    this.notificationPermission = result.display;
    return result.display;
  },

  async notifyNow(notification: NativeNotification): Promise<boolean> {
    if (!isNative) return false;
    const permission = await this.requestNotifications();
    if (permission !== 'granted') return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: notification.id || 91001,
        title: notification.title,
        body: notification.body,
        schedule: { at: new Date(Date.now() + 250) },
        extra: notification.extra || {}
      }]
    });
    return true;
  },

  async scheduleNotification(notification: NativeNotification): Promise<boolean> {
    if (!isNative || !notification.at) return false;
    const permission = await this.requestNotifications();
    if (permission !== 'granted') return false;
    const at = notification.at instanceof Date ? notification.at : new Date(notification.at);
    if (!Number.isFinite(at.getTime())) return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: notification.id || 91002,
        title: notification.title,
        body: notification.body,
        schedule: { at, allowWhileIdle: true },
        extra: notification.extra || {}
      }]
    });
    return true;
  },

  async cancelNotification(id = 91002): Promise<void> {
    if (isNative) await LocalNotifications.cancel({ notifications: [{ id }] });
  },

  async haptic(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
    if (!isNative) return;
    const impact = style === 'heavy' ? ImpactStyle.Heavy : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style: impact });
  },

  async shareBlob(filename: string, blob: Blob): Promise<boolean> {
    if (!isNative) return false;
    const safeName = String(filename || 'GestOre_file').replace(/[^A-Za-z0-9._-]+/g, '_');
    const data = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({ path: safeName, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: 'Esporta da GestOre', files: [saved.uri], dialogTitle: 'Salva o condividi' });
    return true;
  },

  async pickPayslipPhotos(mode: 'camera' | 'gallery', limit = 8): Promise<Array<{ dataUrl: string; fileName: string }>> {
    if (!isNative) return [];
    if (mode === 'camera') {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        quality: 92,
        correctOrientation: true,
        saveToGallery: false
      });
      const dataUrl = photo.dataUrl || (photo.webPath ? await pathToDataUrl(photo.webPath) : '');
      return dataUrl ? [{ dataUrl, fileName: `cedolino-${Date.now()}.jpg` }] : [];
    }

    const selected = await Camera.pickImages({ quality: 92, limit: Math.max(1, Math.min(8, limit)) });
    return Promise.all(selected.photos.map(async (photo, index) => ({
      dataUrl: await pathToDataUrl(photo.webPath),
      fileName: `cedolino-${Date.now()}-${index + 1}.${photo.format || 'jpg'}`
    })));
  },

  async savePayslipAssets(payslipId: string, photos: PayslipPhotoInput[]): Promise<PayslipPhotoRef[]> {
    if (!isNative) return [];
    const safePayslipId = safePathSegment(payslipId, `cedolino-${Date.now()}`);
    const folder = `GestOre/Cedolini/${safePayslipId}`;
    try {
      await Filesystem.rmdir({ path: folder, directory: Directory.LibraryNoCloud, recursive: true });
    } catch (_) {
      // The folder normally does not exist on the first save.
    }

    const refs: PayslipPhotoRef[] = [];
    const sourcePhotos = Array.isArray(photos) ? photos.slice(0, 8) : [];
    for (let index = 0; index < sourcePhotos.length; index += 1) {
      const photo = sourcePhotos[index] || {};
      const parsed = parseDataUrl(String(photo.data || photo.dataUrl || ''));
      const extension = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const photoId = safePathSegment(String(photo.id || `foto-${index + 1}`), `foto-${index + 1}`);
      const path = `${folder}/${photoId}.${extension}`;
      await Filesystem.writeFile({
        path,
        data: parsed.base64,
        directory: Directory.LibraryNoCloud,
        recursive: true
      });
      refs.push({
        id: photoId,
        path,
        fileName: String(photo.fileName || `${photoId}.${extension}`),
        mimeType: parsed.mimeType,
        createdAt: Math.max(0, Number(photo.createdAt) || Date.now())
      });
    }
    return refs;
  },

  async loadPayslipAssets(refs: PayslipPhotoRef[]): Promise<Array<PayslipPhotoRef & { dataUrl: string }>> {
    if (!isNative) return [];
    const sourceRefs = Array.isArray(refs) ? refs.slice(0, 8) : [];
    const loaded: Array<PayslipPhotoRef & { dataUrl: string }> = [];
    for (const ref of sourceRefs) {
      try {
        const result = await Filesystem.readFile({ path: ref.path, directory: Directory.LibraryNoCloud });
        if (typeof result.data !== 'string' || !result.data) continue;
        loaded.push({ ...ref, dataUrl: `data:${ref.mimeType || 'image/jpeg'};base64,${result.data}` });
      } catch (_) {
        // Keep loading the remaining pages if a single local file is unavailable.
      }
    }
    return loaded;
  },

  async deletePayslipAssets(payslipId: string): Promise<void> {
    if (!isNative) return;
    const safePayslipId = safePathSegment(payslipId, 'cedolino');
    try {
      await Filesystem.rmdir({
        path: `GestOre/Cedolini/${safePayslipId}`,
        directory: Directory.LibraryNoCloud,
        recursive: true
      });
    } catch (_) {
      // Deleting an already missing attachment folder is a successful outcome.
    }
  }
};

declare global {
  interface Window { GestOreNative: typeof bridge; }
}

window.GestOreNative = bridge;

if (isNative) {
  document.documentElement.classList.add('gestore-native');
  StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
  SplashScreen.hide().catch(() => undefined);
  App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('gestore:native-app-state', { detail: { isActive } }));
  }).catch(() => undefined);
  Keyboard.addListener('keyboardWillShow', (info) => {
    document.documentElement.style.setProperty('--native-keyboard-height', `${Math.max(0, info.keyboardHeight)}px`);
    document.documentElement.classList.add('native-keyboard-open');
  }).catch(() => undefined);
  Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.style.setProperty('--native-keyboard-height', '0px');
    document.documentElement.classList.remove('native-keyboard-open');
  }).catch(() => undefined);
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-tab]') : null;
    if (target) bridge.haptic('light').catch(() => undefined);
  }, { passive: true });
}

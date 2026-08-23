import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = path.join(root, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
const projectPath = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const infoPath = path.join(root, 'ios', 'App', 'App', 'Info.plist');
const privacyPath = path.join(root, 'ios', 'App', 'App', 'PrivacyInfo.xcprivacy');

let packageSource = await readFile(packagePath, 'utf8');
packageSource = packageSource.replace(/path: "([^"]+)"/g, (_match, packageLocation) => (
  `path: "${packageLocation.replaceAll('\\', '/')}"`
));
await writeFile(packagePath, packageSource, 'utf8');

const [project, info, privacy] = await Promise.all([
  readFile(projectPath, 'utf8'),
  readFile(infoPath, 'utf8'),
  readFile(privacyPath, 'utf8')
]);

const requirements = [
  [project.includes('MARKETING_VERSION = 1.8.4;'), 'Xcode marketing version 1.8.4'],
  [project.includes('CURRENT_PROJECT_VERSION = 184;'), 'Xcode build number 184'],
  [project.includes('PrivacyInfo.xcprivacy in Resources'), 'privacy manifest target membership'],
  [info.includes('NSCameraUsageDescription'), 'camera permission text'],
  [info.includes('NSPhotoLibraryUsageDescription'), 'photo library permission text'],
  [privacy.includes('NSPrivacyTracking') && privacy.includes('<false/>'), 'tracking declaration'],
  [packageSource.includes('../../../node_modules/'), 'local Swift package root'],
  [!packageSource.match(/path: "[^"]*\\/), 'macOS-compatible Swift package paths']
];

const missing = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (missing.length) throw new Error(`iOS configuration incomplete: ${missing.join(', ')}`);
console.log('iOS project configuration verified.');

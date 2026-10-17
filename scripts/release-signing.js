/**
 * Points the release build at Sahm's own signing key instead of the public
 * test key Expo's template uses. Run after `expo prebuild`, only when
 * android/app/release.keystore exists (the workflow decrypts it there).
 * Passwords come from the environment, never from the repo.
 */
const fs = require('fs');
const path = 'android/app/build.gradle';
if (!fs.existsSync('android/app/release.keystore')) {
  console.log('No release keystore: keeping the test key');
  process.exit(0);
}
let g = fs.readFileSync(path, 'utf8');
if (!g.includes('signingConfigs {') || !g.includes('signingConfig signingConfigs.debug')) {
  console.error('build.gradle has an unexpected shape; not changing signing');
  process.exit(1);
}
g = g.replace(
  'signingConfigs {',
  `signingConfigs {
        release {
            storeFile file('release.keystore')
            storePassword System.getenv('SAHM_SIGNING_PASSWORD')
            keyAlias 'sahm'
            keyPassword System.getenv('SAHM_SIGNING_PASSWORD')
        }`,
);
// only the release build type: its block is the one after "release {" in buildTypes
const i = g.indexOf('buildTypes {');
const j = g.indexOf('release {', i);
const k = g.indexOf('signingConfig signingConfigs.debug', j);
if (i < 0 || j < 0 || k < 0) {
  console.error('release build type not found');
  process.exit(1);
}
g = g.slice(0, k) + 'signingConfig signingConfigs.release' + g.slice(k + 'signingConfig signingConfigs.debug'.length);
fs.writeFileSync(path, g);
console.log('Release build signed with Sahm\'s own key');

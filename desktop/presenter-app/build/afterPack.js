// Mac builds are not signed with a paid Apple certificate, but an app with no signature at all will not start on an
// Apple chip Mac ("is damaged"). Signing it ad hoc with "-" fixes that for both Apple chip and Intel Macs.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log('Signed ad hoc: ' + app);
};

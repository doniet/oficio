// Firma de release con la llave de Oficios Cuba. La plantilla de React Native firma el release con
// signingConfigs.debug (una llave pública, igual en todas las máquinas): un APK así no se podría
// actualizar luego con la llave buena. `expo prebuild` regenera android/, por eso va en un plugin.
// La llave NO está en el repo: la dan OFICIO_FIRMA_ALMACEN / OFICIO_FIRMA_CLAVE (scripts/apk-release.sh).
// Sin esas variables el release sigue firmado con debug (builds locales de desarrollo).
const { withAppBuildGradle } = require('expo/config-plugins');

const CONFIG_RELEASE = `
        release {
            if (System.getenv('OFICIO_FIRMA_ALMACEN')) {
                storeFile file(System.getenv('OFICIO_FIRMA_ALMACEN'))
                storePassword System.getenv('OFICIO_FIRMA_CLAVE')
                keyAlias System.getenv('OFICIO_FIRMA_ALIAS') ?: 'oficios'
                keyPassword System.getenv('OFICIO_FIRMA_CLAVE')
            }
        }`;

module.exports = function firmaRelease(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes('OFICIO_FIRMA_ALMACEN')) return c;

    const inicioConfigs = g.indexOf('signingConfigs {');
    const tipos = g.indexOf('buildTypes {');
    const release = tipos < 0 ? -1 : g.indexOf('release {', tipos);
    const debugEnRelease = release < 0 ? -1 : g.indexOf('signingConfig signingConfigs.debug', release);
    // Si la plantilla cambia, que falle el prebuild en vez de firmar en silencio con la llave de debug.
    if (inicioConfigs < 0 || debugEnRelease < 0) throw new Error('firma-release: build.gradle no tiene la forma esperada');

    g = g.slice(0, debugEnRelease)
      + "signingConfig System.getenv('OFICIO_FIRMA_ALMACEN') ? signingConfigs.release : signingConfigs.debug"
      + g.slice(debugEnRelease + 'signingConfig signingConfigs.debug'.length);
    const tras = inicioConfigs + 'signingConfigs {'.length;
    c.modResults.contents = g.slice(0, tras) + CONFIG_RELEASE + g.slice(tras);
    return c;
  });
};

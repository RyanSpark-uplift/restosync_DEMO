// Expo SDK 55 / RN 0.83 / React 19. Native-first, but carries the Zustand-on-web
// CJS fix (see below) so the TV screen can also run in a browser for testing.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Single-instance pin for `react` so Metro never loads two copies under pnpm
// hoisting (workspace root vs app-local). Resolve from the app's perspective —
// works whether react lives at root (hoisted) or apps/tv/node_modules (isolated).
const pinned = {
  react: path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-native': path.dirname(require.resolve('react-native/package.json', { paths: [projectRoot] })),
};

// Zustand on web → CJS build. Its ESM build (zustand/esm/*.mjs) uses
// `import.meta.env`, which Metro's classic IIFE web bundle cannot parse →
// SyntaxError → blank screen. TV is native-first, but this is required to run
// the screen in a browser for testing. Mirrors apps/tablet/metro.config.js
// (AG-020 import.meta check).
const zustandRoot = path.dirname(
  require.resolve('zustand/package.json', { paths: [projectRoot] })
);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const [name, root] of Object.entries(pinned)) {
    if (moduleName === name) {
      return { type: 'sourceFile', filePath: require.resolve(root) };
    }
    if (moduleName.startsWith(name + '/')) {
      const sub = moduleName.slice(name.length + 1);
      return {
        type: 'sourceFile',
        filePath: require.resolve(path.join(root, sub)),
      };
    }
  }

  // Zustand → CJS on web
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    const sub = moduleName === 'zustand' ? 'index.js' : moduleName.slice('zustand/'.length) + '.js';
    return { type: 'sourceFile', filePath: path.join(zustandRoot, sub) };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch workspace packages
config.watchFolders = [workspaceRoot];

// Resolve from local node_modules first, then workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// ── Pinned single-instance resolutions ───────────────────────────────────────
// pnpm hoists multiple versions for transitive peer-dep windows. Metro can end
// up loading two instances of the same package, which breaks runtime invariants
// (e.g. React's "react and react-dom versions must match" check).
// Resolve react/react-dom to wherever node resolution actually places them from
// the app (app-local under the isolated linker, workspace root under hoisted), so
// the single-instance pin stays valid regardless of the pnpm node-linker mode.
const pinned = {
  react:       path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-dom': path.dirname(require.resolve('react-dom/package.json', { paths: [projectRoot] })),
};

// Zustand on web → CJS build (its ESM build uses `import.meta.env` which Metro's
// IIFE web bundle cannot parse → SyntaxError → blank screen).
const zustandRoot = path.dirname(
  require.resolve('zustand/package.json', { paths: [projectRoot] })
);

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 1) Pinned single-instance packages — match exact name and subpaths
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

  // 2) Zustand → CJS on web
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

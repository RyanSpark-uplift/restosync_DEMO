const path = require('path');

// Toolchain fix #1 (2026-05-23): expo-router SDK 55 babel-preset-expo가
// require.context 인자로 process.env.EXPO_ROUTER_APP_ROOT를 inline하지 못해
// "First argument of require.context should be a string" 번들 실패.
// 절대경로를 명시 주입하여 우회. .env 없이 모든 머신에서 동작.
process.env.EXPO_ROUTER_APP_ROOT =
  process.env.EXPO_ROUTER_APP_ROOT || path.join(__dirname, 'app');

module.exports = function (api) {
  api.cache.using(() => process.env.EXPO_ROUTER_APP_ROOT);
  return {
    presets: ['babel-preset-expo'],
    // Toolchain fix #2 (2026-05-23): @gorhom/bottom-sheet@5.x pre-built ESM에
    // worklets babel plugin이 재처리하며 SyntaxError 발생. overrides로 해당
    // 경로에서만 reanimated/worklets plugin 미적용. bottom-sheet 내부 worklets는
    // 이미 빌드 시 처리됨.
    overrides: [
      {
        exclude: /node_modules[\\/]+(?:\.pnpm[\\/]+[^\\/]+[\\/]+node_modules[\\/]+)?@gorhom[\\/]+bottom-sheet/,
        plugins: [
          // reanimated must be last; v4's /plugin path re-exports react-native-worklets/plugin
          'react-native-reanimated/plugin',
        ],
      },
    ],
  };
};

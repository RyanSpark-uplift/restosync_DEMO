// Registry of bundled Google Fonts ttf files for the 12-theme M02 pickup display.
// See apps/tv/assets/fonts/README.md for the file list and download instructions.
//
// Each entry: registered RN fontFamily name → require() of the ttf.
// 2026-05-19: all 23 ttfs bundled (Phase 2). Removing a line below also requires
// removing the file from assets/fonts/ — Metro fails on require() of missing assets.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FONT_ASSETS: Record<string, any> = {
  'Inter-Regular':            require('../../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium':             require('../../assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold':           require('../../assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold':               require('../../assets/fonts/Inter-Bold.ttf'),
  'Inter-ExtraBold':          require('../../assets/fonts/Inter-ExtraBold.ttf'),
  'Manrope-Medium':           require('../../assets/fonts/Manrope-Medium.ttf'),
  'Manrope-SemiBold':         require('../../assets/fonts/Manrope-SemiBold.ttf'),
  'Manrope-Bold':             require('../../assets/fonts/Manrope-Bold.ttf'),
  'DMSerifDisplay-Regular':   require('../../assets/fonts/DMSerifDisplay-Regular.ttf'),
  'PlayfairDisplay-Bold':     require('../../assets/fonts/PlayfairDisplay-Bold.ttf'),
  'CormorantGaramond-Medium': require('../../assets/fonts/CormorantGaramond-Medium.ttf'),
  'BebasNeue-Regular':        require('../../assets/fonts/BebasNeue-Regular.ttf'),
  'SpaceGrotesk-SemiBold':    require('../../assets/fonts/SpaceGrotesk-SemiBold.ttf'),
  'SpaceGrotesk-Bold':        require('../../assets/fonts/SpaceGrotesk-Bold.ttf'),
  'Fraunces-SemiBold':        require('../../assets/fonts/Fraunces-SemiBold.ttf'),
  'Quicksand-Medium':         require('../../assets/fonts/Quicksand-Medium.ttf'),
  'Quicksand-SemiBold':       require('../../assets/fonts/Quicksand-SemiBold.ttf'),
  'Quicksand-Bold':           require('../../assets/fonts/Quicksand-Bold.ttf'),
  'Lora-SemiBold':            require('../../assets/fonts/Lora-SemiBold.ttf'),
  'Lora-Bold':                require('../../assets/fonts/Lora-Bold.ttf'),
  'Cinzel-SemiBold':          require('../../assets/fonts/Cinzel-SemiBold.ttf'),
  'Cinzel-Bold':              require('../../assets/fonts/Cinzel-Bold.ttf'),
  'FamiljenGrotesk-Bold':     require('../../assets/fonts/FamiljenGrotesk-Bold.ttf'),
};

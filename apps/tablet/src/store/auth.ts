import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Login mode — chosen explicitly on the login screen, NOT derived from license key.
 * Drives which features are visible in Settings and Dashboard:
 *   • ready_only  — v1 customer-facing minimum: order pickup essentials only
 *   • two_display — full kitchen+pickup with brand themes; ready_only stuff hidden
 *   • engineering — both modes accessible + all hidden menus + ENG badges
 * engineering is gated behind a `:dev` license suffix (see hasDevSuffix).
 */
export type LoginMode = 'ready_only' | 'two_display' | 'engineering';

interface AuthState {
  token:        string | null;
  refreshToken: string | null;
  storeId:      string | null;
  role:         string | null;
  userName:     string | null;
  apiUrl:       string;
  licenseKey:   string;
  loginMode:    LoginMode;
  hydrated:     boolean;

  setAuth:       (p: { token: string; refreshToken: string; storeId: string; role: string; userName: string }) => void;
  setApiUrl:     (url: string) => void;
  setLicenseKey: (key: string) => void;
  setLoginMode:  (m: LoginMode) => void;
  clearAuth:     () => void;
  hydrate:       () => Promise<void>;
}

const KEY = {
  token:        'rs_access_token',
  refreshToken: 'rs_refresh_token',
  storeId:      'rs_store_id',
  role:         'rs_role',
  userName:     'rs_user_name',
  apiUrl:       'rs_api_url',
  licenseKey:   'rs_license_key',
  loginMode:    'rs_login_mode',
} as const;

const DEFAULT_API = 'http://localhost:3000';
const DEFAULT_LICENSE = 'RS-TEST-0001-AAAA:dev';
const DEFAULT_MODE: LoginMode = 'ready_only';

/**
 * `:dev` suffix on the license key means TWO things at runtime:
 *   1. Engineering mode is *available* on the login mode picker (otherwise hidden).
 *   2. TV target is the local Android emulator, not the production Onn 4K.
 * The suffix is stripped before sending the key to the API (auth endpoint only
 * knows the bare license_key).
 */
export const hasDevSuffix = (licenseKey: string | null | undefined): boolean =>
  !!licenseKey && licenseKey.endsWith(':dev');

/**
 * Back-compat alias — older callers used `isEngineerMode` to gate Engineer Test
 * panel. New code should branch on `loginMode === 'engineering'` instead.
 * Kept until those call sites migrate.
 */
export const isEngineerMode = (licenseKey: string | null | undefined): boolean =>
  hasDevSuffix(licenseKey);

/** TV target derived from license key. Used by Dashboard / Connection status. */
export type TvTarget = 'emulator' | 'onn_4k';
export const tvTarget = (licenseKey: string | null | undefined): TvTarget =>
  hasDevSuffix(licenseKey) ? 'emulator' : 'onn_4k';

const isWeb = Platform.OS === 'web';

const storage = {
  async get(key: string): Promise<string | null> {
    if (isWeb) {
      try { return globalThis.localStorage?.getItem(key) ?? null; }
      catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (isWeb) {
      try { globalThis.localStorage?.setItem(key, value); } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async del(key: string): Promise<void> {
    if (isWeb) {
      try { globalThis.localStorage?.removeItem(key); } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token:        null,
  refreshToken: null,
  storeId:      null,
  role:         null,
  userName:     null,
  apiUrl:       DEFAULT_API,
  licenseKey:   DEFAULT_LICENSE,
  loginMode:    DEFAULT_MODE,
  hydrated:     false,

  setAuth: ({ token, refreshToken, storeId, role, userName }) => {
    set({ token, refreshToken, storeId, role, userName });
    storage.set(KEY.token,        token).catch(console.error);
    storage.set(KEY.refreshToken, refreshToken).catch(console.error);
    storage.set(KEY.storeId,      storeId).catch(console.error);
    storage.set(KEY.role,         role).catch(console.error);
    storage.set(KEY.userName,     userName).catch(console.error);
  },

  setApiUrl: (url) => {
    set({ apiUrl: url });
    storage.set(KEY.apiUrl, url).catch(console.error);
  },

  setLicenseKey: (key) => {
    set({ licenseKey: key });
    storage.set(KEY.licenseKey, key).catch(console.error);
    // If the user removes :dev while in engineering mode, demote to ready_only —
    // engineering mode requires a dev license.
    if (!hasDevSuffix(key) && get().loginMode === 'engineering') {
      set({ loginMode: 'ready_only' });
      storage.set(KEY.loginMode, 'ready_only').catch(console.error);
    }
  },

  setLoginMode: (m) => {
    // Guard: engineering only allowed when license has :dev suffix.
    const next: LoginMode = m === 'engineering' && !hasDevSuffix(get().licenseKey)
      ? 'ready_only'
      : m;
    set({ loginMode: next });
    storage.set(KEY.loginMode, next).catch(console.error);
  },

  clearAuth: () => {
    set({ token: null, refreshToken: null, storeId: null, role: null, userName: null });
    [KEY.token, KEY.refreshToken, KEY.storeId, KEY.role, KEY.userName]
      .forEach((k) => storage.del(k).catch(console.error));
  },

  hydrate: async () => {
    try {
      const [token, refreshToken, storeId, role, userName, apiUrl, licenseKey, savedMode] = await Promise.all([
        storage.get(KEY.token),
        storage.get(KEY.refreshToken),
        storage.get(KEY.storeId),
        storage.get(KEY.role),
        storage.get(KEY.userName),
        storage.get(KEY.apiUrl),
        storage.get(KEY.licenseKey),
        storage.get(KEY.loginMode),
      ]);
      const lic = licenseKey ?? DEFAULT_LICENSE;
      // Validate persisted mode: engineering needs :dev suffix; fall back otherwise.
      const candidate = (savedMode as LoginMode | null) ?? DEFAULT_MODE;
      const mode: LoginMode = candidate === 'engineering' && !hasDevSuffix(lic) ? 'ready_only' : candidate;
      set({
        token,
        refreshToken,
        storeId,
        role,
        userName,
        apiUrl:     apiUrl ?? DEFAULT_API,
        licenseKey: lic,
        loginMode:  mode,
        hydrated:   true,
      });
    } catch (err) {
      console.warn('[auth] hydrate failed, continuing with defaults', err);
      set({ hydrated: true });
    }
  },
}));

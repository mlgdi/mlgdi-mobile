import manifest from '../manifest.json'

/** App 版本号：单源 manifest.json（CI 从 package.json 同步写入），设置页展示用 */
export const APP_VERSION = String((manifest as { versionName?: string }).versionName || '')

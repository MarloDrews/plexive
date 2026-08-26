package com.plexive.mobile.core.session

import com.russhwolf.settings.ExperimentalSettingsImplementation
import com.russhwolf.settings.KeychainSettings

// iOS's half of TokenStorage, delegated to multiplatform-settings' KeychainSettings. That class
// stores each key as a kSecClassGenericPassword item through SecItemAdd/SecItemUpdate/
// SecItemCopyMatching/SecItemDelete, which is the real Keychain and not the NSUserDefaults fallback
// some settings libraries use on Apple platforms.
//
// UNVERIFIED. Nothing in this project can compile, link or run an Apple target, so this file has
// never been through a compiler. See ARCHITECTURE.md for what the first Mac build has to check.
@OptIn(ExperimentalSettingsImplementation::class)
class KeychainTokenStorage : TokenStorage {

    // The service name groups this app's Keychain items. Keys become account names within it.
    private val settings = KeychainSettings(SERVICE)

    override fun read(): String? = settings.getStringOrNull(KEY_TOKEN)

    override fun write(token: String) = settings.putString(KEY_TOKEN, token)

    override fun clear() = settings.remove(KEY_TOKEN)

    private companion object {
        const val SERVICE = "com.plexive.mobile.session"
        const val KEY_TOKEN = "access_token"
    }
}

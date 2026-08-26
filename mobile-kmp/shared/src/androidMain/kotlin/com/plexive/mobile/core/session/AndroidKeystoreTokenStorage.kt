package com.plexive.mobile.core.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

// Android's half of TokenStorage. The token is encrypted with AES-GCM under a key that lives in the
// AndroidKeyStore and never leaves it: the key material is held by the system (hardware-backed on
// devices with a TEE or StrongBox), so the file this class writes holds ciphertext only.
//
// Written against the Keystore directly rather than EncryptedSharedPreferences: androidx.security
// 1.1.0 deprecated all of its APIs in favour of "existing platform APIs and direct use of Android
// Keystore", so the convenience wrapper is a dead dependency.
class AndroidKeystoreTokenStorage(context: Context) : TokenStorage {

    // An ordinary preferences file. It is private to the app, but that alone is not protection: it
    // is a readable file to anything that gets at the data directory, which is why only ciphertext
    // is ever put in it.
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun read(): String? {
        val stored = prefs.getString(KEY_TOKEN, null) ?: return null
        return try {
            val bytes = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(TAG_LENGTH_BITS, bytes.copyOfRange(0, IV_LENGTH)),
            )
            cipher.doFinal(bytes.copyOfRange(IV_LENGTH, bytes.size)).decodeToString()
        } catch (e: Exception) {
            // The stored value cannot be read back. That happens when the Keystore key was
            // invalidated (a device restore, a factory reset of the secure hardware) or the file was
            // tampered with. Neither is recoverable, so drop the entry and report no session rather
            // than crashing on every launch. The exception is not logged: its message can carry the
            // stored value on some providers.
            clear()
            null
        }
    }

    override fun write(token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // No IV is supplied: the provider generates a fresh random one per encryption, which is what
        // GCM requires. Reusing an IV under one key breaks the cipher outright.
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val payload = cipher.iv + cipher.doFinal(token.encodeToByteArray())
        prefs.edit().putString(KEY_TOKEN, Base64.encodeToString(payload, Base64.NO_WRAP)).apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY_TOKEN).apply()
    }

    // Get-or-create, so the first launch generates the key and every later one reuses it. Creating a
    // second key would make the already-stored ciphertext unreadable.
    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        val existing = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                // GCM is a stream mode, so it takes no padding.
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // No setUserAuthenticationRequired: a biometric prompt on every request is out of
                // scope for this batch.
                .build()
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEY_STORE = "AndroidKeyStore"
        const val KEY_ALIAS = "plexive_session_token"
        const val PREFS_NAME = "plexive_session"
        const val KEY_TOKEN = "access_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val TAG_LENGTH_BITS = 128
        const val IV_LENGTH = 12
    }
}

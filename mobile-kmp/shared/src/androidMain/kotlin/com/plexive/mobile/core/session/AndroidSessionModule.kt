package com.plexive.mobile.core.session

import android.content.Context
import org.koin.core.module.Module
import org.koin.dsl.module

// Android's TokenStorage binding. Hand-written rather than annotated because the implementation
// needs a Context, which only the Application entry point has; PlexiveAndroidApplication passes the
// result into initKoin.
fun androidSessionModule(context: Context): Module = module {
    single<TokenStorage> { AndroidKeystoreTokenStorage(context.applicationContext) }
}

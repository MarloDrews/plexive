package com.plexive.mobile.di

import android.content.Context
import com.plexive.mobile.core.session.androidSessionModule

// Android's Koin startup, kept in the shared module so the app module never has to touch Koin types
// (shared depends on Koin with implementation, so they are not on the app's compile classpath).
// The counterpart is initKoinIos.
fun initKoinAndroid(context: Context) {
    initKoin {
        modules(androidSessionModule(context))
    }
}

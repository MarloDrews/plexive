package com.plexive.mobile.di

import com.plexive.mobile.core.session.iosSessionModule

// The iOS counterpart to what PlexiveAndroidApplication does: start Koin once, adding the platform
// module whose TokenStorage cannot be discovered by the compiler plugin. The Swift entry point has
// to call this before showing MainViewController.
//
// UNVERIFIED, like everything else in iosMain: no Apple target has ever been compiled here.
fun initKoinIos() {
    initKoin {
        modules(iosSessionModule)
    }
}

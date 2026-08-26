package com.plexive.mobile.di

import com.plexive.mobile.core.session.iosSessionModule

// The iOS counterpart to what PlexiveAndroidApplication does: start Koin once, adding the platform
// module whose TokenStorage cannot be discovered by the compiler plugin. The Swift entry point has
// to call this before showing MainViewController.
//
// PARTLY VERIFIED, like everything else in iosMain: it type-checks under
// :shared:compileIosMainKotlinMetadata, but it has never been linked into a framework or run on a
// device or a simulator.
fun initKoinIos() {
    initKoin {
        modules(iosSessionModule)
    }
}

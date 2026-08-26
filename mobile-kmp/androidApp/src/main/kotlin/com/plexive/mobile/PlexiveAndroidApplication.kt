package com.plexive.mobile

import android.app.Application
import com.plexive.mobile.data.di.initKoin

// The Android platform entry point. Application.onCreate runs once per process, so Koin is
// started exactly once; starting it from an Activity would run again on every configuration
// change and throw KoinAppAlreadyStartedException.
class PlexiveAndroidApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        initKoin()
    }
}
